"""Tests for course search popularity analytics."""
from backend.tests.conftest import login


def test_record_requires_student(client, professor):
    login(client, professor)
    r = client.post("/api/search-analytics/events", json={"course_code": "15-122", "semester_code": "F26"})
    assert r.status_code == 403


def test_record_and_popular(client, student):
    login(client, student)
    r1 = client.post("/api/search-analytics/events", json={"course_code": "15-122", "semester_code": "F26"})
    assert r1.status_code == 201
    assert r1.get_json()["course_code"] == "15-122"
    assert r1.get_json()["search_count"] == 1

    r2 = client.post("/api/search-analytics/events", json={"course_code": "15-122", "semester_code": "F26"})
    assert r2.status_code == 201
    assert r2.get_json()["search_count"] == 2

    client.post("/api/search-analytics/events", json={"course_code": "21-120", "semester_code": "F26"})

    pop = client.get("/api/search-analytics/popular?program=CS&semester=F26&limit=5")
    assert pop.status_code == 200
    data = pop.get_json()
    assert data["program"] == "CS"
    assert data["items"][0]["course_code"] == "15-122"
    assert data["items"][0]["search_count"] == 2


def test_popular_scoped_by_program(client, app):
    from backend.tests.conftest import _make_user, login

    cs = _make_user(app, "cs@andrew.cmu.edu", role="student", primary_program="CS")
    is_user = _make_user(app, "is@andrew.cmu.edu", role="student", primary_program="IS")

    login(client, cs)
    client.post("/api/search-analytics/events", json={"course_code": "15-122", "semester_code": "F26"})

    login(client, is_user)
    client.post("/api/search-analytics/events", json={"course_code": "67-250", "semester_code": "F26"})

    cs_pop = client.get("/api/search-analytics/popular?program=CS&semester=F26")
    assert cs_pop.get_json()["items"][0]["course_code"] == "15-122"

    is_pop = client.get("/api/search-analytics/popular?program=IS&semester=F26")
    assert is_pop.get_json()["items"][0]["course_code"] == "67-250"
