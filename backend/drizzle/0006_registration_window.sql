ALTER TABLE "settings" ADD COLUMN "opens_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_window_order" CHECK ("settings"."opens_at" IS NULL OR "settings"."closes_at" IS NULL OR "settings"."closes_at" > "settings"."opens_at");