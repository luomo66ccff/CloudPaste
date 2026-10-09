CREATE TABLE "pastes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"content" text NOT NULL,
	"content_type" text DEFAULT 'markdown' NOT NULL,
	"language" text,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"edit_token_hash" text NOT NULL,
	"password_hash" text,
	"burn_after_read" boolean DEFAULT false NOT NULL,
	"expire_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pastes_slug_unique" UNIQUE("slug")
);
