import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    startingMinor: integer("starting_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("agents_starting_minor_non_negative", sql`${table.startingMinor} >= 0`),
    check("agents_currency_usd", sql`${table.currency} = 'USD'`),
  ]
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "restrict" }),
    category: text("category").notNull(),
    vendor: text("vendor").notNull(),
    description: text("description").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("USD"),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("expenses_amount_minor_positive", sql`${table.amountMinor} > 0`),
    check("expenses_currency_usd", sql`${table.currency} = 'USD'`),
    index("expenses_occurred_at_desc_idx").on(table.occurredAt.desc()),
    index("expenses_agent_id_occurred_at_desc_idx").on(
      table.agentId,
      table.occurredAt.desc()
    ),
  ]
);
