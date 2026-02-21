import type {
  GetBalanceResult,
  GetExpensesResult,
  LedgerFilters,
  LedgerProviderName,
} from "./types.js";

export class LedgerError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

export interface LedgerProvider {
  name: LedgerProviderName;
  getExpenses(filters: LedgerFilters): Promise<GetExpensesResult>;
  getBalance(filters: LedgerFilters): Promise<GetBalanceResult>;
}
