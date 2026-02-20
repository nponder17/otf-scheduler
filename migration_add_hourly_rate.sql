-- Migration: Add hourly_rate column to employees table (for payroll insights)
-- Run this in your PostgreSQL database (e.g. Render)

ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2);

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'employees' AND column_name = 'hourly_rate';
