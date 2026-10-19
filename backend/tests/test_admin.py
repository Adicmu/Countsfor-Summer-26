"""Admin console API tests."""
from .conftest import login, _make_user


def _add_flag(client, user, code="15-122", **kw):
    login(client, user)
    r = client.post("/api/flags", json={
        "course_code": code,
        "course_name": kw.get("name", "Principles of Imperative Computation"),
        "reason_code": "requirement_mismatch",
        "reason_label": "Counts for the wrong requirement",
    })
    assert r.status_code == 201, r.get_json()
    return r.get_json()["id"]


def test_admin_endpoints_require_admin(client, student, professor):
    for user in (student, professor):
        login(client, user)
        for path in ("/api/admin/overview", "/api/admin/insights", "/api/admin/activity"):
            assert client.get(path).status_code == 403, (user.role, path)


def test_admin_endpoints_require_login(client):
    assert client.get("/api/admin/overview").status_code == 401


def test_overview_counts(client, app, admin, student, professor):
    _make_user(app, "bob@andrew.cmu.edu", role="student", primary_program="IS")
    _add_flag(client, professor)
    login(client, student)
    client.post("/api/wishlist", json={"course_code": "15-122"})

    login(client, admin)
    r = client.get("/api/admin/overview")
    assert r.status_code == 200
    body = r.get_json()
    assert body["users"]["total"] == 4
    assert body["users"]["by_group"] == {"student": 2, "faculty": 1, "admin": 1}
    assert body["users"]["new_7d"] == 4
    assert body["flags"]["pending"] == 1
    assert body["wishlist"] == {"items": 1, "students": 1}
    assert "last_scrape" in body["course_data"]
    assert len(body["recent_signups"]) == 4


def test_insights_aggregates_lookups_saves_and_flags(client, app, admin, student, professor):
    login(client, student)
    for _ in range(3):
        client.post("/api/search-analytics/events", json={"course_code": "15-122", "semester_code": "F26"})
    client.post("/api/search-analytics/events", json={"course_code": "67-262", "semester_code": "S26"})
    client.post("/api/wishlist", json={"course_code": "67-262"})
    flag_id = _add_flag(client, professor)
    _add_flag(client, professor)
    login(client, admin)
    client.patch(f"/api/flags/{flag_id}", json={"status": "resolved"})

    body = client.get("/api/admin/insights").get_json()
    assert body["top_lookups"][0] == {"course_code": "15-122", "count": 3}
    assert body["lookups_by_program"]["CS"][0]["course_code"] == "15-122"
    assert body["most_saved"] == [{"course_code": "67-262", "count": 1}]
    assert body["most_flagged"][0]["total"] == 2
    assert body["most_flagged"][0]["open"] == 1
    assert body["students_by_program"] == {"CS": 1}
    assert sum(body["signups_by_week"]["counts"]) == 3
    assert body["semesters"] == ["F26", "S26"]

    fall = client.get("/api/admin/insights?semester=F26").get_json()
    assert [r["course_code"] for r in fall["top_lookups"]] == ["15-122"]


def test_user_role_change_is_logged(client, admin, student):
    login(client, admin)
    r = client.patch(f"/api/users/{student.id}", json={"role": "professor", "department": "Computer Science", "primary_program": "CS"})
    assert r.status_code == 200, r.get_json()

    items = client.get("/api/admin/activity").get_json()["items"]
    assert len(items) == 1
    event = items[0]
    assert event["action"] == "user.update"
    assert event["target"] == student.email
    assert event["actor_email"] == admin.email
    assert event["details"]["changes"]["role"] == {"from": "student", "to": "professor"}


def test_saving_without_changes_is_not_logged(client, admin, student):
    login(client, admin)
    client.patch(f"/api/users/{student.id}", json={"role": "student", "primary_program": "CS"})
    assert client.get("/api/admin/activity").get_json()["total"] == 0


def test_flag_review_and_directory_changes_are_logged(client, admin, professor):
    flag_id = _add_flag(client, professor)
    login(client, admin)
    client.patch(f"/api/flags/{flag_id}", json={"status": "reviewed"})
    client.patch(f"/api/flags/{flag_id}", json={"admin_notes": "Checked with the registrar"})
    r = client.post("/api/directory/entries", json={
        "email": "newprof@andrew.cmu.edu", "name": "New Prof", "role": "professor",
        "department": "Computer Science", "primary_program": "CS",
    })
    assert r.status_code == 201, r.get_json()
    client.delete(f"/api/directory/entries/{r.get_json()['id']}")

    actions = [e["action"] for e in client.get("/api/admin/activity").get_json()["items"]]
    assert actions == ["directory.remove", "directory.add", "flag.note", "flag.status"]

    only_flags = client.get("/api/admin/activity?action=flag.").get_json()
    assert only_flags["total"] == 2


def test_user_list_filters_and_reports_total(client, app, admin, student, professor):
    _make_user(app, "carol@andrew.cmu.edu", role="student", primary_program="BA")
    login(client, admin)
    body = client.get("/api/users?role_group=student").get_json()
    assert body["total"] == 2
    assert {u["role"] for u in body["items"]} == {"student"}
    assert body["items"][0]["created_at"]
    assert client.get("/api/users?role_group=faculty").get_json()["total"] == 1
    limited = client.get("/api/users?limit=1").get_json()
    assert limited["total"] == 4 and len(limited["items"]) == 1
