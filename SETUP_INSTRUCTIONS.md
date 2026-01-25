# Step-by-Step Setup Instructions

## 1. Database Migration: Add password_hash Column

### Option A: Run Migration Locally (Recommended for Testing)

1. **Navigate to the API directory:**
   ```bash
   cd apps/api
   ```

2. **Make sure you have your database connection set up in `.env`:**
   ```bash
   DATABASE_URL=postgresql://user:password@host:port/database
   ```

3. **Run the migration:**
   ```bash
   # If you have alembic installed globally
   alembic upgrade head
   
   # Or if using Python directly
   python -m alembic upgrade head
   ```

### Option B: Run Migration on Render (Production)

1. **SSH into your Render service** (if you have shell access), or:

2. **Use Render's PostgreSQL dashboard:**
   - Go to your Render dashboard
   - Find your PostgreSQL database
   - Click on "Connect" or "Shell"
   - Run the SQL directly:
   ```sql
   ALTER TABLE employees ADD COLUMN password_hash VARCHAR;
   ```

3. **Or run migration via Render's build command:**
   - In your Render service settings, add to build command:
   ```bash
   cd apps/api && alembic upgrade head && ...
   ```

### Option C: Manual SQL (If migrations don't work)

Connect to your Render PostgreSQL database and run:
```sql
ALTER TABLE employees ADD COLUMN password_hash VARCHAR;
```

---

## 2. Set Employee Passwords

You need to set passwords for employees using the `/auth/set-password` endpoint.

### Using curl (from command line):

```bash
# Replace with your actual API base URL
API_BASE="https://your-api.onrender.com"

# Replace with actual employee_id
EMPLOYEE_ID="00000000-0000-0000-0000-000000000000"
PASSWORD="employee-password-123"

curl -X POST "${API_BASE}/auth/set-password?employee_id=${EMPLOYEE_ID}&password=${PASSWORD}"
```

### Using Python script:

Create a file `set_passwords.py` in `apps/api/`:

```python
import requests
import sys

API_BASE = "https://your-api.onrender.com"  # Change this
EMPLOYEE_ID = sys.argv[1]  # Pass as argument
PASSWORD = sys.argv[2]     # Pass as argument

response = requests.post(
    f"{API_BASE}/auth/set-password",
    params={"employee_id": EMPLOYEE_ID, "password": PASSWORD}
)
print(response.json())
```

Run it:
```bash
python set_passwords.py "employee-uuid" "their-password"
```

### Using Postman or similar:

1. **Method:** POST
2. **URL:** `https://your-api.onrender.com/auth/set-password`
3. **Query Parameters:**
   - `employee_id`: The UUID of the employee
   - `password`: The password to set
4. **Send request**

### Get Employee IDs:

First, get the list of employees:
```bash
curl "https://your-api.onrender.com/admin/companies/{company_id}/employees"
```

---

## 3. Install Mobile Dependency

1. **Navigate to mobile directory:**
   ```bash
   cd apps/mobile
   ```

2. **Install the package:**
   ```bash
   npm install
   ```

   This will install `@react-native-async-storage/async-storage` which is already in `package.json`.

3. **If you need to install it separately:**
   ```bash
   npm install @react-native-async-storage/async-storage
   ```

---

## 4. Environment Variable for JWT Secret Key

### On Render:

1. **Go to your Render dashboard**
2. **Select your API service**
3. **Go to "Environment" tab**
4. **Add a new environment variable:**
   - **Key:** `JWT_SECRET_KEY`
   - **Value:** Generate a secure random string (see below)
5. **Save changes** - Render will automatically restart your service

### Generate a Secure Secret Key:

**Option 1: Using Python:**
```python
import secrets
print(secrets.token_urlsafe(32))
```

**Option 2: Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Option 3: Using online generator:**
- Use a secure random string generator (at least 32 characters)

### Local Development (.env file):

1. **Create or edit `.env` file in `apps/api/`:**
   ```bash
   cd apps/api
   ```

2. **Add the JWT secret key:**
   ```env
   DATABASE_URL=postgresql://user:password@host:port/database
   JWT_SECRET_KEY=your-super-secret-key-here-minimum-32-characters
   ```

3. **Make sure `.env` is in `.gitignore`** (don't commit secrets!)

### Verify it's working:

The code in `auth.py` now reads from `settings.jwt_secret_key`, which will:
- Use `JWT_SECRET_KEY` from environment variables if set
- Fall back to the default (development only) if not set

---

## Quick Checklist

- [ ] Run database migration (add `password_hash` column)
- [ ] Set passwords for employees using `/auth/set-password`
- [ ] Install mobile dependencies (`npm install` in `apps/mobile`)
- [ ] Add `JWT_SECRET_KEY` to Render environment variables
- [ ] Add `JWT_SECRET_KEY` to local `.env` file for development
- [ ] Test login with an employee account

---

## Testing the Setup

1. **Set a password for an employee:**
   ```bash
   curl -X POST "https://your-api.onrender.com/auth/set-password?employee_id=EMPLOYEE_UUID&password=test123"
   ```

2. **Test login:**
   ```bash
   curl -X POST "https://your-api.onrender.com/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"employee@example.com","password":"test123"}'
   ```

3. **You should get back a token:**
   ```json
   {
     "access_token": "eyJ...",
     "token_type": "bearer",
     "employee_id": "...",
     "name": "Employee Name",
     "email": "employee@example.com",
     "company_id": "..."
   }
   ```

---

## Troubleshooting

### Migration fails:
- Check your `DATABASE_URL` is correct
- Make sure you have permissions to alter the table
- Try running the SQL manually if needed

### Can't set passwords:
- Make sure the employee_id is a valid UUID
- Check that the API endpoint is accessible
- Verify the employee exists in the database

### Login doesn't work:
- Verify password was set correctly
- Check that `JWT_SECRET_KEY` is set in environment
- Make sure the employee is active (`is_active = true`)

### Mobile app can't store tokens:
- Make sure `@react-native-async-storage/async-storage` is installed
- Check that the app has storage permissions (should be automatic)

