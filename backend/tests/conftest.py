"""Test fixtures. Each test gets a fresh in-memory SQLite DB so cases don't
contaminate each other. Auth is stubbed by directly seeding sessions —
verifying Google's signature requires real Google traffic, which isn't
appropriate for unit tests. The /api/auth/google route itself is tested
separately by mocking `id_token.verify_oauth2_token`.
"""
import pytest

from backend.app import create_app
from backend.config import TestConfig
from backend.db import db
from backend.models import User


@pytest.fixture
def app():
    """Create app + reset tables. Importantly, we do NOT keep an app_context
    pushed for the duration of the test — Flask's RequestContext reuses any
    matching app context already on the stack, which causes `g` (and the
    `g._current_user` cache) to persist across test-client requests. Each
    request must push its own context for isolation."""
    app = create_app(TestConfig)
    with app.app_context():
        db.drop_all()
        db.create_all()
        from backend.migrate import run_migrations
        run_migrations()
    yield app
    with app.app_context():
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def _make_user(app, email: str, role: str = "student", **kw) -> User:
    """Create a user inside a short-lived app context, then detach so the
    returned object can be safely passed to tests (the test then logs in
    via the session helper rather than touching the live ORM instance)."""
    with app.app_context():
        user = User(
            email=email,
            name=kw.get("name", email.split("@", 1)[0]),
            role=role,
            primary_program=kw.get("primary_program"),
            minor_code=kw.get("minor_code"),
            advisor_scope=kw.get("advisor_scope"),
            google_sub=kw.get("google_sub", "stub-" + email),
        )
        db.session.add(user)
        db.session.commit()
        # Capture scalar attributes before the context exits and the row detaches.
        snapshot = type("UserSnapshot", (), {
            "id": user.id, "email": user.email, "name": user.name, "role": user.role,
            "primary_program": user.primary_program, "minor_code": user.minor_code,
            "advisor_scope": user.advisor_scope,
        })
    return snapshot


@pytest.fixture
def student(app):
    return _make_user(app, "alice@andrew.cmu.edu", role="student", primary_program="CS")


@pytest.fixture
def professor(app):
    return _make_user(app, "prof@andrew.cmu.edu", role="professor", primary_program="IS")


@pytest.fixture
def area_head(app):
    return _make_user(app, "ah@andrew.cmu.edu", role="area_head", primary_program="CS")


@pytest.fixture
def advisor(app):
    return _make_user(app, "advisor@andrew.cmu.edu", role="advisor", advisor_scope="minor", minor_code="history")


@pytest.fixture
def admin(app):
    return _make_user(app, "admin@andrew.cmu.edu", role="admin")


def login(client, user):
    """Helper — directly set the session cookie as if Google SSO had run.

    Werkzeug's test client keeps cookies from previous real responses in its
    internal `_cookies` jar. `session_transaction()` reads the signed cookie,
    modifies the session, and writes it back — but the jar already has the
    previous cookie, so when switching users mid-test we need to clear it
    first. (`client.delete_cookie()` only schedules a delete header for the
    next request, which is too late.)"""
    client._cookies.clear()
    with client.session_transaction() as sess:
        sess.clear()
        sess["uid"] = user.id
        sess.permanent = True
