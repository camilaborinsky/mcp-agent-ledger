export type LedgerProviderName = "mock" | "puzzle" | "manufact";

export type LedgerFiltersInput = {
  agentId?: string;
  from?: string;
  to?: string;
  currency?: string;
};

export type LedgerFilters = {
  agentId?: string;
  from: string;
  to: string;
  currency: string;
};

export type Expense = {
  id: string;
  agentId: string;
  agentName: string;
  category: string;
  vendor: string;
  description: string;
  amountMinor: number;
  occurredAt: string;
};

export type ExpenseByAgent = {
  agentId: string;
  agentName: string;
  totalExpenseMinor: number;
};

export type ExpenseByCategory = {
  category: string;
  totalExpenseMinor: number;
};

export type ExpensesSummary = {
  totalExpenseMinor: number;
  expenseCount: number;
  byAgent: ExpenseByAgent[];
  byCategory: ExpenseByCategory[];
};

export type GetExpensesResult = {
  currency: string;
  from: string;
  to: string;
  expenses: Expense[];
  summary: ExpensesSummary;
};

export type AgentBalance = {
  agentId: string;
  agentName: string;
  startingMinor: number;
  spentMinor: number;
  remainingMinor: number;
};

export type BalanceTotals = {
  startingMinor: number;
  spentMinor: number;
  remainingMinor: number;
};

export type GetBalanceResult = {
  currency: string;
  asOf: string;
  balances: AgentBalance[];
  totals: BalanceTotals;
};

export type TrackExpenseInput = {
  agentId: string;
  category: string;
  vendor: string;
  description: string;
  amountMinor: number;
  currency: string;
  occurredAt: string;
};

export type TrackExpenseResult = {
  currency: string;
  expense: Expense;
};
