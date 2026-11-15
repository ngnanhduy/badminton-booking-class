CREATE TABLE "weeks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"start_date" date,
	"rules" jsonb NOT NULL,
	"slots1" jsonb NOT NULL,
	"slots2" jsonb NOT NULL,
	"capacity" integer,
	"open" boolean DEFAULT false NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weeks_label_uq" UNIQUE("label"),
	CONSTRAINT "weeks_capacity_positive" CHECK ("weeks"."capacity" IS NULL OR "weeks"."capacity" > 0),
	CONSTRAINT "weeks_window_order" CHECK ("weeks"."opens_at" IS NULL OR "weeks"."closes_at" IS NULL OR "weeks"."closes_at" > "weeks"."opens_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "weeks_single_open" ON "weeks" USING btree ("open") WHERE "weeks"."open";--> statement-breakpoint
CREATE INDEX "weeks_start_date_idx" ON "weeks" USING btree ("start_date");--> statement-breakpoint
-- The current week comes from the old single settings row (empty on a fresh database: the
-- app then seeds a first week).
INSERT INTO "weeks" ("id", "label", "rules", "slots1", "slots2", "capacity", "open", "opens_at", "closes_at", "created_at", "updated_at")
SELECT gen_random_uuid(), s."week_label", s."rules", s."slots1", s."slots2", s."capacity", s."open", s."opens_at", s."closes_at",
       COALESCE((SELECT min(b."created_at") FROM "bookings" b WHERE b."week_label" = s."week_label"), s."updated_at"),
       s."updated_at"
FROM "settings" s
WHERE s."id" = 1;--> statement-breakpoint
-- Every older week that still has bookings becomes a closed week in the history. Its exact
-- slots weren't stored back then, so it gets the current ones.
INSERT INTO "weeks" ("id", "label", "rules", "slots1", "slots2", "capacity", "open", "created_at", "updated_at")
SELECT gen_random_uuid(), b."week_label", s."rules", s."slots1", s."slots2", s."capacity", false, b."first_at", b."first_at"
FROM (SELECT "week_label", min("created_at") AS "first_at" FROM "bookings" GROUP BY "week_label") b
CROSS JOIN "settings" s
WHERE s."id" = 1 AND NOT EXISTS (SELECT 1 FROM "weeks" w WHERE w."label" = b."week_label");--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_week_label_weeks_label_fk" FOREIGN KEY ("week_label") REFERENCES "public"."weeks"("label") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
-- Same Supabase Data API lockdown as 0001/0004/0005.
ALTER TABLE "weeks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "weeks" FROM anon, authenticated;
  END IF;
END
$$;
