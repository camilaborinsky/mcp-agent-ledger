# MCP Agent Ledger

MCP server that tracks agent spending and balances, exposing:

- MCP tools (`getExpenses`, `getBalance`, `trackExpense`)
- a ChatGPT widget (`agent-ledger-dashboard`) for read-only financial visibility

## What This MCP Does

This server models agents with a starting balance and expense events over time. It allows an LLM client to:

- query expenses for a date range (optionally scoped to one agent)
- compute balances by agent and overall totals
- record new expenses with strict validation
- consume normalized error responses (`code` + `message`)

## Execution Flow

1. Client calls an MCP tool.
2. Server validates and normalizes input (dates, currency, defaults).
3. Server selects a provider using `LEDGER_PROVIDER`.
4. Provider executes read/write operations.
5. Server returns structured JSON output.
6. `getExpenses` and `getBalance` also return widget props for UI rendering.

Important behavior:

- `from` and `to` must be `YYYY-MM-DD`.
- If dates are omitted, default range is the last 30 days.
- `currency` is uppercased and defaults to `USD`.
- `from` cannot be greater than `to`.
- `trackExpense.occurredAt` must be ISO-8601 (defaults to current time).

## Exposed Tools

### `getExpenses`

Returns filtered expenses and summary aggregations.

Input:

- `agentId?: string`
- `from?: string` (`YYYY-MM-DD`)
- `to?: string` (`YYYY-MM-DD`)
- `currency?: string` (defaults to `USD`)

Output summary:

- `currency`, `from`, `to`
- `expenses[]`
- `summary.totalExpenseMinor`
- `summary.expenseCount`
- `summary.byAgent[]`
- `summary.byCategory[]`

Also renders `agent-ledger-dashboard`.

### `getBalance`

Returns per-agent balances and global totals.

Input:

- `agentId?: string`
- `from?: string` (`YYYY-MM-DD`)
- `to?: string` (`YYYY-MM-DD`)
- `currency?: string` (defaults to `USD`)

Output summary:

- `currency`, `asOf`
- `balances[]` (`startingMinor`, `spentMinor`, `remainingMinor`)
- `totals` (`startingMinor`, `spentMinor`, `remainingMinor`)

Also renders `agent-ledger-dashboard`.

### `trackExpense`

Creates a new expense entry.

Input:

- `agentId: string`
- `category: string`
- `vendor: string`
- `description: string`
- `amountMinor: number` (positive integer, minor units; cents for USD)
- `currency?: string` (defaults to `USD`)
- `occurredAt?: string` (ISO-8601)

Output:

- `currency`
- `expense`

Returns JSON only (no widget).

## Providers

Provider selection is controlled by `LEDGER_PROVIDER`:

- `mock` (default): in-memory seeded dataset
- `puzzle`: PostgreSQL via Drizzle ORM
- `manufact`: scaffolded integration, currently not implemented

### `mock`

- Supports `USD` only.
- Includes 3 seeded agents: `agent-atlas`, `agent-beacon`, `agent-cipher`.
- `trackExpense` writes in memory only (not persistent across restarts).

### `puzzle`

- Supports `USD` only.
- Requires `PUZZLE_DATABASE_URL`.
- Persists data in `agents` and `expenses` tables.
- In `trackExpense`, if `agentId` does not exist, it auto-creates the agent with:
  - `name = agentId`
  - `starting_minor = 0`
  - `currency = USD`

### `manufact`

- Requires `MANUFACT_API_KEY` and `MANUFACT_BASE_URL`.
- Currently returns `NOT_IMPLEMENTED` for all operations.

## Data Model (`puzzle`)

Primary tables:

- `agents`: id, name, starting_minor, currency, created_at
- `expenses`: id (UUID), agent_id, category, vendor, description, amount_minor, currency, occurred_at, created_at

Constraints and indexing:

- positive amount checks
- USD currency checks
- foreign key: `expenses.agent_id -> agents.id`
- indexes on `occurred_at` and `(agent_id, occurred_at DESC)`

Initial migration also enables `pgcrypto` and seeds the 3 default agents.

## Widget

`agent-ledger-dashboard` is read-only and shows:

- total spent, total remaining, and number of agents in scope
- balance table by agent
- recent expenses table
- context bar with provider, active tool, scope, and date range

## Errors and Observability

Domain errors are returned through MCP `error(...)` with structured payload:

- `INVALID_DATE`
- `INVALID_DATE_RANGE`
- `INVALID_AGENT`
- `INVALID_CATEGORY`
- `INVALID_VENDOR`
- `INVALID_DESCRIPTION`
- `INVALID_AMOUNT`
- `UNSUPPORTED_CURRENCY`
- `INVALID_PROVIDER`
- `PROVIDER_NOT_CONFIGURED`
- `PROVIDER_UNAVAILABLE`
- `NOT_IMPLEMENTED`
- `INTERNAL_ERROR`

Logging:

- each call logs `tool`, `provider`, `durationMs`, and `status`
- filters are hashed (`sha256` truncated) before logging
- `trackExpense` logs stage-level trace events

## Example Calls

```json
{"name":"getExpenses","arguments":{}}
```

```json
{"name":"getBalance","arguments":{"agentId":"agent-atlas","from":"2026-02-01","to":"2026-02-22"}}
```

```json
{"name":"trackExpense","arguments":{"agentId":"agent-atlas","category":"software","vendor":"OpenAI","description":"Batch inference run","amountMinor":1250}}
```
