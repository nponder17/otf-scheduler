# Database Migration Instructions for Render PostgreSQL

## Your Connection String
```
postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db
```

## Option 1: Using psql Command Line (Recommended)

### If you have psql installed:

1. **Run the migration script:**
   ```bash
   ./run_migration.sh
   ```

2. **Or connect manually:**
   ```bash
   psql "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db"
   ```

3. **Then run the SQL:**
   ```sql
   ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
   ```

### Install psql (if needed):

**macOS:**
```bash
brew install postgresql
```

**Linux:**
```bash
sudo apt-get install postgresql-client
```

**Windows:**
Download from: https://www.postgresql.org/download/windows/

---

## Option 2: Using Render's Web Interface

1. **Go to your Render dashboard**
2. **Click on your PostgreSQL database**
3. **Look for "Connect" or "Shell" button**
4. **If there's a SQL editor, paste this:**
   ```sql
   ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
   ```
5. **Click "Run" or "Execute"**

---

## Option 3: Using a GUI Tool

### Using DBeaver (Free, Cross-platform):

1. **Download DBeaver:** https://dbeaver.io/download/
2. **Create new connection:**
   - Database: PostgreSQL
   - Host: `dpg-d5p6sn6r433s73d3uiog-a`
   - Port: `5432` (default)
   - Database: `otf_scheduler_db`
   - Username: `otf_scheduler_db_user`
   - Password: `jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs`
3. **Connect, then run:**
   ```sql
   ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
   ```

### Using pgAdmin:

1. **Download pgAdmin:** https://www.pgadmin.org/download/
2. **Add server with your connection details**
3. **Open Query Tool and run the SQL**

---

## Option 4: Using Python Script

Create a file `migrate_db.py`:

```python
import psycopg2

# Your connection string
conn_string = "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db"

try:
    conn = psycopg2.connect(conn_string)
    cursor = conn.cursor()
    
    # Run migration
    cursor.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;")
    
    # Verify
    cursor.execute("""
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'employees' AND column_name = 'password_hash'
    """)
    
    result = cursor.fetchone()
    if result:
        print(f"✅ Migration successful! Column added: {result}")
    else:
        print("❌ Column not found")
    
    conn.commit()
    cursor.close()
    conn.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
```

Run it:
```bash
pip install psycopg2-binary
python migrate_db.py
```

---

## Option 5: Direct SQL Command (One-liner)

If you have `psql` installed, you can run this single command:

```bash
psql "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db" -c "ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;"
```

---

## Verify Migration

After running the migration, verify it worked:

```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'employees' AND column_name = 'password_hash';
```

You should see:
```
column_name   | data_type | is_nullable
--------------+-----------+-------------
password_hash | character varying | YES
```

---

## Troubleshooting

### "Column already exists" error:
- The `IF NOT EXISTS` clause should prevent this
- If you still get an error, the column might already be there - check with the verification query above

### Connection refused:
- Make sure your IP is allowed in Render's database settings
- Check that the database is running
- Verify the connection string is correct

### Permission denied:
- Make sure you're using the correct username/password
- Check that the user has ALTER TABLE permissions

---

## Next Steps

After the migration:
1. ✅ Column `password_hash` added to `employees` table
2. Set employee passwords using `/auth/set-password` endpoint
3. Test login functionality

