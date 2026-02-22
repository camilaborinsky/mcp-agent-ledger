import {
  McpUseProvider,
  useWidget,
  useCallTool,
  type WidgetMetadata,
} from "mcp-use/react";
import React, { useState, useMemo, Component, type ReactNode } from "react";
import "../styles.css";
import type { AgentLedgerDashboardProps } from "./types";
import { propSchema } from "./types";

/** Catches render errors so the inspector shows a message instead of a blank iframe. */
class WidgetErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            color: "var(--text-primary)",
            background: "var(--bg-primary)",
            minHeight: 200,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>
            Error loading dashboard. Check the console or try running the tool again.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* Inline SVG icons (currentColor, 16x16 or as noted) */
type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

function IconSearch({ size = 16, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style} aria-hidden>
      <path d="M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM14 14l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevronDown({ size = 12, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} style={style} aria-hidden>
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevronRight({ size = 12, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className} style={style} aria-hidden>
      <path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconArrowRight({ size = 16, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRefresh({ size = 16, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style} aria-hidden>
      <path d="M2 8a6 6 0 0 1 9.5-4.5L13 5v3H9l1.5-1.5A4 4 0 1 0 4 10H2a6 6 0 0 1 0-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSparkle({ size = 16, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className} style={style} aria-hidden>
      <path d="M8 2l1 4 4 1-4 1-1 4-1-4-4-1 4-1 1-4zM12 10l.5 2 2 .5-2 .5-.5 2-.5-2-2-.5 2-.5.5-2z" fill="currentColor" />
    </svg>
  );
}

const AGENT_COLORS = ["#635bff", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

function agentColor(agentId: string): string {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) h = (h << 5) - h + agentId.charCodeAt(i);
  return AGENT_COLORS[Math.abs(h) % AGENT_COLORS.length];
}

function formatTimestampRelative(value: string, locale?: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const now = new Date();
  const diffMs = now.getTime() - parsed.getTime();
  const diffM = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffM < 1) return "Just now";
  if (diffM < 60) return `${diffM}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD === 1) return "Yesterday";
  if (diffD < 7) return `${diffD} days ago`;
  return parsed.toLocaleDateString(locale ?? "en-US", { month: "short", day: "numeric", year: parsed.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

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

function MetricCard(props: { label: string; value: string; caption?: string }) {
  const { label, value, caption } = props;
  return (
    <article className="kpi-card">
      <p className="kpi-card-label">{label}</p>
      <p className="kpi-card-value">{value}</p>
      {caption != null && <p className="kpi-card-label" style={{ marginTop: 4 }}>{caption}</p>}
    </article>
  );
}

/** Budget progress bar: green <70%, yellow 70–90%, red >90%. No budget = muted text + Ask AI link. */
function BudgetBar(props: {
  spentMinor: number;
  budgetMinor?: number;
  currency: string;
  locale?: string;
  agentId: string;
  agentName: string;
  onAskAiSetBudget: (agentId: string, agentName: string) => void;
}) {
  const { spentMinor, budgetMinor, currency, locale, agentId, agentName, onAskAiSetBudget } = props;

  if (budgetMinor == null || budgetMinor <= 0) {
    return (
      <div className="budget-bar-wrap" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        No budget set.{" "}
        <button type="button" onClick={() => onAskAiSetBudget(agentId, agentName)} className="back-link" style={{ display: "inline", margin: 0 }}>
          Ask AI to set one
        </button>
      </div>
    );
  }

  const pct = Math.min(100, (spentMinor / budgetMinor) * 100);
  const fillClass = pct < 70 ? "ok" : pct < 90 ? "warning" : "danger";

  return (
    <div className="budget-bar-wrap">
      <div className="budget-bar-label">
        <span>{formatMoney(spentMinor, currency, locale)} / {formatMoney(budgetMinor, currency, locale)}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="budget-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`budget-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Spinner({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        width: 20,
        height: 20,
        borderRadius: "50%",
        border: "2px solid var(--border-stripe)",
        borderTopColor: "var(--text-primary)",
        animation: "spin 0.8s linear infinite",
        ...style,
      }}
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
  expandedExpenseId: string | null;
  onToggleExpand: (id: string | null) => void;
  formatMoney: (amountMinor: number, currency: string, locale?: string) => string;
  formatTimestamp: (value: string, locale?: string) => string;
  formatTimestampFull: (value: string, locale?: string) => string;
  formatTimestampRelative: (value: string, locale?: string) => string;
  agentColor: (agentId: string) => string;
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
    expandedExpenseId,
    onToggleExpand,
    formatMoney,
    formatTimestampRelative,
    agentColor,
  } = props;

  const agentName = balance?.agentName ?? agentId;
  const expenses = agentDetailData?.expenses ?? [];
  const summary = agentDetailData?.expenseSummary;
  const totalPages = Math.max(1, Math.ceil(expenses.length / EXPENSE_PAGE_SIZE));
  const paginated = expenses.slice(
    (detailPage - 1) * EXPENSE_PAGE_SIZE,
    detailPage * EXPENSE_PAGE_SIZE
  );

  const maxCategory = summary?.byCategory.reduce((m, c) => Math.max(m, c.totalExpenseMinor), 0) ?? 1;

  if (getExpensesPending && !agentDetailData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <button type="button" onClick={onBack} className="back-link">← All agents</button>
        <div className="skeleton skeleton-card" style={{ height: 96 }} />
        <div className="skeleton skeleton-card" style={{ height: 200 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <button type="button" onClick={onBack} className="back-link">← All agents</button>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="agent-dot" style={{ backgroundColor: agentColor(agentId), width: 12, height: 12 }} />
        <h3 className="section-label-lg" style={{ marginBottom: 0 }}>{agentName}</h3>
      </div>

      <div className="kpi-strip" style={{ marginBottom: 16 }}>
        <MetricCard label="Total spent" value={summary ? formatMoney(summary.totalExpenseMinor, currency, locale) : "—"} />
        <MetricCard label="Transactions" value={String(summary?.expenseCount ?? 0)} />
        <MetricCard label="Top category" value={summary?.byCategory[0]?.category ?? "—"} />
      </div>

      {balance && (
        <div className="kpi-card" style={{ padding: 16 }}>
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

      {summary && summary.byCategory.length > 0 && (
        <div>
          <h4 className="section-label">Category breakdown</h4>
          <div className="category-bars">
            {summary.byCategory.map((c) => (
              <div key={c.category} className="category-bar-item">
                <span className="category-bar-label">{c.category}</span>
                <div className="category-bar-track">
                  <div className="category-bar-fill" style={{ width: `${(c.totalExpenseMinor / maxCategory) * 100}%` }} />
                </div>
                <span className="category-bar-value">{formatMoney(c.totalExpenseMinor, currency, locale)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <h4 className="section-label" style={{ marginBottom: 0 }}>Expenses</h4>
          <button type="button" onClick={() => onAskAiAnalyze(agentId)} className="btn-secondary">
            <IconSparkle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            Ask AI to analyze
          </button>
        </div>
        {paginated.length === 0 ? (
          <div className="empty-state">
            No expenses for this agent.
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th style={{ width: 32 }} aria-label="Expand" />
                    <th>Date</th>
                    <th>Vendor</th>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="text-right">Amount</th>
                    <th style={{ width: 40 }} aria-label="Ask AI" />
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
                      formatTimestampRelative={formatTimestampRelative}
                      expandedExpenseId={expandedExpenseId}
                      onToggleExpand={onToggleExpand}
                      onAskAi={onAskAiExpense}
                      agentColor={agentColor}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button type="button" onClick={() => setDetailPage((p) => Math.max(1, p - 1))} disabled={detailPage === 1} className="btn-ghost">Previous</button>
                <span>Page {detailPage} of {totalPages}</span>
                <button type="button" onClick={() => setDetailPage((p) => Math.min(totalPages, p + 1))} disabled={detailPage === totalPages} className="btn-ghost">Next</button>
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
  formatTimestampRelative: (value: string, locale?: string) => string;
  expandedExpenseId: string | null;
  onToggleExpand: (id: string | null) => void;
  onAskAi: (exp: ExpenseItem) => void;
  agentColor: (agentId: string) => string;
  showAgentColumn?: boolean;
}) {
  const { item, currency, locale, formatMoney, formatTimestampFull, formatTimestampRelative, expandedExpenseId, onToggleExpand, onAskAi, agentColor, showAgentColumn } = props;
  const isExpanded = expandedExpenseId === item.id;
  const colSpan = showAgentColumn ? 8 : 7;

  return (
    <>
      <tr>
        <td>
          <button
            type="button"
            onClick={() => onToggleExpand(isExpanded ? null : item.id)}
            className="expand-btn"
            aria-expanded={isExpanded}
            title={isExpanded ? "Collapse" : "Expand details"}
          >
            {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        </td>
        <td>
          <span className="date-muted" title={formatTimestampFull(item.occurredAt, locale)}>{formatTimestampRelative(item.occurredAt, locale)}</span>
        </td>
        {showAgentColumn && (
          <td>
            <div className="agent-cell">
              <span className="agent-dot" style={{ backgroundColor: agentColor(item.agentId) }} />
              {item.agentName}
            </div>
          </td>
        )}
        <td>{item.vendor}</td>
        <td><span className="category-badge">{item.category}</span></td>
        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.description}>{item.description}</td>
        <td className="text-right">{formatMoney(item.amountMinor, currency, locale)}</td>
        <td>
          <span className="row-actions">
            <button type="button" onClick={() => onAskAi(item)} className="expand-btn" title="Ask AI about this expense">
              <IconSparkle size={16} />
            </button>
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={colSpan} style={{ padding: 12, background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-stripe)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <p><strong>Description:</strong> {item.description}</p>
              <p><strong>Time:</strong> {formatTimestampFull(item.occurredAt, locale)}</p>
              <p><strong>Category:</strong> <span className="category-badge">{item.category}</span></p>
              <p><strong>Agent:</strong> {item.agentName} ({item.agentId})</p>
              <button type="button" onClick={() => onAskAi(item)} className="btn-secondary">
                <IconSparkle size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
                Ask AI about this expense
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

  // Safe ref for hooks that must run every render (Rules of Hooks). Never return before these useMemos.
  const dataRef = parsed.success ? parsed.data : null;

  const categories = useMemo(
    () =>
      dataRef
        ? [...new Set(dataRef.expenseSummary.byCategory.map((c) => c.category))]
        : [],
    [dataRef]
  );

  const filteredAndSortedExpenses = useMemo(() => {
    if (!dataRef) return [];
    let list = [...dataRef.expenses];
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
          return (
            new Date(b.occurredAt).getTime() -
            new Date(a.occurredAt).getTime()
          );
        case "dateAsc":
          return (
            new Date(a.occurredAt).getTime() -
            new Date(b.occurredAt).getTime()
          );
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
    dataRef,
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

  if (isPending || !parsed.success) {
    return (
      <McpUseProvider autoSize>
        <div className="dashboard">
          <div style={{ marginBottom: 24 }}>
            <div className="skeleton skeleton-line" style={{ width: 160, height: 20, marginBottom: 12 }} />
            <div className="skeleton skeleton-line" style={{ width: 240, height: 28 }} />
          </div>
          <div className="kpi-strip">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={`kpi-skeleton-${idx}`} className="skeleton skeleton-card" />
            ))}
          </div>
          <div className="skeleton" style={{ height: 280, borderRadius: 8 }} />
        </div>
      </McpUseProvider>
    );
  }

  const data = parsed.data;
  const agentScope = data.filters.agentId ? data.filters.agentId : "all agents";

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
        type ContentShape = {
          expenses?: ExpenseItem[];
          expenseSummary?: ExpenseSummaryLike;
          summary?: ExpenseSummaryLike;
          currency?: string;
          from?: string;
          to?: string;
        };
        const r = result as { structuredContent?: ContentShape } | ContentShape;
        const content: ContentShape | undefined = r && "structuredContent" in r ? r.structuredContent : (r as ContentShape);
        const expenses = content?.expenses ?? data.expenses.filter((e) => e.agentId === agentId);
        const summary = content?.expenseSummary ?? content?.summary ?? {
          totalExpenseMinor: expenses.reduce((s: number, e: ExpenseItem) => s + e.amountMinor, 0),
          expenseCount: expenses.length,
          byCategory: Object.entries(
            expenses.reduce<Record<string, number>>((acc: Record<string, number>, e: ExpenseItem) => {
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
        const totalMinor = byAgentRow?.totalExpenseMinor ?? fallbackExpenses.reduce((s: number, e: ExpenseItem) => s + e.amountMinor, 0);
        const byCategory = Object.entries(
          fallbackExpenses.reduce<Record<string, number>>((acc: Record<string, number>, e: ExpenseItem) => {
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

  const avgPerAgentMinor = data.balances.length > 0
    ? Math.round(data.expenseSummary.totalExpenseMinor / data.balances.length)
    : 0;
  const avgPerAgentStr = formatMoney(avgPerAgentMinor, data.filters.currency, locale);

  return (
    <McpUseProvider autoSize>
      <div className="dashboard">
        <div className="kpi-strip">
          <MetricCard
            label="Total spent"
            value={formatMoney(data.expenseSummary.totalExpenseMinor, data.filters.currency, locale)}
          />
          <MetricCard
            label="Active agents"
            value={String(data.balances.length)}
          />
          <MetricCard
            label="Transactions"
            value={String(data.expenseSummary.expenseCount)}
          />
          <MetricCard
            label="Avg / agent"
            value={avgPerAgentStr}
          />
        </div>

        <p className="meta-line">
          Source: <strong>{data.provider}</strong> · View: {data.activeTool} · Scope: {agentScope} · {data.filters.from} to {data.filters.to}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 24 }}>
          <button
            type="button"
            onClick={() =>
              sendFollowUpMessage(
                `Summarize spending for the period ${data.filters.from} to ${data.filters.to}. Which agent or category spent the most?`
              )
            }
            className="btn-secondary"
          >
            Ask AI to summarize
          </button>
          <button
            type="button"
            onClick={() => {
              setRefreshButtonLoading(true);
              sendFollowUpMessage("Refresh the ledger dashboard with getExpenses so I see the latest data.");
              setTimeout(() => setRefreshButtonLoading(false), 1500);
            }}
            disabled={refreshButtonLoading}
            className="btn-secondary"
          >
            {refreshButtonLoading ? <Spinner style={{ marginRight: 6, verticalAlign: "middle" }} /> : <IconRefresh size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />}
            Ask AI to refresh data
          </button>
        </div>

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
            expandedExpenseId={expandedExpenseId}
            onToggleExpand={setExpandedExpenseId}
            formatMoney={formatMoney}
            formatTimestamp={formatTimestamp}
            formatTimestampFull={formatTimestampFull}
            formatTimestampRelative={formatTimestampRelative}
            agentColor={agentColor}
          />
        ) : (
          <>
        <div className="tabs-row">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`tab ${activeTab === tab.id ? "active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <>
            <section style={{ marginBottom: 24 }}>
              <h3 className="section-label">Agent balances</h3>
              {data.balances.length === 0 ? (
                <div className="empty-state">No balances found for the selected filters.</div>
              ) : (
                <div className="table-wrap">
                  <table className="table" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Starting</th>
                        <th>Spent</th>
                        <th className="text-right">Remaining</th>
                        <th>Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.balances.map((item) => (
                        <tr key={item.agentId}>
                          <td>
                            <div className="agent-cell">
                              <span className="agent-dot" style={{ backgroundColor: agentColor(item.agentId) }} />
                              {item.agentName}
                            </div>
                          </td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(item.startingMinor, data.filters.currency, locale)}</td>
                          <td style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoney(item.spentMinor, data.filters.currency, locale)}</td>
                          <td className="text-right">{formatMoney(item.remainingMinor, data.filters.currency, locale)}</td>
                          <td>
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

            <section style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
                <h3 className="section-label" style={{ marginBottom: 0 }}>Expenses</h3>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                  <div className="search-wrap">
                    <IconSearch size={16} className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search vendor/description..."
                      value={searchText}
                      onChange={(e) => { setSearchText(e.target.value); setExpensePage(1); }}
                      className="form-input"
                      style={{ width: 200 }}
                    />
                  </div>
                  <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setExpensePage(1); }} className="form-select" style={{ width: "auto", minWidth: 120, padding: "6px 10px", fontSize: 12 }}>
                    <option value="all">All categories</option>
                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={filterAgentId} onChange={(e) => { setFilterAgentId(e.target.value); setExpensePage(1); }} className="form-select" style={{ width: "auto", minWidth: 120, padding: "6px 10px", fontSize: 12 }}>
                    <option value="all">All agents</option>
                    {data.balances.map((b) => <option key={b.agentId} value={b.agentId}>{b.agentName}</option>)}
                  </select>
                  <select value={expenseSort} onChange={(e) => setExpenseSort(e.target.value as ExpenseSort)} className="form-select" style={{ width: "auto", minWidth: 120, padding: "6px 10px", fontSize: 12 }}>
                    <option value="dateDesc">Date (newest)</option>
                    <option value="dateAsc">Date (oldest)</option>
                    <option value="amountDesc">Amount (high)</option>
                    <option value="amountAsc">Amount (low)</option>
                    <option value="vendor">Vendor</option>
                  </select>
                </div>
              </div>
              {paginatedExpenses.length === 0 ? (
                <div className="empty-state">
                  No expenses match the filters.
                  <div className="empty-state-cta">
                    <button type="button" onClick={() => setShowTrackForm(true)} className="btn-primary">Track your first expense</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="table-wrap">
                    <table className="table" style={{ minWidth: 860 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 32 }} aria-label="Expand" />
                          <th>Date</th>
                          <th>Agent</th>
                          <th>Vendor</th>
                          <th>Category</th>
                          <th>Description</th>
                          <th className="text-right">Amount</th>
                          <th style={{ width: 40 }} aria-label="Ask AI" />
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
                            formatTimestampRelative={formatTimestampRelative}
                            expandedExpenseId={expandedExpenseId}
                            onToggleExpand={(id) => setExpandedExpenseId(id)}
                            onAskAi={(exp) =>
                              sendFollowUpMessage(
                                `Explain this expense in detail: ${exp.vendor} charged ${formatMoney(exp.amountMinor, data.filters.currency, locale)} to ${exp.agentId} for '${exp.description}' in category '${exp.category}' on ${formatTimestamp(exp.occurredAt, locale)}. Is this expected? How does it compare to typical costs for this service?`
                              )
                            }
                            agentColor={agentColor}
                            showAgentColumn
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalExpensePages > 1 && (
                    <div className="pagination">
                      <button type="button" onClick={() => setExpensePage((p) => Math.max(1, p - 1))} disabled={expensePage === 1} className="btn-ghost">Previous</button>
                      <span>Page {expensePage} of {totalExpensePages}</span>
                      <button type="button" onClick={() => setExpensePage((p) => Math.min(totalExpensePages, p + 1))} disabled={expensePage === totalExpensePages} className="btn-ghost">Next</button>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {activeTab === "byAgent" && (
          <section style={{ marginBottom: 24 }}>
            <h3 className="section-label">Spending by agent</h3>
            {data.expenseSummary.byAgent.length === 0 ? (
              <div className="empty-state">No data.</div>
            ) : (
              <div className="agent-cards">
                {data.expenseSummary.byAgent.map((row) => {
                  const bal = data.balances.find((b) => b.agentId === row.agentId);
                  const agentExpenses = data.expenses.filter((e) => e.agentId === row.agentId);
                  const byCat = agentExpenses.reduce((acc, e) => {
                    acc[e.category] = (acc[e.category] ?? 0) + e.amountMinor;
                    return acc;
                  }, {} as Record<string, number>);
                  const topCategory = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
                  const txCount = agentExpenses.length;
                  const pct = bal && bal.startingMinor > 0 ? Math.min(100, (bal.spentMinor / bal.startingMinor) * 100) : 0;
                  const barClass = pct < 70 ? "ok" : pct < 90 ? "warning" : "danger";
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
                      className="agent-card"
                    >
                      <div className="agent-card-header">
                        <div className="agent-card-name">
                          <span className="agent-dot" style={{ backgroundColor: agentColor(row.agentId) }} />
                          {row.agentName}
                        </div>
                        <span className="agent-card-amount">
                          {formatMoney(row.totalExpenseMinor, data.filters.currency, locale)}
                        </span>
                      </div>
                      <p className="agent-card-subtitle">
                        {txCount} transaction{txCount !== 1 ? "s" : ""} · {topCategory}
                      </p>
                      {bal && bal.startingMinor > 0 && (
                        <div className="agent-card-footer">
                          <div className="budget-bar-track" style={{ flex: 1 }}>
                            <div className={`budget-bar-fill ${barClass}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="agent-card-arrow"><IconArrowRight size={16} /></span>
                        </div>
                      )}
                      {(!bal || bal.startingMinor <= 0) && (
                        <div className="agent-card-footer">
                          <span style={{ flex: 1 }} />
                          <span className="agent-card-arrow"><IconArrowRight size={16} /></span>
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
          <section style={{ marginBottom: 24 }}>
            <h3 className="section-label">Spending by category</h3>
            {data.expenseSummary.byCategory.length === 0 ? (
              <div className="empty-state">No data.</div>
            ) : (
              <div className="agent-cards">
                {data.expenseSummary.byCategory.map((row) => (
                  <article key={row.category} className="kpi-card" style={{ cursor: "default" }}>
                    <p className="kpi-card-label">{row.category}</p>
                    <p className="kpi-card-value">
                      {formatMoney(row.totalExpenseMinor, data.filters.currency, locale)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section style={{ marginTop: 24, paddingTop: 24, borderTop: "1px solid var(--border-stripe)" }}>
          <button
            type="button"
            onClick={() => setShowTrackForm((v) => !v)}
            className={`collapse-trigger ${showTrackForm ? "open" : ""}`}
          >
            <IconChevronDown size={12} className="chevron" />
            {showTrackForm ? "Hide form" : "Track new expense"}
          </button>
          {trackSuccess && <p className="success-msg">Expense recorded. Ask the AI to refresh the dashboard to see it.</p>}
          {showTrackForm && (
            <form onSubmit={handleTrackExpense} className="form-section">
              <div className="form-grid">
                <label className="form-label">
                  Agent
                  <select required value={trackAgentId} onChange={(e) => setTrackAgentId(e.target.value)} className="form-select">
                    <option value="">Select agent</option>
                    {data.balances.map((b) => <option key={b.agentId} value={b.agentId}>{b.agentName}</option>)}
                  </select>
                </label>
                <label className="form-label">
                  Category
                  <input type="text" required value={trackCategory} onChange={(e) => setTrackCategory(e.target.value)} placeholder="e.g. software" className="form-input" />
                </label>
                <label className="form-label">
                  Vendor
                  <input type="text" required value={trackVendor} onChange={(e) => setTrackVendor(e.target.value)} placeholder="e.g. OpenAI" className="form-input" />
                </label>
                <label className="form-label">
                  Amount ({data.filters.currency})
                  <input type="number" required min="0" step="0.01" value={trackAmountDollars} onChange={(e) => setTrackAmountDollars(e.target.value)} placeholder="0.00" className="form-input" />
                </label>
              </div>
              <label className="form-label" style={{ marginTop: 12 }}>
                Description
                <input type="text" required value={trackDescription} onChange={(e) => setTrackDescription(e.target.value)} placeholder="Short description" className="form-input" style={{ marginTop: 4 }} />
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" disabled={isTracking} className="btn-primary">
                  {isTracking && <Spinner style={{ marginRight: 6, verticalAlign: "middle" }} />}
                  {isTracking ? "Recording…" : "Track expense"}
                </button>
                <button type="button" onClick={() => setShowTrackForm(false)} className="btn-secondary">Cancel</button>
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

export default function WidgetWithBoundary() {
  return (
    <WidgetErrorBoundary>
      <AgentLedgerDashboard />
    </WidgetErrorBoundary>
  );
}
