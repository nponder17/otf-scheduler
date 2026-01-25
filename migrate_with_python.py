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

# Your Render PostgreSQL EXTERNAL connection string (for connecting from outside Render)
# Use the External Database URL from Render dashboard
CONN_STRING = "postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a.oregon-postgres.render.com/otf_scheduler_db?sslmode=require"

print("🔌 Connecting to database...")
print("   (Trying with SSL enabled...)")

try:
    # Try with SSL first
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
    print("\n💡 Trying alternative connection methods...")
    
    # Try alternative: parse connection string and connect with explicit SSL
    try:
        import urllib.parse as urlparse
        url = urlparse.urlparse("postgresql://otf_scheduler_db_user:jVKlxR0DpXkwPgqGiomxitzp4nkMxbfs@dpg-d5p6sn6r433s73d3uiog-a.oregon-postgres.render.com/otf_scheduler_db")
        
        # Try with explicit connection parameters
        conn = psycopg2.connect(
            host=url.hostname,
            port=url.port or 5432,
            database=url.path[1:],  # Remove leading /
            user=url.username,
            password=url.password,
            sslmode='require'
        )
        print("✅ Connected with explicit SSL parameters!")
        
        # Continue with migration
        cursor = conn.cursor()
        print("📝 Running migration...")
        cursor.execute("ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR;")
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
        conn.commit()
        cursor.close()
        conn.close()
        print("✅ Done!")
        sys.exit(0)
        
    except Exception as e2:
        print(f"❌ Alternative connection also failed: {e2}")
        print("\n💡 Tips:")
        print("   1. Check Render dashboard → Database → Settings → 'Allow connections from'")
        print("   2. Your IP might need to be whitelisted")
        print("   3. Try using Render's 'Internal Database URL' if available")
        print("   4. The database might be paused - check Render dashboard")
        sys.exit(1)
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)

