from sqlalchemy import text
from app.core.database import engine

with engine.connect() as conn:
    print(conn.execute(text("SELECT current_database()")).scalar())
    print(conn.execute(text("SELECT current_user")).scalar())