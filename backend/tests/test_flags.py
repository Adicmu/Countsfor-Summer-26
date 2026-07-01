"""Flag route tests — role gating, schema, admin review."""
from .conftest import login


VALID_FLAG = {
    "course_code": "15-122",
    "course_name": "Principles of Imperative Computation",
    "reason_code": "metadata_outdated",
    "reason_label": "Course title, number, or units are outdated",
    "notes": "Units changed in Spring 2025.",
}


# ── Authorization ───────────────────────────────────────────

def test_student_cannot_flag(client, student):
    login(client, student)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 403


def test_unauthenticated_cannot_flag(client):
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 401


def test_professor_can_flag(client, professor):
    login(client, professor)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["course_code"] == "15-122"
    assert body["submitted_by_role"] == "professor"
    assert body["submitted_program"] == "IS"
    assert body["status"] == "pending"


def test_area_head_can_flag(client, area_head):
    login(client, area_head)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 201


def test_advisor_can_flag(client, advisor):
    login(client, advisor)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 201


def test_student_can_flag(client, student):
    login(client, student)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 201


def test_admin_can_flag(client, admin):
    login(client, admin)
    r = client.post("/api/flags", json=VALID_FLAG)
    assert r.status_code == 201


# ── Schema validation ───────────────────────────────────────

def test_missing_required_field_400(client, professor):
    login(client, professor)
    payload = dict(VALID_FLAG)
    del payload["reason_code"]
    r = client.post("/api/flags", json=payload)
    assert r.status_code == 400
    assert r.get_json()["error"] == "missing_fields"


def test_invalid_reason_code_400(client, professor):
    login(client, professor)
    payload = dict(VALID_FLAG, reason_code="not_a_real_reason")
    r = client.post("/api/flags", json=payload)
    assert r.status_code == 400
    assert r.get_json()["error"] == "invalid_reason"


# ── Idempotency ─────────────────────────────────────────────

def test_re_post_with_same_id_is_idempotent(client, professor):
    login(client, professor)
    payload = dict(VALID_FLAG, id="flg-imported-from-localstorage")
    r1 = client.post("/api/flags", json=payload)
    assert r1.status_code == 201
    r2 = client.post("/api/flags", json=payload)
    assert r2.status_code == 200  # second one finds existing
    assert r1.get_json()["id"] == r2.get_json()["id"]


# ── Admin list/review ───────────────────────────────────────

def test_faculty_sees_only_own_flags(client, professor, advisor):
    """Faculty can list flags, but ONLY their own submissions (their
    "My flags" view). One faculty member never sees another's flags."""
    login(client, professor)
    client.post("/api/flags", json=dict(VALID_FLAG, id="flg-prof-1"))
    login(client, advisor)
    client.post("/api/flags", json=dict(VALID_FLAG, id="flg-adv-1"))

    login(client, professor)
    r = client.get("/api/flags")
    assert r.status_code == 200
    body = r.get_json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == "flg-prof-1"
    assert body["items"][0]["submitted_by_id"] == professor.id


def test_student_still_cannot_list_flags(client, student):
    login(client, student)
    r = client.get("/api/flags")
    assert r.status_code == 403


def test_faculty_my_flags_status_filter(client, professor, admin):
    login(client, professor)
    client.post("/api/flags", json=dict(VALID_FLAG, id="flg-p-1"))
    client.post("/api/flags", json=dict(VALID_FLAG, id="flg-p-2"))
    login(client, admin)
    client.patch("/api/flags/flg-p-1", json={"status": "resolved"})

    login(client, professor)
    assert client.get("/api/flags?status=pending").get_json()["total"] == 1
    assert client.get("/api/flags?status=resolved").get_json()["total"] == 1


def test_admin_can_list_flags(client, professor, admin):
    # Professor submits one
    login(client, professor)
    client.post("/api/flags", json=VALID_FLAG)
    # Switch to admin and list
    login(client, admin)
    r = client.get("/api/flags")
    assert r.status_code == 200
    body = r.get_json()
    assert body["total"] == 1
    assert body["items"][0]["course_code"] == "15-122"


def test_admin_can_filter_by_status(client, professor, admin):
    login(client, professor)
    client.post("/api/flags", json=VALID_FLAG)
    login(client, admin)
    r = client.get("/api/flags?status=pending")
    assert r.status_code == 200
    assert r.get_json()["total"] == 1
    r = client.get("/api/flags?status=resolved")
    assert r.get_json()["total"] == 0


def test_admin_can_patch_status(client, professor, admin):
    login(client, professor)
    flag_id = client.post("/api/flags", json=VALID_FLAG).get_json()["id"]
    login(client, admin)
    r = client.patch(f"/api/flags/{flag_id}", json={"status": "resolved", "admin_notes": "Fixed in PR #123."})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["status"] == "resolved"
    assert body["admin_notes"] == "Fixed in PR #123."
    assert body["resolved_by"] == admin.id


def test_admin_patch_404_for_unknown_flag(client, admin):
    login(client, admin)
    r = client.patch("/api/flags/flg-nope", json={"status": "resolved"})
    assert r.status_code == 404


def test_admin_patch_rejects_invalid_status(client, professor, admin):
    login(client, professor)
    flag_id = client.post("/api/flags", json=VALID_FLAG).get_json()["id"]
    login(client, admin)
    r = client.patch(f"/api/flags/{flag_id}", json={"status": "weird"})
    assert r.status_code == 400


# ── Faculty own-flag list ─────────────────────────────────────

def test_professor_can_list_own_flags(client, professor):
    login(client, professor)
    client.post("/api/flags", json=VALID_FLAG)
    r = client.get("/api/flags/mine")
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["total"] == 1
    assert body["items"][0]["submitted_by_email"] == professor.email


def test_student_cannot_list_my_flags(client, student):
    login(client, student)
    r = client.get("/api/flags/mine")
    assert r.status_code == 403
