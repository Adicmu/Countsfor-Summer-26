"""Safe additive migrations for existing deploys.

SQLAlchemy `create_all()` only creates missing tables; it does not add columns.
This module runs idempotent ALTER TABLE steps so SQLite (local) and Postgres
(production / Supabase) stay in sync without Alembic.
"""
from sqlalchemy import inspect, text

from .db import db


def _column_names(table: str) -> set[str]:
    insp = inspect(db.engine)
    if table not in insp.get_table_names():
        return set()
    return {c["name"] for c in insp.get_columns(table)}


def _add_column_if_missing(table: str, column: str, ddl_sqlite: str, ddl_pg: str | None = None) -> bool:
    """Return True if the column was added."""
    if column in _column_names(table):
        return False
    dialect = db.engine.dialect.name
    ddl = (ddl_pg or ddl_sqlite) if dialect == "postgresql" else ddl_sqlite
    db.session.execute(text(f"ALTER TABLE {table} ADD COLUMN {ddl}"))
    db.session.commit()
    return True


def _table_exists(table: str) -> bool:
    return table in inspect(db.engine).get_table_names()


def _ensure_password_reset_tokens_table() -> bool:
    """Create password_reset_tokens on deploys that ran create_all before the model existed."""
    if _table_exists("password_reset_tokens"):
        return False
    dialect = db.engine.dialect.name
    if dialect == "postgresql":
        ddl = """
            CREATE TABLE password_reset_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMPTZ NOT NULL,
                used BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """
    else:
        ddl = """
            CREATE TABLE password_reset_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        """
    db.session.execute(text(ddl))
    db.session.execute(text("CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens (user_id)"))
    db.session.execute(text("CREATE INDEX ix_password_reset_tokens_token_hash ON password_reset_tokens (token_hash)"))
    db.session.execute(text("CREATE INDEX ix_password_reset_tokens_user_used ON password_reset_tokens (user_id, used)"))
    db.session.commit()
    return True


def run_migrations() -> list[str]:
    """Apply pending migrations. Returns human-readable log lines."""
    log: list[str] = []

    if _ensure_password_reset_tokens_table():
        log.append("Created password_reset_tokens table")

    if _add_column_if_missing(
        "users", "last_login", "last_login TIMESTAMP", "last_login TIMESTAMPTZ"
    ):
        log.append("Added users.last_login")

    if _add_column_if_missing(
        "users",
        "is_admin",
        "is_admin BOOLEAN NOT NULL DEFAULT 0",
        "is_admin BOOLEAN NOT NULL DEFAULT FALSE",
    ):
        log.append("Added users.is_admin")
        # Backfill admin flag from role
        db.session.execute(text("UPDATE users SET is_admin = 1 WHERE role = 'admin'"))
        db.session.commit()
        log.append("Backfilled users.is_admin from role")

    if _add_column_if_missing("users", "department", "department VARCHAR(200)"):
        log.append("Added users.department")
        if "department_scope" in _column_names("users"):
            db.session.execute(
                text("UPDATE users SET department = department_scope WHERE department IS NULL AND department_scope IS NOT NULL")
            )
            db.session.commit()
            log.append("Copied department_scope into department where empty")

    if _add_column_if_missing(
        "users",
        "profile_completed",
        "profile_completed BOOLEAN NOT NULL DEFAULT 0",
        "profile_completed BOOLEAN NOT NULL DEFAULT FALSE",
    ):
        log.append("Added users.profile_completed")
        # Existing rows with a complete profile should skip onboarding next login.
        db.session.execute(text("""
            UPDATE users SET profile_completed = 1 WHERE
              role = 'admin'
              OR (role = 'student' AND primary_program IS NOT NULL AND primary_program != '')
              OR (role = 'professor' AND primary_program IS NOT NULL)
              OR (role IN ('area_head', 'associate_area_head') AND (
                    primary_program IS NOT NULL OR primary_program IS NULL
                  ))
              OR (role = 'advisor' AND advisor_scope IS NOT NULL)
        """))
        db.session.commit()
        log.append("Backfilled users.profile_completed for existing complete profiles")

    if _add_column_if_missing("users", "password_hash", "password_hash VARCHAR(255)"):
        log.append("Added users.password_hash")

    if _add_column_if_missing("users", "reset_token_hash", "reset_token_hash VARCHAR(255)"):
        log.append("Added users.reset_token_hash")

    if _add_column_if_missing(
        "users", "reset_token_expires", "reset_token_expires TIMESTAMP", "reset_token_expires TIMESTAMPTZ"
    ):
        log.append("Added users.reset_token_expires")

    return log
