"""Auth route tests. /api/auth/google's signature check is mocked — real
JWT verification needs network round-trips to Google."""
from unittest.mock import patch
import pytest

from backend.db import db
from backend.models import User
from .conftest import login


def _fake_google_payload(email="alice@andrew.cmu.edu", verified=True, sub="g-123"):
    return {
        "sub": sub,
        "email": email,
        "email_verified": verified,
        "name": "Alice Example",
    }


# ── Google sign-in flow ─────────────────────────────────────

def test_google_signin_creates_user(client):
    with patch("backend.auth.id_token.verify_oauth2_token", return_value=_fake_google_payload()):
        r = client.post("/api/auth/google", json={"credential": "stub-jwt"})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["email"] == "alice@andrew.cmu.edu"
    assert body["role"] == "student"  # default

    # User row was persisted
    with client.application.app_context():
        u = db.session.query(User).filter_by(email="alice@andrew.cmu.edu").one()
        assert u.google_sub == "g-123"


def test_google_signin_reuses_existing_user(client):
    # First login creates
    with patch("backend.auth.id_token.verify_oauth2_token", return_value=_fake_google_payload()):
        client.post("/api/auth/google", json={"credential": "stub"})
    # Second login finds the same row
    with patch("backend.auth.id_token.verify_oauth2_token", return_value=_fake_google_payload()):
        client.post("/api/auth/google", json={"credential": "stub"})
    with client.application.app_context():
        assert db.session.query(User).count() == 1


def test_google_signin_promotes_admin_via_env(client):
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake_google_payload(email="admin@andrew.cmu.edu", sub="g-admin")):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    assert r.get_json()["role"] == "admin"


def test_google_signin_rejects_unverified_email(client):
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake_google_payload(verified=False)):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    assert r.status_code == 401
    assert r.get_json()["error"] == "email_unverified"


def test_google_signin_rejects_bad_signature(client):
    with patch("backend.auth.id_token.verify_oauth2_token", side_effect=ValueError("bad sig")):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    assert r.status_code == 401
    assert r.get_json()["error"] == "invalid_token"


def test_google_signin_missing_credential(client):
    r = client.post("/api/auth/google", json={})
    assert r.status_code == 400
    assert r.get_json()["error"] == "missing_credential"


# ── /api/me ─────────────────────────────────────────────────

def test_me_unauthenticated(client):
    r = client.get("/api/me")
    assert r.status_code == 401


def test_me_returns_profile(client, student):
    login(client, student)
    r = client.get("/api/me")
    assert r.status_code == 200
    body = r.get_json()
    assert body["email"] == student.email
    assert body["role"] == "student"
    assert "google_sub" not in body  # not exposed


def test_patch_me_updates_profile(client, student):
    login(client, student)
    r = client.patch("/api/me", json={"primary_program": "BA", "minor_code": "history"})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["primary_program"] == "BA"
    assert body["minor_code"] == "history"


def test_patch_me_rejects_unknown_fields(client, student):
    login(client, student)
    r = client.patch("/api/me", json={"is_evil": True})
    assert r.status_code == 400


def test_patch_me_admin_cannot_self_demote(client, admin):
    login(client, admin)
    r = client.patch("/api/me", json={"role": "student"})
    assert r.status_code == 400
    assert r.get_json()["error"] == "cannot_change_admin_role"


# ── Logout ──────────────────────────────────────────────────

def test_logout_clears_session(client, student):
    login(client, student)
    assert client.get("/api/me").status_code == 200
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert client.get("/api/me").status_code == 401
