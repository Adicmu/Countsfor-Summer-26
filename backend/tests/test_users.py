"""User management route tests."""
from .conftest import login


def test_list_users_requires_manager(client, student):
    login(client, student)
    r = client.get("/api/users")
    assert r.status_code == 403


def test_admin_lists_users(client, admin, student):
    login(client, admin)
    r = client.get("/api/users")
    assert r.status_code == 200
    emails = {u["email"] for u in r.get_json()["items"]}
    assert student.email in emails


def test_area_head_can_patch_user_role(client, area_head):
    from backend.db import db
    from backend.models import User

    with client.application.app_context():
        u = User(
            email="newbie@andrew.cmu.edu",
            name="New",
            role="student",
            google_sub="g-new",
        )
        db.session.add(u)
        db.session.commit()
        uid = u.id

    login(client, area_head)
    r = client.patch(
        f"/api/users/{uid}",
        json={"role": "professor", "primary_program": "CS"},
    )
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["role"] == "professor"
    assert r.get_json()["profile_completed"] is True


def test_admin_can_set_student_multiple_minors(client, admin):
    from backend.db import db
    from backend.models import User

    with client.application.app_context():
        u = User(email="stu2@andrew.cmu.edu", name="Stu", role="student",
                 primary_program="IS", google_sub="g-stu2")
        db.session.add(u)
        db.session.commit()
        uid = u.id

    login(client, admin)
    r = client.patch(f"/api/users/{uid}", json={"minor_codes": ["cs", "history"]})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["minor_codes"] == ["cs", "history"]
    assert body["minor_code"] == "cs"

    # Too many is rejected here too.
    r2 = client.patch(f"/api/users/{uid}", json={"minor_codes": ["cs", "history", "math", "writing"]})
    assert r2.status_code == 400
    assert r2.get_json()["error"] == "invalid_minors"


def test_seeded_professor_skips_incomplete_on_login(client):
    from unittest.mock import patch
    from backend.db import db
    from backend.models import User

    with client.application.app_context():
        u = User(
            email="prof@andrew.cmu.edu",
            name="Prof",
            role="professor",
            primary_program="CS",
            profile_completed=True,
            google_sub="g-prof2",
        )
        db.session.add(u)
        db.session.commit()

    with patch(
        "backend.auth.id_token.verify_oauth2_token",
        return_value={
            "sub": "g-prof2",
            "email": "prof@andrew.cmu.edu",
            "email_verified": True,
            "name": "Prof",
        },
    ):
        r = client.post("/api/auth/google", json={"credential": "stub"})
    body = r.get_json()
    assert body["role"] == "professor"
    assert body["profile_completed"] is True
