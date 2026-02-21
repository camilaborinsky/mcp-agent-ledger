import { createHash } from "node:crypto";
import { MCPServer, error, object, widget } from "mcp-use/server";
import { z } from "zod";
import { getLedgerProvider } from "./src/ledger/provider-factory.js";
import { LedgerError } from "./src/ledger/provider.js";
import type {
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
  LedgerFiltersInput,
} from "./src/ledger/types.js";

const server = new MCPServer({
  name: "mcp-agent-ledger",
  title: "mcp-agent-ledger",
  version: "1.0.0",
  description: "MCP server exposing agent ledger tools and ChatGPT widget UI",
  baseUrl: process.env.MCP_URL || "http://localhost:3000",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

const DEFAULT_CURRENCY = "USD";
const DEFAULT_WINDOW_DAYS = 30;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const sharedInputSchema = z.object({
  agentId: z
    .string()
    .optional()
    .describe("Optional agent id to scope the query."),
  from: z
    .string()
    .optional()
    .describe("Start date in YYYY-MM-DD format. Defaults to last 30 days."),
  to: z
    .string()
    .optional()
    .describe("End date in YYYY-MM-DD format. Defaults to today."),
  currency: z
    .string()
    .optional()
    .describe("Currency code. Defaults to USD."),
});

const expenseSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  category: z.string(),
  vendor: z.string(),
  description: z.string(),
  amountMinor: z.number().int(),
  occurredAt: z.string(),
});

const getExpensesOutputSchema = z
  .object({
  currency: z.string(),
  from: z.string(),
  to: z.string(),
  expenses: z.array(expenseSchema),
  summary: z.object({
    totalExpenseMinor: z.number().int(),
    expenseCount: z.number().int(),
    byAgent: z.array(
      z.object({
        agentId: z.string(),
        agentName: z.string(),
        totalExpenseMinor: z.number().int(),
      })
    ),
    byCategory: z.array(
      z.object({
        category: z.string(),
        totalExpenseMinor: z.number().int(),
      })
    ),
  }),
  })
  .passthrough();

const getBalanceOutputSchema = z
  .object({
  currency: z.string(),
  asOf: z.string(),
  balances: z.array(
    z.object({
      agentId: z.string(),
      agentName: z.string(),
      startingMinor: z.number().int(),
      spentMinor: z.number().int(),
      remainingMinor: z.number().int(),
    })
  ),
  totals: z.object({
    startingMinor: z.number().int(),
    spentMinor: z.number().int(),
    remainingMinor: z.number().int(),
  }),
  })
  .passthrough();

server.tool(
  {
    name: "getExpenses",
    description: "Return agent expenses for a date range and render dashboard UI.",
    schema: sharedInputSchema,
    outputSchema: getExpensesOutputSchema,
    widget: {
      name: "agent-ledger-dashboard",
      invoking: "Loading expenses dashboard...",
      invoked: "Expenses dashboard ready",
    },
  },
  async (input) => {
    const startedAt = Date.now();
    let filtersForLog = safeNormalizeFilters(input);
    let providerName = process.env.LEDGER_PROVIDER?.toLowerCase().trim() || "mock";

    try {
      const filters = normalizeFilters(input);
      filtersForLog = filters;

      const provider = getLedgerProvider();
      providerName = provider.name;

      const [expensesResult, balanceResult] = await Promise.all([
        provider.getExpenses(filters),
        provider.getBalance(filters),
      ]);

      logToolResult({
        toolName: "getExpenses",
        providerName,
        filters,
        durationMs: Date.now() - startedAt,
        status: "ok",
      });

      return widget({
        props: buildWidgetProps(
          "getExpenses",
          providerName,
          filters,
          expensesResult,
          balanceResult
        ),
        output: object({
          ...expensesResult,
          ...buildWidgetProps(
            "getExpenses",
            providerName,
            filters,
            expensesResult,
            balanceResult
          ),
        }),
      });
    } catch (err) {
      logToolResult({
        toolName: "getExpenses",
        providerName,
        filters: filtersForLog,
        durationMs: Date.now() - startedAt,
        status: "error",
      });
      return toErrorResponse(err);
    }
  }
);

server.tool(
  {
    name: "getBalance",
    description: "Return agent balances for a date range and render dashboard UI.",
    schema: sharedInputSchema,
    outputSchema: getBalanceOutputSchema,
    widget: {
      name: "agent-ledger-dashboard",
      invoking: "Loading balances dashboard...",
      invoked: "Balances dashboard ready",
    },
  },
  async (input) => {
    const startedAt = Date.now();
    let filtersForLog = safeNormalizeFilters(input);
    let providerName = process.env.LEDGER_PROVIDER?.toLowerCase().trim() || "mock";

    try {
      const filters = normalizeFilters(input);
      filtersForLog = filters;

      const provider = getLedgerProvider();
      providerName = provider.name;

      const [expensesResult, balanceResult] = await Promise.all([
        provider.getExpenses(filters),
        provider.getBalance(filters),
      ]);

      logToolResult({
        toolName: "getBalance",
        providerName,
        filters,
        durationMs: Date.now() - startedAt,
        status: "ok",
      });

      return widget({
        props: buildWidgetProps(
          "getBalance",
          providerName,
          filters,
          expensesResult,
          balanceResult
        ),
        output: object({
          ...balanceResult,
          ...buildWidgetProps(
            "getBalance",
            providerName,
            filters,
            expensesResult,
            balanceResult
          ),
        }),
      });
    } catch (err) {
      logToolResult({
        toolName: "getBalance",
        providerName,
        filters: filtersForLog,
        durationMs: Date.now() - startedAt,
        status: "error",
      });
      return toErrorResponse(err);
    }
  }
);

function buildWidgetProps(
  activeTool: "getExpenses" | "getBalance",
  provider: string,
  filters: LedgerFilters,
  expensesResult: GetExpensesResult,
  balanceResult: GetBalanceResult
) {
  return {
    activeTool,
    provider,
    filters,
    expenses: expensesResult.expenses,
    expenseSummary: expensesResult.summary,
    balances: balanceResult.balances,
    balanceTotals: balanceResult.totals,
    asOf: balanceResult.asOf,
  };
}

function normalizeFilters(input: LedgerFiltersInput): LedgerFilters {
  const normalizedAgentId = input.agentId?.trim() || undefined;
  const normalizedCurrency =
    input.currency?.trim().toUpperCase() || DEFAULT_CURRENCY;

  if (input.from && !ISO_DATE_PATTERN.test(input.from)) {
    throw new LedgerError(
      "INVALID_DATE",
      `Invalid from date format: ${input.from}. Expected YYYY-MM-DD.`
    );
  }

  if (input.to && !ISO_DATE_PATTERN.test(input.to)) {
    throw new LedgerError(
      "INVALID_DATE",
      `Invalid to date format: ${input.to}. Expected YYYY-MM-DD.`
    );
  }

  const dateRange = resolveDateRange(input.from, input.to);

  if (dateRange.from > dateRange.to) {
    throw new LedgerError(
      "INVALID_DATE_RANGE",
      `Invalid date range. \"from\" (${dateRange.from}) must be less than or equal to \"to\" (${dateRange.to}).`
    );
  }

  return {
    agentId: normalizedAgentId,
    from: dateRange.from,
    to: dateRange.to,
    currency: normalizedCurrency,
  };
}

function safeNormalizeFilters(input: LedgerFiltersInput): LedgerFilters {
  try {
    return normalizeFilters(input);
  } catch {
    const today = toDateString(new Date());
    return {
      from: today,
      to: today,
      currency: input.currency?.trim().toUpperCase() || DEFAULT_CURRENCY,
      agentId: input.agentId?.trim() || undefined,
    };
  }
}

function resolveDateRange(
  fromInput?: string,
  toInput?: string
): { from: string; to: string } {
  const now = new Date();
  const defaultTo = toDateString(now);

  const toDate = toInput ? parseUtcDay(toInput) : parseUtcDay(defaultTo);
  const fromDate = fromInput
    ? parseUtcDay(fromInput)
    : shiftDays(toDate, -(DEFAULT_WINDOW_DAYS - 1));

  return {
    from: toDateString(fromDate),
    to: toDateString(toDate),
  };
}

function parseUtcDay(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toErrorResponse(err: unknown): any {
  if (err instanceof LedgerError) {
    return error(
      JSON.stringify({
        code: err.code,
        message: err.message,
      })
    );
  }

  return error(
    JSON.stringify({
      code: "INTERNAL_ERROR",
      message: err instanceof Error ? err.message : "Unexpected error",
    })
  );
}

function hashFilters(filters: LedgerFilters): string {
  return createHash("sha256")
    .update(JSON.stringify(filters))
    .digest("hex")
    .slice(0, 12);
}

function logToolResult(params: {
  toolName: string;
  providerName: string;
  filters: LedgerFilters;
  durationMs: number;
  status: "ok" | "error";
}): void {
  const { toolName, providerName, filters, durationMs, status } = params;
  console.log(
    `[ledger-tool] tool=${toolName} provider=${providerName} filters=${hashFilters(filters)} durationMs=${durationMs} status=${status}`
  );
}

server.listen().then(() => {
  console.log("Server running");
});
