-- Admins can turn public pages (the tabs of the menu) on or off. A page without a row is on.
CREATE TABLE "page_settings" (
	"page" text PRIMARY KEY NOT NULL,
	"enabled" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Same Supabase Data API lockdown as 0001/0004/0005.
ALTER TABLE "page_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "page_settings" FROM anon, authenticated;
  END IF;
END
$$;
