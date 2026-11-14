CREATE TABLE "attendance" (
	"booking_id" uuid NOT NULL,
	"slot" text NOT NULL,
	"present" boolean NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_booking_id_slot_pk" PRIMARY KEY("booking_id","slot")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same Supabase Data API lockdown as 0001/0004.
ALTER TABLE "attendance" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "attendance" FROM anon, authenticated;
  END IF;
END
$$;
