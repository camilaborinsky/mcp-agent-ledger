import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getPuzzleDatabase, toPuzzleDatabaseError } from "./db/client.js";
import { agents, expenses } from "./db/schema.js";
import { LedgerError, type LedgerProvider } from "./provider.js";
import type {
  Expense,
  ExpenseByAgent,
  ExpenseByCategory,
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
  TrackExpenseInput,
  TrackExpenseResult,
} from "./types.js";

export class PuzzleLedgerProvider implements LedgerProvider {
  name = "puzzle" as const;

  async getExpenses(filters: LedgerFilters): Promise<GetExpensesResult> {
    assertUsdCurrency(filters.currency);

    const fromDate = toStartOfDay(filters.from);
    const toDate = toEndOfDay(filters.to);

    const whereClause = and(
      gte(expenses.occurredAt, fromDate),
      lte(expenses.occurredAt, toDate),
      eq(expenses.currency, filters.currency),
      filters.agentId ? eq(expenses.agentId, filters.agentId) : undefined
    );

    try {
      const db = getPuzzleDatabase();
      const [expenseRows, totalsRows, byAgentRows, byCategoryRows] =
        await Promise.all([
          db
            .select({
              id: expenses.id,
              agentId: expenses.agentId,
              agentName: agents.name,
              category: expenses.category,
              vendor: expenses.vendor,
              description: expenses.description,
              amountMinor: expenses.amountMinor,
              occurredAt: expenses.occurredAt,
            })
            .from(expenses)
            .innerJoin(agents, eq(expenses.agentId, agents.id))
            .where(whereClause)
            .orderBy(desc(expenses.occurredAt)),
          db
            .select({
              totalExpenseMinor:
                sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int`,
              expenseCount: sql<number>`count(*)::int`,
            })
            .from(expenses)
            .where(whereClause),
          db
            .select({
              agentId: expenses.agentId,
              agentName: agents.name,
              totalExpenseMinor:
                sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int`,
            })
            .from(expenses)
            .innerJoin(agents, eq(expenses.agentId, agents.id))
            .where(whereClause)
            .groupBy(expenses.agentId, agents.name),
          db
            .select({
              category: expenses.category,
              totalExpenseMinor:
                sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int`,
            })
            .from(expenses)
            .where(whereClause)
            .groupBy(expenses.category),
        ]);

      const mappedExpenses: Expense[] = expenseRows.map((row) => ({
        id: row.id,
        agentId: row.agentId,
        agentName: row.agentName,
        category: row.category,
        vendor: row.vendor,
        description: row.description,
        amountMinor: toInt(row.amountMinor),
        occurredAt: toIsoString(row.occurredAt),
      }));

      const byAgent: ExpenseByAgent[] = byAgentRows
        .map((row) => ({
          agentId: row.agentId,
          agentName: row.agentName,
          totalExpenseMinor: toInt(row.totalExpenseMinor),
        }))
        .sort((a, b) => b.totalExpenseMinor - a.totalExpenseMinor);

      const byCategory: ExpenseByCategory[] = byCategoryRows
        .map((row) => ({
          category: row.category,
          totalExpenseMinor: toInt(row.totalExpenseMinor),
        }))
        .sort((a, b) => b.totalExpenseMinor - a.totalExpenseMinor);

      const totals = totalsRows[0];

      return {
        currency: filters.currency,
        from: filters.from,
        to: filters.to,
        expenses: mappedExpenses,
        summary: {
          totalExpenseMinor: toInt(totals?.totalExpenseMinor),
          expenseCount: toInt(totals?.expenseCount),
          byAgent,
          byCategory,
        },
      };
    } catch (err) {
      throw toPuzzleDatabaseError(err, "Failed to fetch Puzzle expenses.");
    }
  }

  async getBalance(filters: LedgerFilters): Promise<GetBalanceResult> {
    assertUsdCurrency(filters.currency);

    const fromDate = toStartOfDay(filters.from);
    const toDate = toEndOfDay(filters.to);

    const spentWhereClause = and(
      gte(expenses.occurredAt, fromDate),
      lte(expenses.occurredAt, toDate),
      eq(expenses.currency, filters.currency),
      filters.agentId ? eq(expenses.agentId, filters.agentId) : undefined
    );

    try {
      const db = getPuzzleDatabase();

      const selectedAgents = filters.agentId
        ? await db
            .select({
              agentId: agents.id,
              agentName: agents.name,
              startingMinor: agents.startingMinor,
            })
            .from(agents)
            .where(eq(agents.id, filters.agentId))
        : await db
            .select({
              agentId: agents.id,
              agentName: agents.name,
              startingMinor: agents.startingMinor,
            })
            .from(agents);

      const spentRows = await db
        .select({
          agentId: expenses.agentId,
          spentMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)::int`,
        })
        .from(expenses)
        .where(spentWhereClause)
        .groupBy(expenses.agentId);

      const spentByAgent = new Map(
        spentRows.map((row) => [row.agentId, toInt(row.spentMinor)])
      );

      const balances = selectedAgents.map((agent) => {
        const startingMinor = toInt(agent.startingMinor);
        const spentMinor = spentByAgent.get(agent.agentId) ?? 0;
        return {
          agentId: agent.agentId,
          agentName: agent.agentName,
          startingMinor,
          spentMinor,
          remainingMinor: startingMinor - spentMinor,
        };
      });

      const totals = balances.reduce(
        (acc, item) => {
          acc.startingMinor += item.startingMinor;
          acc.spentMinor += item.spentMinor;
          acc.remainingMinor += item.remainingMinor;
          return acc;
        },
        { startingMinor: 0, spentMinor: 0, remainingMinor: 0 }
      );

      return {
        currency: filters.currency,
        asOf: new Date().toISOString(),
        balances,
        totals,
      };
    } catch (err) {
      throw toPuzzleDatabaseError(err, "Failed to fetch Puzzle balances.");
    }
  }

  async trackExpense(input: TrackExpenseInput): Promise<TrackExpenseResult> {
    assertUsdCurrency(input.currency);
    const traceId = buildTrackExpenseTraceId(input.agentId);
    let stage = "start";

    logTrackExpenseFlow({
      traceId,
      stage,
      status: "ok",
      agentId: input.agentId,
      currency: input.currency,
      amountMinor: input.amountMinor,
      occurredAt: input.occurredAt,
    });

    try {
      stage = "connect-db";
      const db = getPuzzleDatabase();

      stage = "validate-occurredAt";
      const occurredAt = new Date(input.occurredAt);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new LedgerError(
          "INVALID_DATE",
          `Invalid occurredAt timestamp: ${input.occurredAt}. Expected ISO-8601 date-time.`
        );
      }

      stage = "upsert-agent";
      const insertedAgents = await db
        .insert(agents)
        .values({
          id: input.agentId,
          name: input.agentId,
          startingMinor: 0,
          currency: "USD",
        })
        .onConflictDoNothing({ target: agents.id })
        .returning({
          id: agents.id,
        });

      const wasAgentCreated = insertedAgents.length > 0;
      logTrackExpenseFlow({
        traceId,
        stage: "agent-upserted",
        status: "ok",
        agentId: input.agentId,
        wasAgentCreated,
      });

      stage = "load-agent";
      const [agent] = await db
        .select({
          id: agents.id,
          name: agents.name,
        })
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1);

      if (!agent) {
        throw new LedgerError(
          "PROVIDER_UNAVAILABLE",
          `Failed to load agent ${input.agentId} after upsert.`
        );
      }

      stage = "insert-expense";
      const [inserted] = await db
        .insert(expenses)
        .values({
          agentId: input.agentId,
          category: input.category,
          vendor: input.vendor,
          description: input.description,
          amountMinor: input.amountMinor,
          currency: input.currency,
          occurredAt,
        })
        .returning({
          id: expenses.id,
          agentId: expenses.agentId,
          category: expenses.category,
          vendor: expenses.vendor,
          description: expenses.description,
          amountMinor: expenses.amountMinor,
          occurredAt: expenses.occurredAt,
        });

      if (!inserted) {
        throw new LedgerError(
          "PROVIDER_UNAVAILABLE",
          "Failed to persist Puzzle expense."
        );
      }

      logTrackExpenseFlow({
        traceId,
        stage: "expense-inserted",
        status: "ok",
        agentId: input.agentId,
        expenseId: inserted.id,
        wasAgentCreated,
      });

      return {
        currency: input.currency,
        expense: {
          id: inserted.id,
          agentId: inserted.agentId,
          agentName: agent.name,
          category: inserted.category,
          vendor: inserted.vendor,
          description: inserted.description,
          amountMinor: toInt(inserted.amountMinor),
          occurredAt: toIsoString(inserted.occurredAt),
        },
      };
    } catch (err) {
      logTrackExpenseFlow({
        traceId,
        stage,
        status: "error",
        agentId: input.agentId,
        errorCode: err instanceof LedgerError ? err.code : "INTERNAL_ERROR",
        errorMessage: err instanceof Error ? err.message : "Unexpected error",
      });

      if (err instanceof LedgerError) {
        throw err;
      }
      throw toPuzzleDatabaseError(err, "Failed to track Puzzle expense.");
    }
  }
}

function assertUsdCurrency(currency: string): void {
  if (currency !== "USD") {
    throw new LedgerError(
      "UNSUPPORTED_CURRENCY",
      `Puzzle provider supports USD only. Received currency: ${currency}`
    );
  }
}

function toStartOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function toEndOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T23:59:59.999Z`);
}

function toIsoString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

function toInt(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function buildTrackExpenseTraceId(agentId: string): string {
  const normalizedAgentId = agentId.trim() || "unknown-agent";
  return `${normalizedAgentId}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function logTrackExpenseFlow(params: {
  traceId: string;
  stage: string;
  status: "ok" | "error";
  agentId: string;
  currency?: string;
  amountMinor?: number;
  occurredAt?: string;
  wasAgentCreated?: boolean;
  expenseId?: string;
  errorCode?: string;
  errorMessage?: string;
}): void {
  console.log(`[track-expense] ${JSON.stringify(params)}`);
}
