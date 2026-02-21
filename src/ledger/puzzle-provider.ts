import { LedgerError, type LedgerProvider } from "./provider.js";
import type {
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
} from "./types.js";

function ensurePuzzleConfigured(): void {
  if (!process.env.PUZZLE_API_KEY || !process.env.PUZZLE_BASE_URL) {
    throw new LedgerError(
      "PROVIDER_NOT_CONFIGURED",
      "Puzzle provider requires PUZZLE_API_KEY and PUZZLE_BASE_URL."
    );
  }
}

export class PuzzleLedgerProvider implements LedgerProvider {
  name = "puzzle" as const;

  async getExpenses(_filters: LedgerFilters): Promise<GetExpensesResult> {
    ensurePuzzleConfigured();

    // TODO: Map Puzzle expenses payloads into GetExpensesResult.
    throw new LedgerError(
      "NOT_IMPLEMENTED",
      "Puzzle expenses integration is scaffolded but not implemented yet."
    );
  }

  async getBalance(_filters: LedgerFilters): Promise<GetBalanceResult> {
    ensurePuzzleConfigured();

    // TODO: Map Puzzle balance payloads into GetBalanceResult.
    throw new LedgerError(
      "NOT_IMPLEMENTED",
      "Puzzle balance integration is scaffolded but not implemented yet."
    );
  }
}
