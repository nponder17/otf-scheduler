#!/bin/bash
# Script to run the database migration for managers and system_admins tables
# This uses Alembic to run the migration

set -e

echo "🔄 Running database migration for managers and system_admins tables..."

cd apps/api

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found in apps/api directory"
    echo "   Please create a .env file with DATABASE_URL and JWT_SECRET_KEY"
    exit 1
fi

# Run Alembic upgrade
echo "📦 Running Alembic upgrade..."
alembic upgrade head

echo "✅ Migration completed successfully!"
echo ""
echo "Next steps:"
echo "1. Create your first system admin account using:"
echo "   python create_system_admin.py <email> <password> <name>"
echo ""
echo "   Example:"
echo "   python create_system_admin.py admin@example.com mypassword123 \"System Admin\""

