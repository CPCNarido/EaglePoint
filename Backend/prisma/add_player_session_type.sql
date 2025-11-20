-- Add planned_duration_minutes and session_type to Player for backward-compat
BEGIN;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "planned_duration_minutes" integer;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "session_type" text;
COMMIT;
