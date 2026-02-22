import {
  McpUseProvider,
  useWidget,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import React, { useState, useMemo } from "react";
import "../styles.css";
import type { AgentLedgerDashboardProps } from "./types";
import { propSchema } from "./types";

type TabId = "overview" | "byAgent" | "byCategory";
type ExpenseSort = "dateDesc" | "dateAsc" | "amountDesc" | "amountAsc" | "vendor";

type ExpenseItem = {
  id: string;
  agentId: string;
  agentName: string;
  category: string;
  vendor: string;
  description: string;
  amountMinor: number;
  occurredAt: string;
};

type ExpenseSummaryLike = {
  totalExpenseMinor: number;
  expenseCount: number;
  byCategory: Array<{ category: string; totalExpenseMinor: number }>;
};

/** Known agents; any other ID is treated as unknown for the alert banner. */
const KNOWN_AGENT_IDS = ["marketing-agent", "research-agent"];

function isUnknownAgent(agentId: string): boolean {
  return !KNOWN_AGENT_IDS.includes(agentId);
}

function formatTimestampFull(value: string, locale?: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale ?? "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export const widgetMetadata: WidgetMetadata = {
  description:
    "Interactive dashboard of agent expenses and balances with filters, track expense form, and AI actions.",
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

/** Budget progress bar: green &lt;70%, yellow 70–90%, red &gt;90%. No budget = muted text + Ask AI link. */
function BudgetBar(props: {
  spentMinor: number;
  budgetMinor?: number;
  currency: string;
  locale?: string;
  agentId: string;
  agentName: string;
  onAskAiSetBudget: (agentId: string, agentName: string) => void;
}) {
  const {
    spentMinor,
    budgetMinor,
    currency,
    locale,
    agentId,
    agentName,
    onAskAiSetBudget,
  } = props;

  if (budgetMinor == null || budgetMinor <= 0) {
    return (
      <div className="text-sm text-[hsl(var(--muted-foreground))]">
        No budget set.{" "}
        <button
          type="button"
          onClick={() => onAskAiSetBudget(agentId, agentName)}
          className="underline hover:no-underline focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] rounded"
        >
          Ask AI to set one
        </button>
      </div>
    );
  }

  const pct = Math.min(100, (spentMinor / budgetMinor) * 100);
  const barColor =
    pct < 70 ? "bg-green-500" : pct < 90 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-[hsl(var(--muted-foreground))]">
        <span>
          {formatMoney(spentMinor, currency, locale)} /{" "}
          {formatMoney(budgetMinor, currency, locale)}
        </span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full ${barColor} transition-[width]`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-[hsl(var(--border))] border-t-[hsl(var(--foreground))] ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

function AgentDetailView(props: {
  agentId: string;
  balance: { agentId: string; agentName: string; startingMinor: number; spentMinor: number; remainingMinor: number } | undefined;
  agentDetailData: {
    expenses: ExpenseItem[];
    expenseSummary: ExpenseSummaryLike;
    currency: string;
    from: string;
    to: string;
  } | null;
  getExpensesPending: boolean;
  currency: string;
  locale?: string;
  onBack: () => void;
  onAskAiAnalyze: (agentId: string) => void;
  onAskAiSetBudget: (agentId: string, agentName: string) => void;
  onAskAiExpense: (exp: ExpenseItem) => void;
  isUnknownAgent: boolean;
  expandedExpenseId: string | null;
  onToggleExpand: (id: string | null) => void;
  formatMoney: (amountMinor: number, currency: string, locale?: string) => string;
  formatTimestamp: (value: string, locale?: string) => string;
  formatTimestampFull: (value: string, locale?: string) => string;
}) {
  const [detailPage, setDetailPage] = useState(1);
  const {
    agentId,
    balance,
    agentDetailData,
    getExpensesPending,
    currency,
    locale,
    onBack,
    onAskAiAnalyze,
    onAskAiSetBudget,
    onAskAiExpense,
    isUnknownAgent,
    expandedExpenseId,
    onToggleExpand,
    formatMoney,
    formatTimestamp,
    formatTimestampFull,
  } = props;

  const agentName = balance?.agentName ?? agentId;
  const expenses = agentDetailData?.expenses ?? [];
  const summary = agentDetailData?.expenseSummary;
  const totalPages = Math.max(1, Math.ceil(expenses.length / EXPENSE_PAGE_SIZE));
  const paginated = expenses.slice(
    (detailPage - 1) * EXPENSE_PAGE_SIZE,
    detailPage * EXPENSE_PAGE_SIZE
  );

  if (getExpensesPending && !agentDetailData) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-[hsl(var(--foreground))] hover:underline focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] rounded"
        >
          ← All agents
        </button>
        <div className="h-32 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
        <div className="h-64 animate-pulse rounded-lg bg-[hsl(var(--muted))]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-[hsl(var(--foreground))] hover:underline focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] rounded"
      >
        ← All agents
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-semibold text-[hsl(var(--foreground))]">
          {agentName}
        </h3>
        {isUnknownAgent && (
          <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
            ⚠️ Unregistered
          </span>
        )}
      </div>

      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Total spent: {summary ? formatMoney(summary.totalExpenseMinor, currency, locale) : "—"} · {summary?.expenseCount ?? 0} transactions
        </p>
        {balance && (
          <div className="mt-2">
            <BudgetBar
              spentMinor={balance.spentMinor}
              budgetMinor={undefined}
              currency={currency}
              locale={locale}
              agentId={balance.agentId}
              agentName={balance.agentName}
              onAskAiSetBudget={onAskAiSetBudget}
            />
          </div>
        )}
      </div>

      {summary && summary.byCategory.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">Category breakdown</h4>
          <div className="flex flex-wrap gap-2">
            {summary.byCategory.map((c) => (
              <span
                key={c.category}
                className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-2 py-1 text-sm"
              >
                {c.category}: {formatMoney(c.totalExpenseMinor, currency, locale)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-sm font-medium text-[hsl(var(--foreground))]">Expenses</h4>
          <button
            type="button"
            onClick={() => onAskAiAnalyze(agentId)}
            className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-sm font-medium hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))]"
          >
            🔍 Ask AI to analyze
          </button>
        </div>
        {paginated.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
            No expenses for this agent.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="bg-[hsl(var(--muted))]">
                    <th className="w-8 px-1 py-2" aria-label="Expand" />
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">Vendor</th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">Category</th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">Description</th>
                    <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">Amount</th>
                    <th className="w-10 px-1 py-2" aria-label="Ask AI" />
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((item) => (
                    <ExpenseRowWithActions
                      key={item.id}
                      item={item}
                      currency={currency}
                      locale={locale}
                      formatMoney={formatMoney}
                      formatTimestamp={formatTimestamp}
                      formatTimestampFull={formatTimestampFull}
                      expandedExpenseId={expandedExpenseId}
                      onToggleExpand={onToggleExpand}
                      onAskAi={onAskAiExpense}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="mt-2 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <button
                  type="button"
                  onClick={() => setDetailPage((p) => Math.max(1, p - 1))}
                  disabled={detailPage === 1}
                  className="rounded border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <span>Page {detailPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setDetailPage((p) => Math.min(totalPages, p + 1))}
                  disabled={detailPage === totalPages}
                  className="rounded border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ExpenseRowWithActions(props: {
  item: ExpenseItem;
  currency: string;
  locale?: string;
  formatMoney: (amountMinor: number, currency: string, locale?: string) => string;
  formatTimestamp: (value: string, locale?: string) => string;
  formatTimestampFull: (value: string, locale?: string) => string;
  expandedExpenseId: string | null;
  onToggleExpand: (id: string | null) => void;
  onAskAi: (exp: ExpenseItem) => void;
  /** When true, show Agent column (e.g. in main Overview table). */
  showAgentColumn?: boolean;
}) {
  const { item, currency, locale, formatMoney, formatTimestamp, formatTimestampFull, expandedExpenseId, onToggleExpand, onAskAi, showAgentColumn } = props;
  const isExpanded = expandedExpenseId === item.id;
  const colSpan = showAgentColumn ? 8 : 7;

  return (
    <>
      <tr className="border-t border-[hsl(var(--border))]">
        <td className="px-1 py-2">
          <button
            type="button"
            onClick={() => onToggleExpand(isExpanded ? null : item.id)}
            className="p-1 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))] rounded"
            aria-expanded={isExpanded}
            title={isExpanded ? "Collapse" : "Expand details"}
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        </td>
        <td className="px-3 py-2 text-[hsl(var(--foreground))]">{formatTimestamp(item.occurredAt, locale)}</td>
        {showAgentColumn && (
          <td className="px-3 py-2 text-[hsl(var(--foreground))]">{item.agentName}</td>
        )}
        <td className="px-3 py-2 text-[hsl(var(--foreground))]">{item.vendor}</td>
        <td className="px-3 py-2 capitalize text-[hsl(var(--foreground))]">{item.category}</td>
        <td className="px-3 py-2 text-[hsl(var(--foreground))]">{item.description}</td>
        <td className="px-3 py-2 font-medium text-[hsl(var(--foreground))]">{formatMoney(item.amountMinor, currency, locale)}</td>
        <td className="px-1 py-2">
          <button
            type="button"
            onClick={() => onAskAi(item)}
            className="rounded p-1 hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))]"
            title="Ask AI about this expense"
          >
            🔍
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30">
          <td colSpan={colSpan} className="px-3 py-3 text-sm">
            <div className="space-y-2">
              <p><strong>Description:</strong> {item.description}</p>
              <p><strong>Time:</strong> {formatTimestampFull(item.occurredAt, locale)}</p>
              <p>
                <strong>Category:</strong>{" "}
                <span className="inline-flex rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 capitalize">{item.category}</span>
              </p>
              <p><strong>Agent:</strong> {item.agentName} ({item.agentId})</p>
              <button
                type="button"
                onClick={() => onAskAi(item)}
                className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1 text-sm hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))]"
              >
                🔍 Ask AI about this expense
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const EXPENSE_PAGE_SIZE = 10;

const AgentLedgerDashboard: React.FC = () => {
  const { props, isPending, locale, sendFollowUpMessage } =
    useWidget<AgentLedgerDashboardProps>();
  const parsed = propSchema.safeParse(props);

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterAgentId, setFilterAgentId] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [expenseSort, setExpenseSort] = useState<ExpenseSort>("dateDesc");
  const [expensePage, setExpensePage] = useState(1);
  const [showTrackForm, setShowTrackForm] = useState(false);
  const [trackAgentId, setTrackAgentId] = useState("");
  const [trackCategory, setTrackCategory] = useState("");
  const [trackVendor, setTrackVendor] = useState("");
  const [trackDescription, setTrackDescription] = useState("");
  const [trackAmountDollars, setTrackAmountDollars] = useState("");
  const [trackSuccess, setTrackSuccess] = useState(false);

  // Improvement 1: Agent detail view
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentDetailData, setAgentDetailData] = useState<{
    expenses: ExpenseItem[];
    expenseSummary: ExpenseSummaryLike;
    currency: string;
    from: string;
    to: string;
  } | null>(null);

  // Improvement 2: Unknown agent banner
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  // Improvement 5: Loading states
  const [refreshButtonLoading, setRefreshButtonLoading] = useState(false);

  // Improvement 6: Accordion (one expanded at a time)
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);

  const { callTool: trackExpense, isPending: isTracking } =
    useCallTool("trackExpense");

  const {
    callToolAsync: callGetExpenses,
    isPending: getExpensesPending,
  } = useCallTool("getExpenses");

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
  const agentScope = data.filters.agentId ? data.filters.agentId : "all agents";

  // Improvement 2: Unknown agents (for banner)
  const unknownAgents = useMemo(
    () =>
      data.balances.filter(
        (b) => isUnknownAgent(b.agentId) && !dismissedAlerts.includes(b.agentId)
      ),
    [data.balances, dismissedAlerts]
  );

  const handleOpenAgentDetail = (agentId: string) => {
    setSelectedAgentId(agentId);
    setAgentDetailData(null);
    callGetExpenses({
      agentId,
      from: data.filters.from,
      to: data.filters.to,
      currency: data.filters.currency,
    })
      .then((result: unknown) => {
        const r = result as {
          structuredContent?: {
            expenses?: ExpenseItem[];
            expenseSummary?: ExpenseSummaryLike;
            summary?: ExpenseSummaryLike;
            currency?: string;
            from?: string;
            to?: string;
          };
        };
        const content = r?.structuredContent ?? r;
        const expenses = content?.expenses ?? data.expenses.filter((e) => e.agentId === agentId);
        const summary = content?.expenseSummary ?? content?.summary ?? {
          totalExpenseMinor: expenses.reduce((s, e) => s + e.amountMinor, 0),
          expenseCount: expenses.length,
          byCategory: Object.entries(
            expenses.reduce<Record<string, number>>((acc, e) => {
              acc[e.category] = (acc[e.category] ?? 0) + e.amountMinor;
              return acc;
            }, {})
          ).map(([category, totalExpenseMinor]) => ({ category, totalExpenseMinor })),
        };
        setAgentDetailData({
          expenses,
          expenseSummary: summary,
          currency: content?.currency ?? data.filters.currency,
          from: content?.from ?? data.filters.from,
          to: content?.to ?? data.filters.to,
        });
      })
      .catch(() => {
        const fallbackExpenses = data.expenses.filter((e) => e.agentId === agentId);
        const byAgentRow = data.expenseSummary.byAgent.find((a) => a.agentId === agentId);
        const totalMinor = byAgentRow?.totalExpenseMinor ?? fallbackExpenses.reduce((s, e) => s + e.amountMinor, 0);
        const byCategory = Object.entries(
          fallbackExpenses.reduce<Record<string, number>>((acc, e) => {
            acc[e.category] = (acc[e.category] ?? 0) + e.amountMinor;
            return acc;
          }, {})
        ).map(([category, totalExpenseMinor]) => ({ category, totalExpenseMinor }));
        setAgentDetailData({
          expenses: fallbackExpenses,
          expenseSummary: {
            totalExpenseMinor: totalMinor,
            expenseCount: fallbackExpenses.length,
            byCategory,
          },
          currency: data.filters.currency,
          from: data.filters.from,
          to: data.filters.to,
        });
      });
  };

  const handleBackToAgents = () => {
    setSelectedAgentId(null);
    setAgentDetailData(null);
    setExpandedExpenseId(null);
  };

  const categories = useMemo(
    () => [...new Set(data.expenseSummary.byCategory.map((c) => c.category))],
    [data.expenseSummary.byCategory]
  );

  const filteredAndSortedExpenses = useMemo(() => {
    let list = [...data.expenses];

    if (filterCategory !== "all") {
      list = list.filter((e) => e.category === filterCategory);
    }
    if (filterAgentId !== "all") {
      list = list.filter((e) => e.agentId === filterAgentId);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.vendor.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      switch (expenseSort) {
        case "dateDesc":
          return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
        case "dateAsc":
          return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
        case "amountDesc":
          return b.amountMinor - a.amountMinor;
        case "amountAsc":
          return a.amountMinor - b.amountMinor;
        case "vendor":
          return a.vendor.localeCompare(b.vendor);
        default:
          return 0;
      }
    });

    return list;
  }, [
    data.expenses,
    filterCategory,
    filterAgentId,
    searchText,
    expenseSort,
  ]);

  const totalExpensePages = Math.max(
    1,
    Math.ceil(filteredAndSortedExpenses.length / EXPENSE_PAGE_SIZE)
  );
  const paginatedExpenses = useMemo(
    () =>
      filteredAndSortedExpenses.slice(
        (expensePage - 1) * EXPENSE_PAGE_SIZE,
        expensePage * EXPENSE_PAGE_SIZE
      ),
    [filteredAndSortedExpenses, expensePage]
  );

  const handleTrackExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackAgentId.trim()) return;
    const amount = Math.round(parseFloat(trackAmountDollars || "0") * 100);
    if (Number.isNaN(amount) || amount <= 0) return;
    if (!trackCategory.trim() || !trackVendor.trim() || !trackDescription.trim())
      return;

    setTrackSuccess(false);
    trackExpense(
      {
        agentId: trackAgentId,
        category: trackCategory.trim(),
        vendor: trackVendor.trim(),
        description: trackDescription.trim(),
        amountMinor: amount,
        currency: data.filters.currency,
      },
      {
        onSuccess: () => {
          setTrackAmountDollars("");
          setTrackDescription("");
          setTrackVendor("");
          setTrackSuccess(true);
          setShowTrackForm(false);
        },
        onError: () => {
          setTrackSuccess(false);
        },
      }
    );
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "byAgent", label: "By agent" },
    { id: "byCategory", label: "By category" },
  ];

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

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                sendFollowUpMessage(
                  `Summarize spending for the period ${data.filters.from} to ${data.filters.to}. Which agent or category spent the most?`
                )
              }
              className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            >
              Ask AI to summarize
            </button>
            <button
              type="button"
              onClick={() => {
                setRefreshButtonLoading(true);
                sendFollowUpMessage(
                  "Refresh the ledger dashboard with getExpenses so I see the latest data."
                );
                setTimeout(() => setRefreshButtonLoading(false), 1500);
              }}
              disabled={refreshButtonLoading}
              className="flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-70"
            >
              {refreshButtonLoading && <Spinner className="h-4 w-4" />}
              Ask AI to refresh data
            </button>
          </div>
        </header>

        {/* Improvement 2: Unknown agent alert banner */}
        {unknownAgents.length > 0 && (
          <div
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-3 text-amber-800 dark:text-amber-200"
            role="alert"
          >
            <div className="flex items-center gap-2 font-medium">
              <span aria-hidden>⚠️</span>
              <span>
                Unknown agent detected: {unknownAgents.map((a) => a.agentId).join(", ")} — spending{" "}
                {unknownAgents
                  .map((a) =>
                    formatMoney(a.spentMinor, data.filters.currency, locale)
                  )
                  .join(", ")}{" "}
                with no registered owner
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  sendFollowUpMessage(
                    `An unknown agent '${unknownAgents[0].agentId}' appeared in the ledger spending ${formatMoney(unknownAgents[0].spentMinor, data.filters.currency, locale)}. I didn't create this agent. Who is this and should I be concerned?`
                  )
                }
                className="rounded border border-amber-600 bg-amber-500/30 px-2 py-1.5 text-sm font-medium hover:bg-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                🔍 Ask AI who this is
              </button>
              <button
                type="button"
                onClick={() =>
                  setDismissedAlerts((prev) => [
                    ...prev,
                    ...unknownAgents.map((a) => a.agentId),
                  ])
                }
                className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 text-sm font-medium hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

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

        {/* Improvement 1: Agent detail view (replaces main content when an agent is selected) */}
        {selectedAgentId != null ? (
          <AgentDetailView
            agentId={selectedAgentId}
            balance={data.balances.find((b) => b.agentId === selectedAgentId)}
            agentDetailData={agentDetailData}
            getExpensesPending={getExpensesPending}
            currency={data.filters.currency}
            locale={locale}
            onBack={handleBackToAgents}
            onAskAiAnalyze={(id) =>
              sendFollowUpMessage(
                `Analyze the spending pattern of agent ${id} and flag any anomalies or unusual expenses.`
              )
            }
            onAskAiSetBudget={(id, name) =>
              sendFollowUpMessage(
                `Set a monthly budget for agent ${id} (${name}). Suggest an appropriate amount based on their recent spending pattern.`
              )
            }
            onAskAiExpense={(exp) =>
              sendFollowUpMessage(
                `Explain this expense in detail: ${exp.vendor} charged ${formatMoney(exp.amountMinor, data.filters.currency, locale)} to ${exp.agentId} for '${exp.description}' in category '${exp.category}' on ${formatTimestamp(exp.occurredAt, locale)}. Is this expected? How does it compare to typical costs for this service?`
              )
            }
            isUnknownAgent={isUnknownAgent(selectedAgentId)}
            expandedExpenseId={expandedExpenseId}
            onToggleExpand={setExpandedExpenseId}
            formatMoney={formatMoney}
            formatTimestamp={formatTimestamp}
            formatTimestampFull={formatTimestampFull}
          />
        ) : (
          <>
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--border))]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-[hsl(var(--foreground))] text-[hsl(var(--foreground))]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
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
                        <th className="px-3 py-2 text-left font-medium text-[hsl(var(--muted-foreground))]">
                          Budget
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
                            {formatMoney(
                              item.spentMinor,
                              data.filters.currency,
                              locale
                            )}
                          </td>
                          <td className="border-t border-[hsl(var(--border))] px-3 py-2 font-medium text-[hsl(var(--foreground))]">
                            {formatMoney(
                              item.remainingMinor,
                              data.filters.currency,
                              locale
                            )}
                          </td>
                          <td className="border-t border-[hsl(var(--border))] px-3 py-2">
                            <BudgetBar
                              spentMinor={item.spentMinor}
                              budgetMinor={undefined}
                              currency={data.filters.currency}
                              locale={locale}
                              agentId={item.agentId}
                              agentName={item.agentName}
                              onAskAiSetBudget={(id, name) =>
                                sendFollowUpMessage(
                                  `Set a monthly budget for agent ${id} (${name}). Suggest an appropriate amount based on their recent spending pattern.`
                                )
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mb-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
                  Expenses
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="Search vendor/description..."
                    value={searchText}
                    onChange={(e) => {
                      setSearchText(e.target.value);
                      setExpensePage(1);
                    }}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]"
                  />
                  <select
                    value={filterCategory}
                    onChange={(e) => {
                      setFilterCategory(e.target.value);
                      setExpensePage(1);
                    }}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  >
                    <option value="all">All categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={filterAgentId}
                    onChange={(e) => {
                      setFilterAgentId(e.target.value);
                      setExpensePage(1);
                    }}
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  >
                    <option value="all">All agents</option>
                    {data.balances.map((b) => (
                      <option key={b.agentId} value={b.agentId}>
                        {b.agentName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={expenseSort}
                    onChange={(e) =>
                      setExpenseSort(e.target.value as ExpenseSort)
                    }
                    className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  >
                    <option value="dateDesc">Date (newest)</option>
                    <option value="dateAsc">Date (oldest)</option>
                    <option value="amountDesc">Amount (high)</option>
                    <option value="amountAsc">Amount (low)</option>
                    <option value="vendor">Vendor</option>
                  </select>
                </div>
              </div>
              {paginatedExpenses.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
                  No expenses match the filters.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead>
                        <tr className="bg-[hsl(var(--muted))]">
                          <th className="w-8 px-1 py-2" aria-label="Expand" />
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
                          <th className="w-10 px-1 py-2" aria-label="Ask AI" />
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedExpenses.map((item) => (
                          <ExpenseRowWithActions
                            key={item.id}
                            item={item}
                            currency={data.filters.currency}
                            locale={locale}
                            formatMoney={formatMoney}
                            formatTimestamp={formatTimestamp}
                            formatTimestampFull={formatTimestampFull}
                            expandedExpenseId={expandedExpenseId}
                            onToggleExpand={(id) => setExpandedExpenseId(id)}
                            onAskAi={(exp) =>
                              sendFollowUpMessage(
                                `Explain this expense in detail: ${exp.vendor} charged ${formatMoney(exp.amountMinor, data.filters.currency, locale)} to ${exp.agentId} for '${exp.description}' in category '${exp.category}' on ${formatTimestamp(exp.occurredAt, locale)}. Is this expected? How does it compare to typical costs for this service?`
                              )
                            }
                            showAgentColumn
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalExpensePages > 1 && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                      <button
                        type="button"
                        onClick={() => setExpensePage((p) => Math.max(1, p - 1))}
                        disabled={expensePage === 1}
                        className="rounded border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span>
                        Page {expensePage} of {totalExpensePages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setExpensePage((p) =>
                            Math.min(totalExpensePages, p + 1)
                          )
                        }
                        disabled={expensePage === totalExpensePages}
                        className="rounded border border-[hsl(var(--border))] px-2 py-1 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {activeTab === "byAgent" && (
          <section className="mb-6">
            <h3 className="mb-3 text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Spending by agent
            </h3>
            {data.expenseSummary.byAgent.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
                No data.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.expenseSummary.byAgent.map((row) => {
                  const bal = data.balances.find((b) => b.agentId === row.agentId);
                  return (
                    <article
                      key={row.agentId}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenAgentDetail(row.agentId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleOpenAgentDetail(row.agentId);
                        }
                      }}
                      className="flex cursor-pointer flex-col rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-colors hover:bg-[hsl(var(--muted))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--foreground))]"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
                          {row.agentName}
                        </p>
                        {isUnknownAgent(row.agentId) && (
                          <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                            ⚠️ Unregistered
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">
                        {formatMoney(
                          row.totalExpenseMinor,
                          data.filters.currency,
                          locale
                        )}
                      </p>
                      {bal && (
                        <div className="mt-2">
                          <BudgetBar
                            spentMinor={bal.spentMinor}
                            budgetMinor={undefined}
                            currency={data.filters.currency}
                            locale={locale}
                            agentId={bal.agentId}
                            agentName={bal.agentName}
                            onAskAiSetBudget={(id, name) =>
                              sendFollowUpMessage(
                                `Set a monthly budget for agent ${id} (${name}). Suggest an appropriate amount based on their recent spending pattern.`
                              )
                            }
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === "byCategory" && (
          <section className="mb-6">
            <h3 className="mb-3 text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">
              Spending by category
            </h3>
            {data.expenseSummary.byCategory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-4 text-sm text-[hsl(var(--muted-foreground))]">
                No data.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.expenseSummary.byCategory.map((row) => (
                  <article
                    key={row.category}
                    className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4"
                  >
                    <p className="text-sm font-medium capitalize text-[hsl(var(--foreground))]">
                      {row.category}
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-[hsl(var(--foreground))]">
                      {formatMoney(
                        row.totalExpenseMinor,
                        data.filters.currency,
                        locale
                      )}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
          <button
            type="button"
            onClick={() => setShowTrackForm((v) => !v)}
            className="text-sm font-medium text-[hsl(var(--foreground))] hover:underline"
          >
            {showTrackForm ? "Hide form" : "Track new expense"}
          </button>
          {trackSuccess && (
            <p className="mt-2 text-sm text-green-600 dark:text-green-400">
              Expense recorded. Ask the AI to refresh the dashboard to see it.
            </p>
          )}
          {showTrackForm && (
            <form onSubmit={handleTrackExpense} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                  Agent
                  <select
                    required
                    value={trackAgentId}
                    onChange={(e) => setTrackAgentId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  >
                    <option value="">Select agent</option>
                    {data.balances.map((b) => (
                      <option key={b.agentId} value={b.agentId}>
                        {b.agentName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                  Category
                  <input
                    type="text"
                    required
                    value={trackCategory}
                    onChange={(e) => setTrackCategory(e.target.value)}
                    placeholder="e.g. software"
                    className="mt-1 block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                  Vendor
                  <input
                    type="text"
                    required
                    value={trackVendor}
                    onChange={(e) => setTrackVendor(e.target.value)}
                    placeholder="e.g. OpenAI"
                    className="mt-1 block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>
                <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                  Amount ({data.filters.currency})
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={trackAmountDollars}
                    onChange={(e) => setTrackAmountDollars(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                  />
                </label>
              </div>
              <label className="block text-sm text-[hsl(var(--muted-foreground))]">
                Description
                <input
                  type="text"
                  required
                  value={trackDescription}
                  onChange={(e) => setTrackDescription(e.target.value)}
                  placeholder="Short description"
                  className="mt-1 block w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm text-[hsl(var(--foreground))]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={isTracking}
                  className="flex items-center gap-2 rounded-md bg-[hsl(var(--foreground))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--background))] hover:opacity-90 disabled:opacity-50"
                >
                  {isTracking && <Spinner className="h-4 w-4" />}
                  {isTracking ? "Recording…" : "Record expense"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowTrackForm(false)}
                  className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm font-medium text-[hsl(var(--foreground))]"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </section>
          </>
        )}
      </div>
    </McpUseProvider>
  );
};

export default AgentLedgerDashboard;
