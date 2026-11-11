CREATE TABLE "desk_decisions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "desk_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"network" text NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" text NOT NULL,
	"pack_id" text,
	"verdict" text NOT NULL,
	"code" text,
	"reason" text NOT NULL,
	"quote" jsonb,
	"principal" numeric(39, 0),
	"tx_hash" text,
	"actor" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "desk_decisions_recent_idx" ON "desk_decisions" USING btree ("network","decided_at");