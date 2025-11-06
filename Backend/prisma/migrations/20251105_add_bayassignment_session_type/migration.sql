-- Migration: add_bayassignment_session_type
-- Adds a nullable session_type column to BayAssignment to store human-friendly session names.

BEGIN;

ALTER TABLE IF EXISTS "BayAssignment"
ADD COLUMN IF NOT EXISTS "session_type" text;

COMMIT;
