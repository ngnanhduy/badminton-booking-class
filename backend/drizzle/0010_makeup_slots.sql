-- Make-up classes: a week offers a list of slots for a make-up class (like slots1/2/3), and a
-- booking can add one make-up slot on top of its sessions. Until now the make-up was a free-text
-- note that could name any time, so every existing week starts offering make-up classes on all of
-- its slots (admins can turn them off per slot).
ALTER TABLE "bookings" ADD COLUMN "makeup_slot" text;--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN "slots_makeup" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "weeks" w SET "slots_makeup" = COALESCE(
  (
    SELECT jsonb_agg(u."label" ORDER BY u."pos")
    FROM (
      SELECT e."label", min(e."pos") AS "pos"
      FROM jsonb_array_elements_text(w."slots1" || w."slots2" || w."slots3") WITH ORDINALITY AS e("label", "pos")
      GROUP BY e."label"
    ) u
  ),
  '[]'::jsonb
);
