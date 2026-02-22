import { defineConfig } from "drizzle-kit";

const fallbackUrl = "postgresql://postgres:postgres@localhost:5432/postgres";

export default defineConfig({
  schema: "./src/ledger/db/schema.ts",
  out: "./src/ledger/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.PUZZLE_DATABASE_URL || fallbackUrl,
  },
  strict: true,
  verbose: true,
});
