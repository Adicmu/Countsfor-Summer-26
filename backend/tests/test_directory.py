"""Directory API — name + email adds grant faculty view on login."""
from backend.db import db
from backend.models import DirectoryEntry, User
from .conftest import login


def test_add_directory_entry_name_email_only(client, professor):
    login(client, professor)
    r = client.post(
        "/api/directory/entries",
        json={"name": "New Faculty", "email": "new.faculty@andrew.cmu.edu"},
    )
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["name"] == "New Faculty"
    assert body["email"] == "new.faculty@andrew.cmu.edu"
    assert body["role"] == "professor"
    assert body["department"] == "Dean's Office"
    assert body["primary_program"] == "AS"

    with client.application.app_context():
        row = db.session.query(DirectoryEntry).filter_by(email="new.faculty@andrew.cmu.edu").one()
        assert row.role == "professor"


def test_directory_entry_grants_faculty_view_on_login(client, professor):
    login(client, professor)
    client.post(
        "/api/directory/entries",
        json={"name": "Listed Person", "email": "listed@andrew.cmu.edu"},
    )

    r = client.post(
        "/api/auth/register",
        json={
            "email": "listed@andrew.cmu.edu",
            "password": "SecurePass1!",
            "confirm_password": "SecurePass1!",
            "name": "Listed Person",
        },
    )
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["role_group"] == "faculty"
    assert body["role"] == "professor"

    with client.application.app_context():
        u = db.session.query(User).filter_by(email="listed@andrew.cmu.edu").one()
        assert u.role_group() == "faculty"


def test_student_not_in_directory_gets_student_view(client):
    r = client.post(
        "/api/auth/register",
        json={
            "email": "student.only@andrew.cmu.edu",
            "password": "SecurePass1!",
            "confirm_password": "SecurePass1!",
            "name": "Student Only",
        },
    )
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["role_group"] == "student"


def test_students_cannot_list_directory(client, student):
    login(client, student)
    r = client.get("/api/directory/entries")
    assert r.status_code == 403
