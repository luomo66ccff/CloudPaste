CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"reason" text NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pastes" ADD COLUMN "status" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "pastes" ADD COLUMN "burned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pastes" ADD COLUMN "hidden_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "reports_slug_idx" ON "reports" USING btree ("slug");