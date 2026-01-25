-- Verify the system admin was created
SELECT admin_id, name, email, is_active, created_at 
FROM system_admins 
WHERE email = 'hq3276@wayne.edu';

