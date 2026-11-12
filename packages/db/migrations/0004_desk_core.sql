CREATE TABLE "desk_controls" (
	"network" text PRIMARY KEY NOT NULL,
	"paused" boolean NOT NULL,
	"reason" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desk_rate_cards" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "desk_rate_cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"network" text NOT NULL,
	"asset" text NOT NULL,
	"monthly_bps" integer NOT NULL,
	"max_ltv_bps" integer NOT NULL,
	"inputs" jsonb NOT NULL,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desk_decisions" ADD COLUMN "maker_id" text;--> statement-breakpoint
CREATE INDEX "desk_rate_cards_latest_idx" ON "desk_rate_cards" USING btree ("network","asset","created_at");