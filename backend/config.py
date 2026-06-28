"""Centralized configuration. All values come from env vars so the same code
runs locally, on Render, and in tests without edits.

Required env vars in production:
  SECRET_KEY        — random 32+ byte string for cookie signing
  DATABASE_URL      — full Postgres URL (Render provides one for free)
  GOOGLE_CLIENT_ID  — OAuth client ID from Google Cloud Console
  FRONTEND_ORIGIN   — CORS allow-list, comma-separated
                      e.g. "https://adicmu.github.io,http://localhost:8765"
  ADMIN_EMAILS      — comma-separated andrew.cmu.edu emails granted admin role
                      e.g. "avivek@andrew.cmu.edu,ladyhodhod@andrew.cmu.edu"

Optional:
  ALLOWED_EMAIL_DOMAIN  — restrict signups to one domain (e.g. "andrew.cmu.edu")
                          leave empty to allow any verified Google account
"""
import os
from pathlib import Path

# Load .env in development. In production env vars come from the host (Render).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass


def _csv(env_value: str) -> list[str]:
    return [v.strip() for v in (env_value or "").split(",") if v.strip()]


class Config:
    # ── Flask core ────────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    # Cookie / session settings — cross-origin (GH Pages → Render) needs
    # SameSite=None + Secure=True over HTTPS.
    IS_PRODUCTION = os.environ.get("FLASK_ENV", "development") == "production"
    SESSION_COOKIE_NAME = "cf_session"
    SESSION_COOKIE_SECURE = IS_PRODUCTION
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "None" if IS_PRODUCTION else "Lax"
    PERMANENT_SESSION_LIFETIME = 60 * 60 * 24 * 180  # ~6 months ("remember me")

    # ── Database ──────────────────────────────────────────────
    # Render gives postgres:// — SQLAlchemy 2 wants postgresql://
    _raw_db = os.environ.get("DATABASE_URL", "sqlite:///countsfor.db")
    if _raw_db.startswith("postgres://"):
        _raw_db = _raw_db.replace("postgres://", "postgresql://", 1)
    SQLALCHEMY_DATABASE_URI = _raw_db
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    # Fail fast on Render if Postgres is misconfigured instead of hanging gunicorn.
    _engine_opts: dict = {"pool_pre_ping": True}
    if _raw_db.startswith("postgresql"):
        _engine_opts["connect_args"] = {"connect_timeout": 10}
    SQLALCHEMY_ENGINE_OPTIONS = _engine_opts

    # ── Auth ──────────────────────────────────────────────────
    GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
    ALLOWED_EMAIL_DOMAIN = os.environ.get("ALLOWED_EMAIL_DOMAIN", "").strip().lower()
    # The core admin team is baked in so they're ALWAYS admins on deploy,
    # regardless of the Render dashboard env var. Any emails set in the
    # ADMIN_EMAILS env var are merged on top (never replace these).
    _DEFAULT_ADMINS = {
        "hjendara@andrew.cmu.edu",   # Hind Jendara
        "avivek@andrew.cmu.edu",     # Aditya Vivek
        "hbouamor@andrew.cmu.edu",   # Houda Bouamor
        "spessoa@andrew.cmu.edu",    # Silvia Pessoa
    }
    ADMIN_EMAILS = _DEFAULT_ADMINS | {e.lower() for e in _csv(os.environ.get("ADMIN_EMAILS"))}
    SEED_USERS_PATH = os.environ.get(
        "SEED_USERS_PATH",
        str(Path(__file__).resolve().parent / "seed_users.json"),
    )

    # ── CORS ──────────────────────────────────────────────────
    FRONTEND_ORIGINS = _csv(os.environ.get(
        "FRONTEND_ORIGIN",
        "http://localhost:8765,https://adicmu.github.io"
    ))


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    SECRET_KEY = "test-secret"
    GOOGLE_CLIENT_ID = "test-google-client-id"
    ADMIN_EMAILS = {"admin@andrew.cmu.edu"}
    ALLOWED_EMAIL_DOMAIN = ""
    SESSION_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    FRONTEND_ORIGINS = ["http://localhost:8765"]
    SEED_USERS_PATH = ""
