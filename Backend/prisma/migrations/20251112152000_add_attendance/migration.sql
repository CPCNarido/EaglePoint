-- Migration: add Attendance table
-- Up
CREATE TABLE IF NOT EXISTS "Attendance" (
  "attendance_id" SERIAL PRIMARY KEY,
  "employee_id" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "clock_in" TIMESTAMP WITH TIME ZONE NULL,
  "clock_out" TIMESTAMP WITH TIME ZONE NULL,
  "source" TEXT NULL,
  "notes" TEXT NULL,
  "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Unique constraint: one record per employee per date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'attendance_employee_id_date_key'
  ) THEN
    CREATE UNIQUE INDEX "attendance_employee_id_date_key" ON "Attendance" ("employee_id", "date");
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'attendance_date_idx'
  ) THEN
    CREATE INDEX "attendance_date_idx" ON "Attendance" ("date");
  END IF;
END$$;

-- Foreign key to Employee (add only if it does not already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_employee_fkey'
  ) THEN
    ALTER TABLE "Attendance"
      ADD CONSTRAINT "attendance_employee_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "Employee" ("employee_id") ON DELETE CASCADE;
  END IF;
END$$;

-- Down (reverse) below as comments; Prisma will generate down if needed
-- DROP TABLE IF EXISTS "Attendance";
