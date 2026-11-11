-- Supabase publishes the `public` schema through its Data API (PostgREST) for the
-- `anon` and `authenticated` roles. This app only accesses data through its own backend
-- (which connects as the table owner and is not affected by RLS), so lock the Data API out:
--   1) enable Row Level Security with no policies → those roles can read/write nothing;
--   2) revoke their privileges as a second layer (only on Supabase, where the roles exist).
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "settings", "bookings", "audit_logs" FROM anon, authenticated;
    REVOKE ALL ON SEQUENCE "audit_logs_id_seq" FROM anon, authenticated;
  END IF;
END
$$;
