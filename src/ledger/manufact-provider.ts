import { LedgerError, type LedgerProvider } from "./provider.js";
import type {
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
  TrackExpenseInput,
  TrackExpenseResult,
} from "./types.js";

function ensureManufactConfigured(): void {
  if (!process.env.MANUFACT_API_KEY || !process.env.MANUFACT_BASE_URL) {
    throw new LedgerError(
      "PROVIDER_NOT_CONFIGURED",
      "Manufact provider requires MANUFACT_API_KEY and MANUFACT_BASE_URL."
    );
  }
}

export class ManufactLedgerProvider implements LedgerProvider {
  name = "manufact" as const;

  async getExpenses(_filters: LedgerFilters): Promise<GetExpensesResult> {
    ensureManufactConfigured();

    // TODO: Map Manufact expense payloads into GetExpensesResult.
    throw new LedgerError(
      "NOT_IMPLEMENTED",
      "Manufact expenses integration is scaffolded but not implemented yet."
    );
  }

  async getBalance(_filters: LedgerFilters): Promise<GetBalanceResult> {
    ensureManufactConfigured();

    // TODO: Map Manufact balance payloads into GetBalanceResult.
    throw new LedgerError(
      "NOT_IMPLEMENTED",
      "Manufact balance integration is scaffolded but not implemented yet."
    );
  }

  async trackExpense(_input: TrackExpenseInput): Promise<TrackExpenseResult> {
    ensureManufactConfigured();

    // TODO: Map Manufact create-expense payload into TrackExpenseResult.
    throw new LedgerError(
      "NOT_IMPLEMENTED",
      "Manufact expense tracking integration is scaffolded but not implemented yet."
    );
  }
}
