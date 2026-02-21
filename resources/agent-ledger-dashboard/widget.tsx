import {
  McpUseProvider,
  useWidget,
  type WidgetMetadata,
} from "mcp-use/react";
import React from "react";
import "../styles.css";
import type { AgentLedgerDashboardProps } from "./types";
import { propSchema } from "./types";

export const widgetMetadata: WidgetMetadata = {
  description: "Display a read-only dashboard of agent expenses and balances.",
  props: propSchema,
  exposeAsTool: false,
  metadata: {
    prefersBorder: false,
    invoking: "Loading ledger dashboard...",
    invoked: "Ledger dashboard ready",
  },
};

function formatMoney(
  amountMinor: number,
  currency: string,
  locale?: string
): string {
  return new Intl.NumberFormat(locale ?? "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

function formatTimestamp(value: string, locale?: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale ?? "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MetricCard(props: { label: string; value: string; caption: string }) {
  const { label, value, caption } = props;

  return (
    <article className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{caption}</p>
    </article>
  );
}

const AgentLedgerDashboard: React.FC = () => {
  const { props, isPending, locale } = useWidget<AgentLedgerDashboardProps>();
  const parsed = propSchema.safeParse(props);

  if (isPending || !parsed.success) {
    return (
      <McpUseProvider autoSize>
        <div className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-sm">
          <div className="mb-6">
            <div className="h-4 w-48 animate-pulse rounded-md bg-[hsl(var(--muted))]" />
            <div className="mt-3 h-9 w-80 animate-pulse rounded-md bg-[hsl(var(--muted))]" />
          </div>
          <div className="mb-6 grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={`kpi-skeleton-${idx}`}
                className="h-28 animate-pulse rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]"
              />
            ))}
          </div>
          <div className="h-56 animate-pulse rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]" />
        </div>
      </McpUseProvider>
    );
  }

  const data = parsed.data;

  const recentExpenses = [...data.expenses]
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
    .slice(0, 10);

  const agentScope = data.filters.agentId ? data.filters.agentId : "all agents";

  return (
    <McpUseProvider autoSize>
      <div className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-6 shadow-sm">
        <header className="mb-6">
          <span className="inline-flex items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2.5 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))]">
            Agent Ledger Dashboard
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Expenses and Balances
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Source: <strong>{data.provider}</strong> | View: {data.activeTool} |
            Scope: {agentScope} | Range: {data.filters.from} to {data.filters.to}
          </p>
        </header>

        <section className="mb-6 grid gap-3 md:grid-cols-3">
          <MetricCard
            label="Total Spent"
            value={formatMoney(
              data.expenseSummary.totalExpenseMinor,
              data.filters.currency,
              locale
            )}
            caption={`${data.expenseSummary.expenseCount} expense entries`}
          />
          <MetricCard
            label="Total Remaining"
            value={formatMoney(
              data.balanceTotals.remainingMinor,
              data.filters.currency,
              locale
            )}
            caption={`As of ${formatTimestamp(data.asOf, locale)}`}
          />
          <MetricCard
            label="Agents in Scope"
            value={`${data.balances.length}`}
            caption={`Currency: ${data.filters.currency}`}
          />
        </section>

        <section className="mb-6">
          <h3 className="mb-3 text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Agent Balances
          </h3>
          {data.balances.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              No balances found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--muted))]">
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Agent
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Starting
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Spent
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Remaining
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.balances.map((item) => (
                    <tr key={item.agentId}>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {item.agentName}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {formatMoney(
                          item.startingMinor,
                          data.filters.currency,
                          locale
                        )}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {formatMoney(item.spentMinor, data.filters.currency, locale)}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                        {formatMoney(
                          item.remainingMinor,
                          data.filters.currency,
                          locale
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-3 text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
            Recent Expenses
          </h3>
          {recentExpenses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
              No expenses found for the selected filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--muted))]">
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Date
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Agent
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Vendor
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Description
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentExpenses.map((item) => (
                    <tr key={item.id}>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {formatTimestamp(item.occurredAt, locale)}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {item.agentName}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {item.vendor}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 capitalize text-[hsl(var(--foreground))]">
                        {item.category}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 text-[hsl(var(--foreground))]">
                        {item.description}
                      </td>
                      <td className="border-t border-[hsl(var(--border))] px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                        {formatMoney(item.amountMinor, data.filters.currency, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </McpUseProvider>
  );
};

export default AgentLedgerDashboard;
