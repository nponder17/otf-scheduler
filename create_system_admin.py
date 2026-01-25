#!/usr/bin/env python3
"""
Script to create the first system admin account.
Run this after the database migration has been completed.

Usage:
    python create_system_admin.py <email> <password> <name>
    
Example:
    python create_system_admin.py admin@example.com mypassword123 "System Admin"
"""

import sys
import os
from pathlib import Path
from passlib.context import CryptContext

# Add the apps/api directory to the path so we can import from app
api_dir = Path(__file__).parent / "apps" / "api"
sys.path.insert(0, str(api_dir))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.system_admin import SystemAdmin
from app.core.config import settings

# Password hashing context (same as in auth.py)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)

def create_system_admin(email: str, password: str, name: str):
    """Create a system admin account in the database."""
    # Create database connection
    engine = create_engine(settings.database_url)
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
            password_hash=get_password_hash(password),
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
        return False
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python create_system_admin.py <email> <password> <name>")
        print('Example: python create_system_admin.py admin@example.com mypassword123 "System Admin"')
        sys.exit(1)
    
    email = sys.argv[1]
    password = sys.argv[2]
    name = sys.argv[3]
    
    if not email or not password or not name:
        print("❌ Email, password, and name are required!")
        sys.exit(1)
    
    success = create_system_admin(email, password, name)
    sys.exit(0 if success else 1)

