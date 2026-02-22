import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { LedgerError } from "../provider.js";
import * as schema from "./schema.js";

let puzzleDb: NodePgDatabase<typeof schema> | undefined;
let puzzlePool: Pool | undefined;

export function getPuzzleDatabase(): NodePgDatabase<typeof schema> {
  if (puzzleDb) {
    return puzzleDb;
  }

  const connectionString = process.env.PUZZLE_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new LedgerError(
      "PROVIDER_NOT_CONFIGURED",
      "Puzzle provider requires PUZZLE_DATABASE_URL."
    );
  }

  try {
    puzzlePool = new Pool({ connectionString });
    puzzleDb = drizzle(puzzlePool, { schema });
    return puzzleDb;
  } catch (err) {
    throw toPuzzleDatabaseError(
      err,
      "Failed to initialize Puzzle database client."
    );
  }
}

export function toPuzzleDatabaseError(
  err: unknown,
  fallbackMessage: string
): LedgerError {
  if (err instanceof LedgerError) {
    return err;
  }

  const detail = err instanceof Error ? err.message : "Unexpected database error";
  return new LedgerError("PROVIDER_UNAVAILABLE", `${fallbackMessage} ${detail}`);
}
