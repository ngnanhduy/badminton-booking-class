CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"booking_id" uuid,
	"week_label" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"week_label" text NOT NULL,
	"name_enc" text NOT NULL,
	"name_hash" text NOT NULL,
	"contact_enc" text NOT NULL,
	"contact_hash" text NOT NULL,
	"session_count" smallint NOT NULL,
	"slot1" text NOT NULL,
	"slot2" text,
	"slot3" text,
	"makeup_enc" text,
	"consent_version" text NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_session_count_range" CHECK ("bookings"."session_count" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"week_label" text NOT NULL,
	"rules" jsonb NOT NULL,
	"slots1" jsonb NOT NULL,
	"slots2" jsonb NOT NULL,
	"capacity" integer,
	"open" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1),
	CONSTRAINT "settings_capacity_positive" CHECK ("settings"."capacity" IS NULL OR "settings"."capacity" > 0)
);
--> statement-breakpoint
CREATE INDEX "audit_logs_at_idx" ON "audit_logs" USING btree ("at");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_week_contact_uq" ON "bookings" USING btree ("week_label","contact_hash");--> statement-breakpoint
CREATE INDEX "bookings_week_name_idx" ON "bookings" USING btree ("week_label","name_hash");--> statement-breakpoint
CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");