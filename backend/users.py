"""User management — list and update roles for admins and area heads."""
from flask import Blueprint, g, jsonify, request

from .auth import USER_SETTABLE_ROLES, _validate_consistent_profile
from .db import db
from .models import User
from .permissions import require_role, FACULTY_OR_ADMIN

bp = Blueprint("users", __name__, url_prefix="/api/users")

MANAGER_ROLES = FACULTY_OR_ADMIN  # admin + faculty roles; area heads included

ALLOWED_PATCH_FIELDS = {
    "name",
    "role",
    "primary_program",
    "minor_code",
    "advisor_scope",
    "department",
    "department_scope",
}


def _can_manage_users(user: User) -> bool:
    return user.role in ("admin", "area_head", "associate_area_head")


@bp.route("", methods=["GET"])
@require_role("admin", "area_head", "associate_area_head")
def list_users():
    q = db.session.query(User).order_by(User.email)
    search = (request.args.get("search") or "").strip().lower()
    if search:
        like = f"%{search}%"
        q = q.filter(
            (User.email.ilike(like))
            | (User.name.ilike(like))
            | (User.role.ilike(like))
        )
    rows = q.limit(200).all()
    return jsonify(items=[u.to_public_dict() for u in rows], total=len(rows))


@bp.route("/<int:user_id>", methods=["PATCH"])
@require_role("admin", "area_head", "associate_area_head")
def update_user(user_id: int):
    actor: User = g.user
    target = db.session.get(User, user_id)
    if not target:
        return jsonify(error="not_found", message="No such user."), 404

    # Area heads may correct roles/programs but cannot promote to admin.
    if actor.role != "admin" and target.role == "admin":
        return jsonify(error="forbidden", message="Only admins can edit admin accounts."), 403

    data = request.get_json(silent=True) or {}
    unknown = set(data.keys()) - ALLOWED_PATCH_FIELDS
    if unknown:
        return jsonify(error="unknown_fields", message=f"Cannot update: {sorted(unknown)}"), 400

    def _next(field, default):
        if field in data:
            v = data[field]
            return None if v == "" else v
        return default

    new_role = _next("role", target.role)
    new_primary = _next("primary_program", target.primary_program)
    new_minor = _next("minor_code", target.minor_code)
    new_advisor_scope = _next("advisor_scope", target.advisor_scope)

    if "role" in data:
        if actor.role != "admin" and new_role == "admin":
            return jsonify(error="forbidden", message="Only admins can grant admin role."), 403
        if new_role not in USER_SETTABLE_ROLES | {"admin"}:
            return jsonify(error="invalid_role", message=f"Role must be one of {sorted(USER_SETTABLE_ROLES | {'admin'})}."), 400
        if target.role == "admin" and new_role != "admin" and actor.role != "admin":
            return jsonify(error="forbidden", message="Only admins can change an admin's role."), 403

    err = _validate_consistent_profile(new_role, new_primary, new_minor, new_advisor_scope)
    if err:
        return jsonify(error="inconsistent_profile", message=err), 400

    if "name" in data:
        target.name = data["name"] or target.name
    if "role" in data and (actor.role == "admin" or new_role != "admin"):
        target.role = new_role
        target.is_admin = new_role == "admin"
    for field in ("primary_program", "minor_code", "advisor_scope", "department", "department_scope"):
        if field in data:
            value = data[field]
            if value == "":
                value = None
            setattr(target, field, value)
            if field == "department_scope" and value and not target.department:
                target.department = value

    target.profile_completed = target.profile_is_complete()
    db.session.commit()
    return jsonify(target.to_public_dict())
