"""Flags API: faculty create, admin review.

Frontend submits flags via POST /api/flags. Server snapshots the submitter
identity (name/email/role/program) at submit time so the record stays useful
even if the user is later deleted or changes role.
"""
import secrets
import time
from flask import Blueprint, g, jsonify, request

from .db import db
from .models import Flag, FLAG_STATUSES
from .permissions import require_role, FACULTY_OR_ADMIN


bp = Blueprint("flags", __name__, url_prefix="/api/flags")

VALID_REASON_CODES = {
    "not_offered",
    "campus_wrong",
    "metadata_outdated",
    "prereq_wrong",
    "requirement_mismatch",
    "should_be_equivalent",
    "wrong_semester",
    "restrictions_missing",
    "duplicate",
    "other",
}

REQUIRED_POST_FIELDS = {"course_code", "course_name", "reason_code", "reason_label"}


def _new_flag_id() -> str:
    """Mirror the frontend's existing 'flg-<base36ts>-<rand>' scheme so
    server-issued IDs feel consistent with imported localStorage entries."""
    ts = format(int(time.time() * 1000), "x")  # hex (close enough to base36 for IDs)
    rnd = secrets.token_hex(3)
    return f"flg-{ts}-{rnd}"


# ── POST /api/flags — faculty submit ──────────────────────────
@bp.route("", methods=["POST"])
@require_role(FACULTY_OR_ADMIN)
def create_flag():
    data = request.get_json(silent=True) or {}
    missing = REQUIRED_POST_FIELDS - set(data.keys())
    if missing:
        return jsonify(error="missing_fields", message=f"Required: {sorted(missing)}"), 400

    if data["reason_code"] not in VALID_REASON_CODES:
        return jsonify(error="invalid_reason", message=f"reason_code must be one of {sorted(VALID_REASON_CODES)}"), 400

    user = g.user
    # Accept a client-supplied ID (for one-shot migration from localStorage)
    # but only if it looks like our format. Otherwise mint one.
    incoming_id = data.get("id")
    flag_id = incoming_id if (incoming_id and incoming_id.startswith("flg-")) else _new_flag_id()

    flag = Flag(
        id=flag_id,
        course_code=data["course_code"],
        course_name=data["course_name"],
        reason_code=data["reason_code"],
        reason_label=data["reason_label"],
        notes=(data.get("notes") or None),
        submitted_by_id=user.id,
        submitted_by_name=user.name,
        submitted_by_email=user.email,
        submitted_by_role=user.role,
        submitted_program=user.primary_program,
        submitted_minor=user.minor_code,
        status="pending",
    )
    # Idempotent insert: re-POST of the same ID returns the existing record.
    existing = db.session.get(Flag, flag_id)
    if existing:
        return jsonify(existing.to_dict()), 200

    db.session.add(flag)
    db.session.commit()
    return jsonify(flag.to_dict()), 201


# ── GET /api/flags/mine — submitter's own flags ───────────────
@bp.route("/mine", methods=["GET"])
@require_role(FACULTY_OR_ADMIN)
def list_my_flags():
    status = request.args.get("status")
    page = max(1, int(request.args.get("page", "1") or "1"))
    limit = min(100, max(1, int(request.args.get("limit", "50") or "50")))

    q = db.session.query(Flag).filter(Flag.submitted_by_id == g.user.id)
    if status:
        if status not in FLAG_STATUSES:
            return jsonify(error="invalid_status", message=f"status must be one of {list(FLAG_STATUSES)}"), 400
        q = q.filter(Flag.status == status)

    total = q.count()
    rows = (
        q.order_by(Flag.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return jsonify(
        total=total,
        page=page,
        limit=limit,
        items=[f.to_dict() for f in rows],
    )


# ── GET /api/flags — admin list with filters ──────────────────
@bp.route("", methods=["GET"])
@require_role("admin")
def list_flags():
    status = request.args.get("status")
    course = request.args.get("course")
    page = max(1, int(request.args.get("page", "1") or "1"))
    limit = min(100, max(1, int(request.args.get("limit", "50") or "50")))

    q = db.session.query(Flag)
    if status:
        if status not in FLAG_STATUSES:
            return jsonify(error="invalid_status", message=f"status must be one of {list(FLAG_STATUSES)}"), 400
        q = q.filter(Flag.status == status)
    if course:
        q = q.filter(Flag.course_code == course)

    total = q.count()
    rows = (
        q.order_by(Flag.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return jsonify(
        total=total,
        page=page,
        limit=limit,
        items=[f.to_dict() for f in rows],
    )


# ── PATCH /api/flags/<id> — admin updates status/notes ────────
@bp.route("/<flag_id>", methods=["PATCH"])
@require_role("admin")
def update_flag(flag_id: str):
    data = request.get_json(silent=True) or {}
    flag = db.session.get(Flag, flag_id)
    if not flag:
        return jsonify(error="not_found", message="No such flag."), 404

    if "status" in data:
        if data["status"] not in FLAG_STATUSES:
            return jsonify(error="invalid_status", message=f"status must be one of {list(FLAG_STATUSES)}"), 400
        flag.status = data["status"]
        flag.resolved_by = g.user.id

    if "admin_notes" in data:
        flag.admin_notes = data["admin_notes"] or None

    db.session.commit()
    return jsonify(flag.to_dict())
