-- Session 3 gets its own slot list. Until now `slots2` served both sessions 2 and 3, so every
-- existing week starts with the same list for session 3.
ALTER TABLE "weeks" ADD COLUMN "slots3" jsonb;--> statement-breakpoint
UPDATE "weeks" SET "slots3" = "slots2";--> statement-breakpoint
ALTER TABLE "weeks" ALTER COLUMN "slots3" SET NOT NULL;
