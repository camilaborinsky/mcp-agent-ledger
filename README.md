# MCP Agent Ledger

MCP server built with `mcp-use` that exposes ledger tools and a ChatGPT widget dashboard for agent expenses and balances.

## Tools

### `getExpenses`
Shared input schema:
- `agentId?: string`
- `from?: string` (`YYYY-MM-DD`)
- `to?: string` (`YYYY-MM-DD`)
- `currency?: string` (defaults to `USD`)

Output schema:
- `currency: string`
- `from: string`
- `to: string`
- `expenses: Expense[]`
- `summary.totalExpenseMinor: number`
- `summary.expenseCount: number`
- `summary.byAgent: Array<{ agentId; agentName; totalExpenseMinor }>`
- `summary.byCategory: Array<{ category; totalExpenseMinor }>`

### `getBalance`
Shared input schema:
- `agentId?: string`
- `from?: string` (`YYYY-MM-DD`)
- `to?: string` (`YYYY-MM-DD`)
- `currency?: string` (defaults to `USD`)

Output schema:
- `currency: string`
- `asOf: string` (ISO timestamp)
- `balances: AgentBalance[]`
- `totals.startingMinor: number`
- `totals.spentMinor: number`
- `totals.remainingMinor: number`

### `trackExpense`
Input schema:
- `agentId: string`
- `category: string`
- `vendor: string`
- `description: string`
- `amountMinor: number` (positive integer, minor units)
- `currency?: string` (defaults to `USD`)
- `occurredAt?: string` (ISO-8601 timestamp, defaults to now)

Output schema:
- `currency: string`
- `expense: Expense`

`getExpenses` and `getBalance` both render the widget `agent-ledger-dashboard`.  
`trackExpense` is a write tool and returns JSON only.

## Provider Selection

Set `LEDGER_PROVIDER` to choose a backend implementation:
- `mock` (default)
- `puzzle` (stub)
- `manufact` (stub)

Required env vars for stubs:
- Puzzle: `PUZZLE_API_KEY`, `PUZZLE_BASE_URL`
- Manufact: `MANUFACT_API_KEY`, `MANUFACT_BASE_URL`

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000/inspector](http://localhost:3000/inspector) and run:

```json
{"name":"getExpenses","arguments":{}}
```

```json
{"name":"getBalance","arguments":{"agentId":"agent-atlas"}}
```

```json
{"name":"trackExpense","arguments":{"agentId":"agent-atlas","category":"software","vendor":"OpenAI","description":"Batch inference run","amountMinor":1250}}
```

## Build

```bash
npm run build
```

## Deploy on Manufact Cloud

```bash
npm run deploy
```
