-- Migration: Add password_hash column to employees table
-- Run this SQL directly in your Render PostgreSQL database

-- Add the column (IF NOT EXISTS prevents errors if already exists)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'employees' AND column_name = 'password_hash';

