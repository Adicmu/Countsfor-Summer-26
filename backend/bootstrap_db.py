"""One-shot database bootstrap for Render pre-deploy.

Render runs this once before gunicorn starts so workers do not race on
ALTER TABLE and the web process can bind to $PORT immediately.
"""
from __future__ import annotations

import sys
from urllib.parse import urlparse, urlunparse

from sqlalchemy import inspect, text

from .app import create_app, init_database
from .db import db

REQUIRED_TABLES = frozenset({
    "users",
    "flags",
    "wishlist_items",
    "password_reset_tokens",
    "user_minors",
    "directory_entries",
})


def redact_database_url(url: str) -> str:
    """Return connection URL with password replaced for safe logging."""
    parsed = urlparse(url)
    netloc = parsed.netloc
    if "@" in netloc:
        creds, host = netloc.rsplit("@", 1)
        if ":" in creds:
            user, _password = creds.split(":", 1)
            netloc = f"{user}:***@{host}"
        else:
            netloc = f"{creds}:***@{host}"
    return urlunparse(parsed._replace(netloc=netloc))


def verify_bootstrap(app) -> None:
    """Fail loudly unless required tables exist in the connected database."""
    with app.app_context():
        uri = app.config["SQLALCHEMY_DATABASE_URI"]
        print(f"Database target: {redact_database_url(uri)}")

        if not uri.startswith("postgresql"):
            print(
                f"FATAL: bootstrap expected PostgreSQL but got {uri!r}. "
                "Refusing to report success.",
                file=sys.stderr,
            )
            raise SystemExit(1)

        dialect = db.engine.dialect.name
        print(f"Database dialect: {dialect}")

        present = set(inspect(db.engine).get_table_names())
        missing = REQUIRED_TABLES - present
        if missing:
            print(
                f"FATAL: bootstrap verification failed — missing tables: {sorted(missing)}",
                file=sys.stderr,
            )
            raise SystemExit(1)

        found = sorted(REQUIRED_TABLES & present)
        print(f"Required tables present ({len(found)}): {', '.join(found)}")

        # Sanity query — proves we are talking to a live Postgres instance.
        db.session.execute(text("SELECT 1"))
        db.session.commit()


def main() -> None:
    app = create_app(bootstrap_db=False)
    logs = init_database(app)
    for line in logs:
        print(line)
    verify_bootstrap(app)
    print("Database bootstrap OK")


if __name__ == "__main__":
    main()
