-- Migration: convert_session_type_to_enum
-- Creates a Postgres enum type for session kinds and migrates existing BayAssignment.session_type text values
-- into the enum-backed column. Backfills values from open_time/end_time when present.

BEGIN;

-- 1) Create enum type if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SessionType') THEN
    CREATE TYPE "SessionType" AS ENUM ('Open','Timed','Reserved');
  END IF;
END$$;

-- 2) Add a temporary enum-typed column
ALTER TABLE IF EXISTS "BayAssignment"
ADD COLUMN IF NOT EXISTS "session_type_tmp" "SessionType";

-- 3) Backfill from existing flags
-- Treat currently open assignments as Open (stopwatch)
UPDATE "BayAssignment"
SET session_type_tmp = 'Open'
WHERE open_time = true;

-- Treat ended or non-open assignments as Timed
UPDATE "BayAssignment"
SET session_type_tmp = 'Timed'
WHERE (open_time = false OR end_time IS NOT NULL) AND session_type_tmp IS NULL;

-- If there are existing textual values in session_type that match enum members, preserve them
-- (this covers any rows that weren't covered by the above logic)
UPDATE "BayAssignment"
SET session_type_tmp = CASE
  WHEN session_type IN ('Open','Timed','Reserved') THEN session_type::text::"SessionType"
  ELSE session_type_tmp
END
WHERE session_type IS NOT NULL AND session_type_tmp IS NULL;

-- For any remaining nulls, default to Timed
UPDATE "BayAssignment"
SET session_type_tmp = 'Timed'
WHERE session_type_tmp IS NULL;

-- 4) Drop old text column and rename temp
ALTER TABLE IF EXISTS "BayAssignment"
DROP COLUMN IF EXISTS "session_type";

ALTER TABLE IF EXISTS "BayAssignment"
RENAME COLUMN "session_type_tmp" TO "session_type";

COMMIT;
