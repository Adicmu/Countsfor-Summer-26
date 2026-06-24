"""Auth route tests. /api/auth/google's signature check is mocked — real
JWT verification needs network round-trips to Google."""
import json
from unittest.mock import patch
import pytest

from backend.app import create_app
from backend.config import TestConfig
from backend.db import db
from backend.models import User
from .conftest import login


def _fake(email, sub):
    return {"sub": sub, "email": email, "email_verified": True, "name": email.split("@")[0]}


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
    body = r.get_json()
    assert body["role"] == "admin"
    assert body["profile_completed"] is True


def test_google_signin_marks_seeded_faculty_complete(client):
    from backend.db import db
    from backend.models import User

    with client.application.app_context():
        u = User(
            email="prof@andrew.cmu.edu",
            name="Prof",
            role="professor",
            primary_program="CS",
            google_sub="g-prof-seed",
        )
        db.session.add(u)
        db.session.commit()

    with patch(
        "backend.auth.id_token.verify_oauth2_token",
        return_value=_fake_google_payload(email="prof@andrew.cmu.edu", sub="g-prof-seed"),
    ):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    body = r.get_json()
    assert body["role"] == "professor"
    assert body["profile_completed"] is True


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


def test_patch_me_student_cannot_promote_to_professor(client, student):
    login(client, student)
    r = client.patch("/api/me", json={"role": "professor", "primary_program": "CS"})
    assert r.status_code == 403
    assert r.get_json()["error"] == "forbidden_role"


# ── PATCH /api/me cross-field validation ────────────────────

def test_patch_me_rejects_student_without_program(client, student):
    login(client, student)
    # Trying to clear primary_program while keeping role=student
    r = client.patch("/api/me", json={"primary_program": ""})
    assert r.status_code == 400
    assert r.get_json()["error"] == "inconsistent_profile"


def test_patch_me_rejects_advisor_major_scope_without_program(client):
    # Seed a fresh advisor user via session
    from backend.db import db
    from backend.models import User
    with client.application.app_context():
        u = User(email="adv@andrew.cmu.edu", name="Adv", role="advisor", advisor_scope="major", primary_program="CS", google_sub="g-adv")
        db.session.add(u); db.session.commit()
        uid = u.id
    with client.session_transaction() as s: s.clear(); s["uid"] = uid; s.permanent = True

    # Trying to clear primary_program while role=advisor + scope=major
    r = client.patch("/api/me", json={"primary_program": ""})
    assert r.status_code == 400
    assert r.get_json()["error"] == "inconsistent_profile"


def test_patch_me_accepts_consistent_advisor_minor(client):
    from backend.db import db
    from backend.models import User
    with client.application.app_context():
        u = User(email="adv2@andrew.cmu.edu", name="Adv2", role="advisor", advisor_scope="major", primary_program="CS", google_sub="g-adv2")
        db.session.add(u); db.session.commit()
        uid = u.id
    with client.session_transaction() as s: s.clear(); s["uid"] = uid; s.permanent = True

    # Switch advisor from major-scope CS to minor-scope History
    r = client.patch("/api/me", json={
        "advisor_scope": "minor",
        "primary_program": "",
        "minor_code": "history",
    })
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["advisor_scope"] == "minor"
    assert body["primary_program"] is None
    assert body["minor_code"] == "history"


def test_patch_me_rejects_advisor_all_programs_with_program(client):
    from backend.db import db
    from backend.models import User
    with client.application.app_context():
        u = User(email="adv3@andrew.cmu.edu", name="Adv3", role="advisor", advisor_scope="all_programs", google_sub="g-adv3")
        db.session.add(u); db.session.commit()
        uid = u.id
    with client.session_transaction() as s: s.clear(); s["uid"] = uid; s.permanent = True

    # all_programs scope should not also have a primary_program
    r = client.patch("/api/me", json={"primary_program": "CS"})
    assert r.status_code == 400
    assert r.get_json()["error"] == "inconsistent_profile"


# ── Admin demotion / no-demotion via env ───────────────────

def test_google_signin_does_not_demote_existing_non_admin(client):
    """If a user is a professor and their email isn't in ADMIN_EMAILS,
    re-login must not silently change their role."""
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake_google_payload(email="prof@andrew.cmu.edu", sub="g-prof")):
        # First login — creates as student (default), but we then update role to professor
        client.post("/api/auth/google", json={"credential": "stub"})

    from backend.db import db
    from backend.models import User
    with client.application.app_context():
        u = db.session.query(User).filter_by(email="prof@andrew.cmu.edu").one()
        u.role = "professor"
        u.primary_program = "IS"
        db.session.commit()

    # Re-login — role must stay professor
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake_google_payload(email="prof@andrew.cmu.edu", sub="g-prof")):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    assert r.get_json()["role"] == "professor"


def test_google_signin_does_not_demote_admin_when_removed_from_env(client):
    """If an existing admin's email is later removed from ADMIN_EMAILS,
    their role stays 'admin' (demotion is manual). Tested by using an email
    NOT in TestConfig.ADMIN_EMAILS but with role pre-set to admin."""
    from backend.db import db
    from backend.models import User
    with client.application.app_context():
        u = User(email="exadmin@andrew.cmu.edu", name="Ex", role="admin", google_sub="g-ex")
        db.session.add(u); db.session.commit()

    # Now they sign in — their email is NOT in ADMIN_EMAILS
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake_google_payload(email="exadmin@andrew.cmu.edu", sub="g-ex")):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    assert r.get_json()["role"] == "admin"  # not demoted


# ── Logout ──────────────────────────────────────────────────

def test_logout_clears_session(client, student):
    login(client, student)
    assert client.get("/api/me").status_code == 200
    r = client.post("/api/auth/logout")
    assert r.status_code == 200
    assert client.get("/api/me").status_code == 401


# ── Self-service role lockdown + seed recognition ───────────

def test_patch_me_rejects_self_assign_faculty(client, student):
    """A student can no longer PATCH themselves into a faculty role — faculty
    roles come from the seed file or an admin (users.py), never self-service."""
    login(client, student)
    r = client.patch("/api/me", json={"role": "professor", "primary_program": "IS"})
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_role"


def test_admin_skips_onboarding(client):
    """An admin (via ADMIN_EMAILS) is profile-complete on login and never gets
    bounced to onboarding — even without a primary_program."""
    with patch("backend.auth.id_token.verify_oauth2_token",
               return_value=_fake("admin@andrew.cmu.edu", "g-admin")):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    body = r.get_json()
    assert body["role"] == "admin"
    assert body["is_admin"] is True
    assert body["profile_completed"] is True


def test_seed_user_recognized_as_faculty_on_signin(tmp_path):
    """A seeded email is recognized as faculty on first login and lands in the
    app (profile complete), instead of self-declaring on the onboarding page."""
    seed = tmp_path / "seed_users.json"
    seed.write_text(json.dumps([
        {"email": "hbouamor@andrew.cmu.edu", "name": "Houda Bouamor",
         "role": "professor", "primary_program": "IS", "department": "Information Systems"},
    ]))

    class SeedConfig(TestConfig):
        SEED_USERS_PATH = str(seed)

    app = create_app(SeedConfig)
    with app.test_client() as c:
        with patch("backend.auth.id_token.verify_oauth2_token",
                   return_value=_fake("hbouamor@andrew.cmu.edu", "g-houda")):
            r = c.post("/api/auth/google", json={"credential": "stub"})
    body = r.get_json()
    assert body["role"] == "professor"
    assert body["primary_program"] == "IS"
    assert body["profile_completed"] is True


def test_admin_email_overrides_seed_role(tmp_path):
    """If an email is both seeded as faculty AND in ADMIN_EMAILS, admin wins."""
    seed = tmp_path / "seed_users.json"
    seed.write_text(json.dumps([
        {"email": "admin@andrew.cmu.edu", "role": "professor", "primary_program": "IS"},
    ]))

    class SeedConfig(TestConfig):
        SEED_USERS_PATH = str(seed)

    app = create_app(SeedConfig)
    with app.test_client() as c:
        with patch("backend.auth.id_token.verify_oauth2_token",
                   return_value=_fake("admin@andrew.cmu.edu", "g-admin")):
            r = c.post("/api/auth/google", json={"credential": "stub"})
    assert r.get_json()["role"] == "admin"
