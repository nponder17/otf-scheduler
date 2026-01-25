# Migration Instructions: Managers and System Admins

This guide will help you run the database migration and create your first system admin account.

## Step 1: Run the Database Migration

The migration will create the `managers` and `system_admins` tables in your database.

### Option A: Using Alembic (Recommended)

If you have access to your API service environment:

```bash
cd apps/api
alembic upgrade head
```

Or use the provided script:

```bash
chmod +x run_migration_managers_admins.sh
./run_migration_managers_admins.sh
```

### Option B: Using the Admin API Endpoint

If you have the `/admin/run-migration` endpoint available, you can call it:

```bash
curl -X POST https://your-api-url.onrender.com/admin/run-migration
```

### Option C: Manual SQL (if you have direct database access)

If you have direct access to your Render PostgreSQL database, you can run the SQL manually. The migration creates:

1. `managers` table with columns:
   - `manager_id` (UUID, primary key)
   - `company_id` (UUID, foreign key to companies)
   - `name` (String)
   - `email` (String, unique)
   - `password_hash` (String, nullable)
   - `is_active` (Boolean)
   - `created_at` (Timestamp)

2. `system_admins` table with columns:
   - `admin_id` (UUID, primary key)
   - `name` (String)
   - `email` (String, unique)
   - `password_hash` (String, required)
   - `is_active` (Boolean)
   - `created_at` (Timestamp)

## Step 2: Create Your First System Admin Account

### Option A: Using the Python Script (Recommended)

1. Make sure you have the required dependencies:
   ```bash
   cd apps/api
   pip install passlib[bcrypt] sqlalchemy
   ```

2. Run the script:
   ```bash
   cd ../..  # Back to project root
   python create_system_admin.py your-email@example.com your-password "Your Name"
   ```

   Example:
   ```bash
   python create_system_admin.py admin@mycompany.com mySecurePassword123 "John Doe"
   ```

### Option B: Using SQL (Manual)

1. Generate a bcrypt hash for your password:
   ```python
   python -c "from passlib.context import CryptContext; pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto'); print(pwd_context.hash('your-password'))"
   ```

2. Run the SQL (see `create_system_admin_sql.sql` for template):
   ```sql
   INSERT INTO system_admins (
       admin_id,
       name,
       email,
       password_hash,
       is_active,
       created_at
   ) VALUES (
       gen_random_uuid(),
       'Your Name',
       'your-email@example.com',
       'your-bcrypt-hash-here',
       true,
       NOW()
   );
   ```

### Option C: Using the API (After creating first admin)

Once you have one system admin, you can create additional system admins through the System Admin Dashboard UI.

## Step 3: Verify Everything Works

1. **Test System Admin Login:**
   - Go to `/system-admin/login` (web) or use the mobile app
   - Log in with the credentials you just created
   - You should be redirected to the System Admin Dashboard

2. **Create a Company:**
   - In the System Admin Dashboard, click "Add Company"
   - Enter a company name and timezone
   - Click "Create"

3. **Create a Manager:**
   - Select the company you just created
   - Click "Add Manager"
   - Enter manager details (name, email, password)
   - Click "Create"

4. **Create an Employee:**
   - Still in the System Admin Dashboard with the company selected
   - Click "Add Employee"
   - Enter employee details (name, email, optional phone)
   - Click "Create"

5. **Test Manager Login:**
   - Log out of System Admin
   - Go to `/manager/login`
   - Log in with the manager credentials you created
   - You should see only that company's data

## Troubleshooting

### Migration fails with "revision not found"
- Make sure the migration file `add_managers_and_system_admins.py` exists in `apps/api/alembic/versions/`
- Check that the `down_revision` in the migration file matches the latest migration revision ID

### "Module not found" errors
- Make sure you're in the correct directory
- Install dependencies: `pip install -r apps/api/requirements.txt`

### "Connection refused" or database errors
- Verify your `DATABASE_URL` in `apps/api/.env` is correct
- For Render, use the external database URL (not the internal one)
- Make sure your database allows connections from your IP (if running locally)

### Password hash generation
- Make sure `passlib[bcrypt]` is installed: `pip install passlib[bcrypt]`
- The hash should start with `$2b$` or `$2a$`

## Next Steps

After completing these steps, you can:
- Log in as System Admin and manage all companies
- Create managers for each company
- Managers can log in and manage their company's employees
- Employees can log in and view their schedules

