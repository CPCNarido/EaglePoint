-- Migration: add session_type to Player
-- Up
ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "session_type" TEXT;

-- Down
-- ALTER TABLE "Player" DROP COLUMN IF EXISTS "session_type";
