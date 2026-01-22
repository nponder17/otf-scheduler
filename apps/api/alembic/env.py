from logging.config import fileConfig
import os

from sqlalchemy import engine_from_config, pool
from alembic import context

from dotenv import load_dotenv

# -------------------------------------------------------------------
# Load environment variables (.env in apps/api/)
# -------------------------------------------------------------------
load_dotenv()

# -------------------------------------------------------------------
# Alembic Config object
# -------------------------------------------------------------------
config = context.config

# -------------------------------------------------------------------
# Override sqlalchemy.url from DATABASE_URL
# (avoids alembic.ini interpolation issues)
# -------------------------------------------------------------------
db_url = os.getenv("DATABASE_URL")
if not db_url:
    raise RuntimeError(
        "DATABASE_URL is not set. Check apps/api/.env"
    )

config.set_main_option("sqlalchemy.url", db_url)

# -------------------------------------------------------------------
# Logging configuration
# -------------------------------------------------------------------
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# -------------------------------------------------------------------
# Import models & metadata for autogenerate
# -------------------------------------------------------------------
from app.core.database import Base
from app.models.company import Company 
from app.models.company import Company  # noqa: F401
from app.models.employee import Employee  # noqa: F401
from app.models.role import Role  # noqa: F401
from app.models.employee_role import EmployeeRole  # noqa: F401 # noqa: F401
from app.models.availability import EmployeeAvailability  # noqa: F401
from app.models.unavailability import EmployeeUnavailability  # noqa: F401
from app.models.time_off import EmployeeTimeOff  # noqa: F401
from app.models.rules import EmployeeRule  # noqa: F401

target_metadata = Base.metadata

# -------------------------------------------------------------------
# Offline migrations
# -------------------------------------------------------------------
def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

# -------------------------------------------------------------------
# Online migrations
# -------------------------------------------------------------------
def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )

        with context.begin_transaction():
            context.run_migrations()

# -------------------------------------------------------------------
# Entrypoint
# -------------------------------------------------------------------
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
