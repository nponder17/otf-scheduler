-- Manual SQL to create managers and system_admins tables
-- Run this in psql if you can't use Alembic

-- Create managers table
CREATE TABLE IF NOT EXISTS managers (
    manager_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for managers
CREATE INDEX IF NOT EXISTS ix_managers_company_id ON managers(company_id);
CREATE INDEX IF NOT EXISTS ix_managers_email ON managers(email);

-- Create system_admins table
CREATE TABLE IF NOT EXISTS system_admins (
    admin_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for system_admins
CREATE INDEX IF NOT EXISTS ix_system_admins_email ON system_admins(email);

-- Verify tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('managers', 'system_admins');

