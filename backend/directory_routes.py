"""Staff directory API — faculty/admin manage roster additions in Postgres."""
from flask import Blueprint, g, jsonify, request

from .cmu import normalize_cmu_email
from .db import db
from .directory import DIRECTORY_STAFF_ROLES, UI_STAFF_ROLES, list_directory_public, load_merged_directory
from .models import StaffDirectoryEntry
from .permissions import require_role, FACULTY_OR_ADMIN

bp = Blueprint("directory", __name__, url_prefix="/api/directory")


@bp.route("/staff", methods=["GET"])
@require_role(FACULTY_OR_ADMIN)
def list_staff():
    return jsonify(items=list_directory_public(), total=len(list_directory_public()))


@bp.route("/staff", methods=["POST"])
@require_role(FACULTY_OR_ADMIN)
def add_staff():
    data = request.get_json(silent=True) or {}
    email = normalize_cmu_email(data.get("email") or "")
    name = (data.get("name") or "").strip()
    role = (data.get("role") or "").strip().lower()
    if not email:
        return jsonify(error="invalid_email", message="Use a valid @andrew.cmu.edu email."), 400
    if not name:
        return jsonify(error="invalid_name", message="Name is required."), 400
    if role not in UI_STAFF_ROLES:
        return jsonify(
            error="invalid_role",
            message=f"Role must be one of: {', '.join(UI_STAFF_ROLES)}.",
        ), 400

    merged = load_merged_directory()
    if email in merged and not db.session.query(StaffDirectoryEntry).filter_by(email=email).one_or_none():
        return jsonify(error="already_in_directory", message="That email is already in the directory (from the bundled JSON)."), 409

    existing = db.session.query(StaffDirectoryEntry).filter_by(email=email).one_or_none()
    if existing:
        existing.name = name
        existing.role = role
    else:
        existing = StaffDirectoryEntry(
            email=email,
            name=name,
            role=role,
            added_by_id=g.user.id,
        )
        db.session.add(existing)
    db.session.commit()
    return jsonify(existing.to_public_dict()), 201 if not merged.get(email) else 200
