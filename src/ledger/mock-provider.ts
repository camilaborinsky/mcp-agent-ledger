import type {
  AgentBalance,
  Expense,
  ExpenseByAgent,
  ExpenseByCategory,
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
  TrackExpenseInput,
  TrackExpenseResult,
} from "./types.js";
import { LedgerError, type LedgerProvider } from "./provider.js";

const AGENTS = [
  { id: "agent-atlas", name: "Atlas" },
  { id: "agent-beacon", name: "Beacon" },
  { id: "agent-cipher", name: "Cipher" },
] as const;

const STARTING_BALANCE_BY_AGENT: Record<string, number> = {
  "agent-atlas": 250_000,
  "agent-beacon": 180_000,
  "agent-cipher": 220_000,
};

const SEED_MOCK_EXPENSES: Expense[] = [
  {
    id: "exp-001",
    agentId: "agent-atlas",
    agentName: "Atlas",
    category: "software",
    vendor: "OpenAI",
    description: "Model usage credits",
    amountMinor: 18_400,
    occurredAt: "2026-02-20T16:12:00.000Z",
  },
  {
    id: "exp-002",
    agentId: "agent-beacon",
    agentName: "Beacon",
    category: "infrastructure",
    vendor: "AWS",
    description: "Compute instances",
    amountMinor: 29_900,
    occurredAt: "2026-02-18T09:05:00.000Z",
  },
  {
    id: "exp-003",
    agentId: "agent-cipher",
    agentName: "Cipher",
    category: "travel",
    vendor: "Delta",
    description: "Hackathon travel",
    amountMinor: 44_500,
    occurredAt: "2026-02-15T11:42:00.000Z",
  },
  {
    id: "exp-004",
    agentId: "agent-atlas",
    agentName: "Atlas",
    category: "operations",
    vendor: "Notion",
    description: "Workspace subscription",
    amountMinor: 5_000,
    occurredAt: "2026-02-12T10:17:00.000Z",
  },
  {
    id: "exp-005",
    agentId: "agent-cipher",
    agentName: "Cipher",
    category: "software",
    vendor: "Linear",
    description: "Issue tracking seats",
    amountMinor: 6_800,
    occurredAt: "2026-02-11T13:20:00.000Z",
  },
  {
    id: "exp-006",
    agentId: "agent-beacon",
    agentName: "Beacon",
    category: "operations",
    vendor: "Slack",
    description: "Comms plan",
    amountMinor: 3_100,
    occurredAt: "2026-02-08T18:30:00.000Z",
  },
  {
    id: "exp-007",
    agentId: "agent-atlas",
    agentName: "Atlas",
    category: "travel",
    vendor: "Marriott",
    description: "Project kickoff lodging",
    amountMinor: 21_300,
    occurredAt: "2026-02-05T21:00:00.000Z",
  },
  {
    id: "exp-008",
    agentId: "agent-beacon",
    agentName: "Beacon",
    category: "infrastructure",
    vendor: "Cloudflare",
    description: "Edge traffic",
    amountMinor: 8_400,
    occurredAt: "2026-02-03T07:44:00.000Z",
  },
  {
    id: "exp-009",
    agentId: "agent-cipher",
    agentName: "Cipher",
    category: "operations",
    vendor: "Figma",
    description: "Design seat",
    amountMinor: 4_500,
    occurredAt: "2026-01-30T10:58:00.000Z",
  },
  {
    id: "exp-010",
    agentId: "agent-atlas",
    agentName: "Atlas",
    category: "software",
    vendor: "GitHub",
    description: "Enterprise add-ons",
    amountMinor: 7_200,
    occurredAt: "2026-01-26T15:25:00.000Z",
  },
];

const AGENT_BY_ID: Map<string, (typeof AGENTS)[number]> = new Map(
  AGENTS.map((agent) => [agent.id, agent] as const)
);
let mockExpenses: Expense[] = [...SEED_MOCK_EXPENSES];

function toStartOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

function toEndOfDay(dateIso: string): Date {
  return new Date(`${dateIso}T23:59:59.999Z`);
}

function sortByNewest(a: Expense, b: Expense): number {
  return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
}

export class MockLedgerProvider implements LedgerProvider {
  name = "mock" as const;

  async getExpenses(filters: LedgerFilters): Promise<GetExpensesResult> {
    if (filters.currency !== "USD") {
      throw new LedgerError(
        "UNSUPPORTED_CURRENCY",
        `Mock provider supports USD only. Received currency: ${filters.currency}`
      );
    }

    const expenses = this.getFilteredExpenses(filters).sort(sortByNewest);

    return {
      currency: filters.currency,
      from: filters.from,
      to: filters.to,
      expenses,
      summary: {
        totalExpenseMinor: expenses.reduce((sum, item) => sum + item.amountMinor, 0),
        expenseCount: expenses.length,
        byAgent: summarizeByAgent(expenses),
        byCategory: summarizeByCategory(expenses),
      },
    };
  }

  async getBalance(filters: LedgerFilters): Promise<GetBalanceResult> {
    if (filters.currency !== "USD") {
      throw new LedgerError(
        "UNSUPPORTED_CURRENCY",
        `Mock provider supports USD only. Received currency: ${filters.currency}`
      );
    }

    const filteredExpenses = this.getFilteredExpenses(filters);
    const selectedAgents = AGENTS.filter(
      (agent) => !filters.agentId || agent.id === filters.agentId
    );

    const spentByAgent = filteredExpenses.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.agentId] = (acc[item.agentId] ?? 0) + item.amountMinor;
        return acc;
      },
      {}
    );

    const balances: AgentBalance[] = selectedAgents.map((agent) => {
      const startingMinor = STARTING_BALANCE_BY_AGENT[agent.id] ?? 0;
      const spentMinor = spentByAgent[agent.id] ?? 0;
      return {
        agentId: agent.id,
        agentName: agent.name,
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
  }

  async trackExpense(input: TrackExpenseInput): Promise<TrackExpenseResult> {
    if (input.currency !== "USD") {
      throw new LedgerError(
        "UNSUPPORTED_CURRENCY",
        `Mock provider supports USD only. Received currency: ${input.currency}`
      );
    }

    const agent = AGENT_BY_ID.get(input.agentId);
    if (!agent) {
      throw new LedgerError(
        "INVALID_AGENT",
        `Unknown agent id: ${input.agentId}.`
      );
    }

    const normalizedAmount = Math.trunc(input.amountMinor);
    if (normalizedAmount <= 0) {
      throw new LedgerError(
        "INVALID_AMOUNT",
        "amountMinor must be a positive integer."
      );
    }

    const occurredAtMs = Date.parse(input.occurredAt);
    if (Number.isNaN(occurredAtMs)) {
      throw new LedgerError(
        "INVALID_DATE",
        `Invalid occurredAt timestamp: ${input.occurredAt}. Expected ISO-8601 date-time.`
      );
    }

    const expense: Expense = {
      id: nextExpenseId(),
      agentId: agent.id,
      agentName: agent.name,
      category: input.category,
      vendor: input.vendor,
      description: input.description,
      amountMinor: normalizedAmount,
      occurredAt: new Date(occurredAtMs).toISOString(),
    };

    mockExpenses = [...mockExpenses, expense];

    return {
      currency: input.currency,
      expense,
    };
  }

  private getFilteredExpenses(filters: LedgerFilters): Expense[] {
    const fromTime = toStartOfDay(filters.from).getTime();
    const toTime = toEndOfDay(filters.to).getTime();

    return mockExpenses.filter((item) => {
      const itemTime = new Date(item.occurredAt).getTime();
      const matchesDate = itemTime >= fromTime && itemTime <= toTime;
      const matchesAgent = !filters.agentId || item.agentId === filters.agentId;
      return matchesDate && matchesAgent;
    });
  }
}

function nextExpenseId(): string {
  const nextOrdinal =
    mockExpenses.reduce((max, item) => {
      const matched = /^exp-(\d+)$/.exec(item.id);
      if (!matched) {
        return max;
      }
      return Math.max(max, Number.parseInt(matched[1], 10));
    }, 0) + 1;

  return `exp-${String(nextOrdinal).padStart(3, "0")}`;
}

function summarizeByAgent(expenses: Expense[]): ExpenseByAgent[] {
  const byAgentMap = new Map<string, ExpenseByAgent>();

  for (const item of expenses) {
    const existing = byAgentMap.get(item.agentId);
    if (!existing) {
      byAgentMap.set(item.agentId, {
        agentId: item.agentId,
        agentName: item.agentName,
        totalExpenseMinor: item.amountMinor,
      });
      continue;
    }

    existing.totalExpenseMinor += item.amountMinor;
  }

  return [...byAgentMap.values()].sort(
    (a, b) => b.totalExpenseMinor - a.totalExpenseMinor
  );
}

function summarizeByCategory(expenses: Expense[]): ExpenseByCategory[] {
  const byCategoryMap = new Map<string, ExpenseByCategory>();

  for (const item of expenses) {
    const existing = byCategoryMap.get(item.category);
    if (!existing) {
      byCategoryMap.set(item.category, {
        category: item.category,
        totalExpenseMinor: item.amountMinor,
      });
      continue;
    }

    existing.totalExpenseMinor += item.amountMinor;
  }

  return [...byCategoryMap.values()].sort(
    (a, b) => b.totalExpenseMinor - a.totalExpenseMinor
  );
}
