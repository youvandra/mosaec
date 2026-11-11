CREATE TABLE "faucet_claims" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "faucet_claims_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"network" text NOT NULL,
	"account_id" text NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tx_hash" text
);
--> statement-breakpoint
CREATE INDEX "faucet_claims_account_idx" ON "faucet_claims" USING btree ("network","account_id","claimed_at");