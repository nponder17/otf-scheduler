# Quick Migration Guide

## Easiest Method: Python Script

Since psql connection might have issues, use the Python script:

```bash
# Install psycopg2 if needed
pip install psycopg2-binary

# Run the migration
python migrate_with_python.py
```

Or if you're in the virtual environment:
```bash
python migrate_with_python.py
```

---

## Alternative: Use Render's Web Interface

1. Go to https://dashboard.render.com
2. Click on your PostgreSQL database
3. Look for "Connect" or "SQL Editor" button
4. Paste this SQL:
   ```sql
   ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
   ```
5. Click "Run" or "Execute"

---

## Alternative: Direct Connection String

If you want to try psql again, make sure to use the full connection string in quotes:

```bash
psql "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db" -c "ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;"
```

**Note:** If this doesn't work, it might be because:
- Your IP needs to be whitelisted in Render
- The database might require SSL connection
- Use the Python script instead (recommended)

---

## Verify Migration

After running, verify with:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'employees' AND column_name = 'password_hash';
```

