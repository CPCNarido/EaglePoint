-- Migration: add_systemlog_session_type
-- Adds a nullable session_type column to the SystemLog table so Prisma client
-- and runtime code can persist/display human-friendly session names.

BEGIN;

-- Add the nullable session_type column if it does not already exist.
ALTER TABLE IF EXISTS "SystemLog"
ADD COLUMN IF NOT EXISTS "session_type" text;

COMMIT;
