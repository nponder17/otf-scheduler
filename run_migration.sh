#!/bin/bash
# Script to run the password_hash migration on Render PostgreSQL

# Your Render PostgreSQL connection string
# Try with port 5432 (default PostgreSQL port)
export PGHOST="dpg-d5p6sn6r433s73d3uiog-a"
export PGPORT="5432"
export PGDATABASE="otf_scheduler_db"
export PGUSER="otf_scheduler_db_user"
export PGPASSWORD="jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs"

# Run the migration SQL
psql -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -U "$PGUSER" <<EOF
-- Add password_hash column to employees table
ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'employees' AND column_name = 'password_hash';
EOF

echo "Migration complete!"

