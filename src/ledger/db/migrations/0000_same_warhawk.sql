CREATE EXTENSION IF NOT EXISTS "pgcrypto";
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"starting_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agents_starting_minor_non_negative" CHECK ("agents"."starting_minor" >= 0),
	CONSTRAINT "agents_currency_usd" CHECK ("agents"."currency" = 'USD')
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"category" text NOT NULL,
	"vendor" text NOT NULL,
	"description" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_minor_positive" CHECK ("expenses"."amount_minor" > 0),
	CONSTRAINT "expenses_currency_usd" CHECK ("expenses"."currency" = 'USD')
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_occurred_at_desc_idx" ON "expenses" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "expenses_agent_id_occurred_at_desc_idx" ON "expenses" USING btree ("agent_id","occurred_at" DESC NULLS LAST);
--> statement-breakpoint
INSERT INTO "agents" ("id", "name", "starting_minor", "currency")
VALUES
	('agent-atlas', 'Atlas', 250000, 'USD'),
	('agent-beacon', 'Beacon', 180000, 'USD'),
	('agent-cipher', 'Cipher', 220000, 'USD')
ON CONFLICT ("id") DO NOTHING;
