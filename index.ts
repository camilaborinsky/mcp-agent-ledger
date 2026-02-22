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
  TrackExpenseInput,
} from "./src/ledger/types.js";

// Bump version when you change the widget UI so clients (e.g. ChatGPT) refetch the widget bundle instead of using a cached one.
const server = new MCPServer({
  name: "mcp-agent-ledger",
  title: "mcp-agent-ledger",
  version: "1.1.0",
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

const trackExpenseInputSchema = z.object({
  agentId: z.string().describe("Agent id that incurred the expense."),
  category: z
    .string()
    .describe("Expense category, for example software or infrastructure."),
  vendor: z.string().describe("Vendor or payee name."),
  description: z.string().describe("Human-readable expense description."),
  amountMinor: z
    .number()
    .int()
    .positive()
    .describe("Expense amount in minor units (for USD, cents)."),
  currency: z
    .string()
    .optional()
    .describe("Currency code. Defaults to USD."),
  occurredAt: z
    .string()
    .optional()
    .describe("Expense timestamp in ISO-8601 format. Defaults to now."),
});

const trackExpenseOutputSchema = z
  .object({
    currency: z.string(),
    expense: expenseSchema,
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
    name: "trackExpense",
    description: "Record an expense entry for an agent.",
    schema: trackExpenseInputSchema,
    outputSchema: trackExpenseOutputSchema,
  },
  async (input) => {
    const startedAt = Date.now();
    const rawInputForLog = {
      agentId: input.agentId,
      currency: input.currency,
      amountMinor: input.amountMinor,
      occurredAt: input.occurredAt,
    };
    let filtersForLog = safeNormalizeFilters({
      agentId: input.agentId,
      currency: input.currency,
    });
    let providerName = process.env.LEDGER_PROVIDER?.toLowerCase().trim() || "mock";

    try {
      const normalizedInput = normalizeTrackExpenseInput(input);
      const provider = getLedgerProvider();
      providerName = provider.name;

      const result = await provider.trackExpense(normalizedInput);
      filtersForLog = buildTrackExpenseLogFilters(normalizedInput);

      logToolResult({
        toolName: "trackExpense",
        providerName,
        filters: filtersForLog,
        durationMs: Date.now() - startedAt,
        status: "ok",
      });

      return object(result);
    } catch (err) {
      logTrackExpenseToolError({
        providerName,
        input: rawInputForLog,
        err,
      });
      logToolResult({
        toolName: "trackExpense",
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

function normalizeTrackExpenseInput(input: {
  agentId: string;
  category: string;
  vendor: string;
  description: string;
  amountMinor: number;
  currency?: string;
  occurredAt?: string;
}): TrackExpenseInput {
  const agentId = input.agentId.trim();
  if (!agentId) {
    throw new LedgerError("INVALID_AGENT", "agentId is required.");
  }

  const category = input.category.trim();
  if (!category) {
    throw new LedgerError("INVALID_CATEGORY", "category is required.");
  }

  const vendor = input.vendor.trim();
  if (!vendor) {
    throw new LedgerError("INVALID_VENDOR", "vendor is required.");
  }

  const description = input.description.trim();
  if (!description) {
    throw new LedgerError("INVALID_DESCRIPTION", "description is required.");
  }

  const occurredAt = normalizeOccurredAt(input.occurredAt);
  const currency = input.currency?.trim().toUpperCase() || DEFAULT_CURRENCY;

  return {
    agentId,
    category,
    vendor,
    description,
    amountMinor: input.amountMinor,
    currency,
    occurredAt,
  };
}

function normalizeOccurredAt(occurredAt?: string): string {
  if (!occurredAt) {
    return new Date().toISOString();
  }

  const normalized = occurredAt.trim();
  const timestamp = Date.parse(normalized);

  if (Number.isNaN(timestamp)) {
    throw new LedgerError(
      "INVALID_DATE",
      `Invalid occurredAt date format: ${occurredAt}. Expected ISO-8601 date-time.`
    );
  }

  return new Date(timestamp).toISOString();
}

function buildTrackExpenseLogFilters(input: TrackExpenseInput): LedgerFilters {
  const day = input.occurredAt.slice(0, 10);
  return {
    agentId: input.agentId,
    from: day,
    to: day,
    currency: input.currency,
  };
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

function logTrackExpenseToolError(params: {
  providerName: string;
  input: {
    agentId: string;
    currency?: string;
    amountMinor: number;
    occurredAt?: string;
  };
  err: unknown;
}): void {
  const { providerName, input, err } = params;
  const errorCode = err instanceof LedgerError ? err.code : "INTERNAL_ERROR";
  const errorMessage = err instanceof Error ? err.message : "Unexpected error";

  console.error(
    `[track-expense-tool-error] provider=${providerName} agentId=${input.agentId} currency=${input.currency || DEFAULT_CURRENCY} amountMinor=${input.amountMinor} occurredAt=${input.occurredAt || "<default-now>"} errorCode=${errorCode} errorMessage=${JSON.stringify(errorMessage)}`
  );
}

server.listen().then(() => {
  console.log("Server running");
});
