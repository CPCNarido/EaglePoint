-- Migration: add planned_duration_minutes to Player
-- Up
ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "planned_duration_minutes" INTEGER;

-- Down
-- ALTER TABLE "Player" DROP COLUMN IF EXISTS "planned_duration_minutes";
