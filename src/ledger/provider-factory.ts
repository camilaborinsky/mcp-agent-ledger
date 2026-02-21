import { ManufactLedgerProvider } from "./manufact-provider.js";
import { MockLedgerProvider } from "./mock-provider.js";
import { LedgerError, type LedgerProvider } from "./provider.js";
import { PuzzleLedgerProvider } from "./puzzle-provider.js";

const SUPPORTED_PROVIDERS = ["mock", "puzzle", "manufact"] as const;

export function getLedgerProvider(): LedgerProvider {
  const selectedProvider =
    process.env.LEDGER_PROVIDER?.toLowerCase().trim() ?? "mock";

  switch (selectedProvider) {
    case "mock":
      return new MockLedgerProvider();
    case "puzzle":
      return new PuzzleLedgerProvider();
    case "manufact":
      return new ManufactLedgerProvider();
    default:
      throw new LedgerError(
        "INVALID_PROVIDER",
        `Unsupported LEDGER_PROVIDER value: ${selectedProvider}. Supported values: ${SUPPORTED_PROVIDERS.join(", ")}.`
      );
  }
}
