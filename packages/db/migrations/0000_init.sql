CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "balances_snapshot" (
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"token_id" text NOT NULL,
	"amount" numeric(39, 0) NOT NULL,
	"height" bigint NOT NULL,
	CONSTRAINT "balances_snapshot_network_account_id_token_id_pk" PRIMARY KEY("network","account_id","token_id")
);
--> statement-breakpoint
CREATE TABLE "checkpoints" (
	"network" text NOT NULL,
	"stream" text NOT NULL,
	"last_height" bigint NOT NULL,
	"last_block_timestamp_ns" numeric(20, 0) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkpoints_network_stream_pk" PRIMARY KEY("network","stream")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"network" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"block_height" bigint NOT NULL,
	"block_timestamp_ns" numeric(20, 0) NOT NULL,
	"tx_hash" text,
	"executor_id" text NOT NULL,
	"standard" text NOT NULL,
	"event" text NOT NULL,
	"pack_id" text,
	"data" jsonb NOT NULL,
	CONSTRAINT "events_receipt_id_log_index_pk" PRIMARY KEY("receipt_id","log_index")
);
--> statement-breakpoint
CREATE TABLE "holders_history" (
	"network" text NOT NULL,
	"token_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"log_index" integer NOT NULL,
	"owner_id" text,
	"from_height" bigint NOT NULL,
	CONSTRAINT "holders_history_network_receipt_id_log_index_token_id_pk" PRIMARY KEY("network","receipt_id","log_index","token_id")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"network" text NOT NULL,
	"receipt_id" text NOT NULL,
	"pack_id" text NOT NULL,
	"maker_id" text NOT NULL,
	"pay_token" text NOT NULL,
	"price" numeric(39, 0) NOT NULL,
	"k_token" text NOT NULL,
	"k_amount" numeric(39, 0) NOT NULL,
	"term_ns" numeric(20, 0) NOT NULL,
	"offer_expires_at_ns" numeric(20, 0) NOT NULL,
	"contents" jsonb NOT NULL,
	"contents_hash" text NOT NULL,
	"status" text NOT NULL,
	"opened_height" bigint NOT NULL,
	"closed_height" bigint,
	CONSTRAINT "offers_network_receipt_id_pk" PRIMARY KEY("network","receipt_id")
);
--> statement-breakpoint
CREATE TABLE "packs" (
	"network" text NOT NULL,
	"pack_id" text NOT NULL,
	"pack_index" bigint NOT NULL,
	"title_id" text NOT NULL,
	"title_owner" text,
	"ticket_id" text,
	"ticket_owner" text,
	"state" text NOT NULL,
	"rounds" integer NOT NULL,
	"pay_token" text,
	"price" numeric(39, 0),
	"maker_id" text,
	"k_token" text,
	"k_amount" numeric(39, 0),
	"term_ns" numeric(20, 0),
	"offer_expires_at_ns" numeric(20, 0),
	"expires_at_ns" numeric(20, 0),
	"deadline_ns" numeric(20, 0),
	"disrupted_at_ns" numeric(20, 0),
	"contents" jsonb,
	"contents_hash" text,
	"ticket_pending" boolean DEFAULT false NOT NULL,
	"command_in_flight" boolean DEFAULT false NOT NULL,
	"last_outcome" text,
	"minted_height" bigint,
	"refreshed_height" bigint NOT NULL,
	CONSTRAINT "packs_network_pack_id_pk" PRIMARY KEY("network","pack_id")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"symbol" text NOT NULL,
	"usd" numeric(30, 10) NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "prices_symbol_observed_at_pk" PRIMARY KEY("symbol","observed_at")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"csrf_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"network" text NOT NULL,
	"token_id" text NOT NULL,
	"kind" text NOT NULL,
	"pack_id" text NOT NULL,
	"owner_id" text,
	"burned" boolean DEFAULT false NOT NULL,
	"updated_height" bigint NOT NULL,
	CONSTRAINT "tokens_network_token_id_pk" PRIMARY KEY("network","token_id")
);
--> statement-breakpoint
CREATE INDEX "events_pack_idx" ON "events" USING btree ("network","pack_id","block_height");--> statement-breakpoint
CREATE INDEX "events_height_idx" ON "events" USING btree ("network","block_height");--> statement-breakpoint
CREATE INDEX "holders_token_idx" ON "holders_history" USING btree ("network","token_id","from_height");--> statement-breakpoint
CREATE INDEX "offers_open_idx" ON "offers" USING btree ("network","status","pack_id");--> statement-breakpoint
CREATE INDEX "packs_state_idx" ON "packs" USING btree ("network","state");--> statement-breakpoint
CREATE INDEX "packs_title_owner_idx" ON "packs" USING btree ("network","title_owner");--> statement-breakpoint
CREATE INDEX "packs_ticket_owner_idx" ON "packs" USING btree ("network","ticket_owner");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("network","account_id");--> statement-breakpoint
CREATE INDEX "tokens_owner_idx" ON "tokens" USING btree ("network","owner_id");