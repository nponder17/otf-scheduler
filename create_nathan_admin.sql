-- SQL to create system admin account for Nathan
-- Run this in Render's PostgreSQL database interface
-- 
-- Email: hq3276@wayne.edu
-- Password: orange123
-- Name: Nathan

INSERT INTO system_admins (
    admin_id,
    name,
    email,
    password_hash,
    is_active,
    created_at
) VALUES (
    gen_random_uuid(),
    'Nathan',
    'hq3276@wayne.edu',
    '$2b$12$URDy9W10Ub5lttaDQKueYOIEJGnBbajXfgNCWwFMaxy2hiQ8jDPai',
    true,
    NOW()
);

-- Verify the admin was created:
SELECT admin_id, name, email, is_active, created_at 
FROM system_admins 
WHERE email = 'hq3276@wayne.edu';

