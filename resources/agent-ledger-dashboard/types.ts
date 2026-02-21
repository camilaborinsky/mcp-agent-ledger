import { z } from "zod";

const filtersSchema = z.object({
  agentId: z.string().optional(),
  from: z.string(),
  to: z.string(),
  currency: z.string(),
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

const expenseSummarySchema = z.object({
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
});

const balanceSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  startingMinor: z.number().int(),
  spentMinor: z.number().int(),
  remainingMinor: z.number().int(),
});

const balanceTotalsSchema = z.object({
  startingMinor: z.number().int(),
  spentMinor: z.number().int(),
  remainingMinor: z.number().int(),
});

export const propSchema = z.object({
  activeTool: z.enum(["getExpenses", "getBalance"]),
  provider: z.string(),
  filters: filtersSchema,
  expenses: z.array(expenseSchema),
  expenseSummary: expenseSummarySchema,
  balances: z.array(balanceSchema),
  balanceTotals: balanceTotalsSchema,
  asOf: z.string(),
});

export type AgentLedgerDashboardProps = z.infer<typeof propSchema>;
