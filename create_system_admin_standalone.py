#!/usr/bin/env python3
"""
Standalone script to create the first system admin account.
This script doesn't require importing the full app structure.

Usage:
    python create_system_admin_standalone.py <email> <password> <name> <database_url>
    
Example:
    python create_system_admin_standalone.py admin@example.com mypassword123 "System Admin" "postgresql://user:pass@host/db"
"""

import sys
import uuid
from datetime import datetime
import bcrypt
from sqlalchemy import create_engine, Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

# SystemAdmin model (simplified, doesn't import from app)
class SystemAdmin(Base):
    __tablename__ = "system_admins"
    
    admin_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

def create_system_admin(email: str, password: str, name: str, database_url: str):
    """Create a system admin account in the database."""
    # Password hashing using bcrypt directly
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    password_hash = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
    
    # Create database connection
    engine = create_engine(database_url)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    try:
        # Check if admin with this email already exists
        existing = db.query(SystemAdmin).filter(SystemAdmin.email == email.lower()).first()
        if existing:
            print(f"❌ System admin with email {email} already exists!")
            return False
        
        # Create new system admin
        admin = SystemAdmin(
            name=name,
            email=email.lower(),
            password_hash=password_hash,
            is_active=True,
        )
        
        db.add(admin)
        db.commit()
        db.refresh(admin)
        
        print(f"✅ System admin created successfully!")
        print(f"   Admin ID: {admin.admin_id}")
        print(f"   Name: {admin.name}")
        print(f"   Email: {admin.email}")
        print(f"   Active: {admin.is_active}")
        
        return True
    except Exception as e:
        db.rollback()
        print(f"❌ Error creating system admin: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python create_system_admin_standalone.py <email> <password> <name> <database_url>")
        print('Example: python create_system_admin_standalone.py admin@example.com mypassword123 "System Admin" "postgresql://user:pass@host/db"')
        print("\nTo get your database URL from Render:")
        print("1. Go to your Render dashboard")
        print("2. Click on your PostgreSQL database")
        print("3. Copy the 'Internal Database URL' or 'External Database URL'")
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3]
    database_url = sys.argv[4]
    
    if not email or not password or not name or not database_url:
        print("❌ Email, password, name, and database_url are required!")
        sys.exit(1)
    
    success = create_system_admin(email, password, name, database_url)
    sys.exit(0 if success else 1)

