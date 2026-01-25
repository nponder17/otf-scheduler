-- SQL script to create the first system admin account manually
-- Run this after the migration has been completed
-- 
-- You'll need to replace:
--   - 'your-email@example.com' with your actual email
--   - 'your-password-hash' with a bcrypt hash of your password
--   - 'Your Name' with your actual name
--
-- To generate a bcrypt hash, you can use Python:
--   python -c "from passlib.context import CryptContext; pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto'); print(pwd_context.hash('your-password'))"

-- Example (replace with your actual values):
INSERT INTO system_admins (
    admin_id,
    name,
    email,
    password_hash,
    is_active,
    created_at
) VALUES (
    gen_random_uuid(),  -- PostgreSQL function to generate UUID
    'System Admin',      -- Replace with your name
    'admin@example.com', -- Replace with your email
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqJZ5Q5Q5O',  -- Replace with your password hash
    true,
    NOW()
);

-- Verify the admin was created:
SELECT admin_id, name, email, is_active, created_at 
FROM system_admins 
WHERE email = 'admin@example.com';

