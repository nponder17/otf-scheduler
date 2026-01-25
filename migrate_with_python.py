#!/usr/bin/env python3
"""
Python script to run the password_hash migration on Render PostgreSQL
This works even if psql isn't installed properly.
"""

import sys

try:
    import psycopg2
except ImportError:
    print("❌ psycopg2 not installed. Installing...")
    print("Run: pip install psycopg2-binary")
    sys.exit(1)

# Your Render PostgreSQL connection string
CONN_STRING = "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a/otf_scheduler_db"

print("🔌 Connecting to database...")

try:
    conn = psycopg2.connect(CONN_STRING)
    cursor = conn.cursor()
    
    print("✅ Connected!")
    print("📝 Running migration...")
    
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
        print(f"✅ Migration successful!")
        print(f"   Column: {result[0]}")
        print(f"   Type: {result[1]}")
        print(f"   Nullable: {result[2]}")
    else:
        print("⚠️  Column not found after migration")
    
    conn.commit()
    cursor.close()
    conn.close()
    
    print("✅ Done!")
    
except psycopg2.OperationalError as e:
    print(f"❌ Connection error: {e}")
    print("\n💡 Tips:")
    print("   1. Make sure your IP is allowed in Render database settings")
    print("   2. Check that the database is running")
    print("   3. Verify the connection string is correct")
    sys.exit(1)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

