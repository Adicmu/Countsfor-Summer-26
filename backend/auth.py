"""Auth routes: Google Sign-In, logout, /api/me.

Frontend posts the Google ID token (JWT from Google Identity Services) to
/api/auth/google. We verify it, upsert the user, and set a signed session
cookie. Subsequent requests carry the cookie automatically (with CORS
`credentials: 'include'`).
"""
from flask import Blueprint, current_app, jsonify, request, session

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .db import db
from .models import User
from .permissions import require_login, current_user


bp = Blueprint("auth", __name__, url_prefix="/api")


# ── Google Sign-In ───────────────────────────────────────────
@bp.route("/auth/google", methods=["POST"])
def google_signin():
    """Body: { "credential": "<Google ID token JWT>" }
    Verifies the token, finds/creates the user, sets the session cookie.
    Returns the user object (same shape as /api/me)."""
    data = request.get_json(silent=True) or {}
    token = data.get("credential")
    if not token:
        return jsonify(error="missing_credential", message="Google credential token required."), 400

    client_id = current_app.config["GOOGLE_CLIENT_ID"]
    if not client_id:
        return jsonify(
            error="server_misconfigured",
            message="GOOGLE_CLIENT_ID not set on the server.",
        ), 500

    # Verify the JWT was signed by Google and is intended for our client.
    try:
        info = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
    except ValueError as e:
        return jsonify(error="invalid_token", message=str(e)), 401

    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified"):
        return jsonify(error="email_unverified", message="Google account email is not verified."), 401

    # Optional domain restriction
    allowed_domain = (current_app.config.get("ALLOWED_EMAIL_DOMAIN") or "").lower()
    if allowed_domain and not email.endswith("@" + allowed_domain):
        return jsonify(
            error="domain_not_allowed",
            message=f"Only {allowed_domain} accounts are allowed.",
        ), 403

    google_sub = info.get("sub")
    name = info.get("name") or info.get("given_name") or email.split("@", 1)[0]

    # Find existing user by google_sub, else by email, else create.
    user = (
        db.session.query(User).filter_by(google_sub=google_sub).one_or_none()
        if google_sub
        else None
    )
    if user is None:
        user = db.session.query(User).filter_by(email=email).one_or_none()

    if user is None:
        user = User(
            email=email,
            name=name,
            google_sub=google_sub,
            role="student",  # default; the profile-completion step refines this
        )
        db.session.add(user)
    else:
        # Keep google_sub up to date for users who first authed differently
        if google_sub and not user.google_sub:
            user.google_sub = google_sub
        if not user.name and name:
            user.name = name

    # Admin auto-promotion via env var. Always applied so removing an email
    # from ADMIN_EMAILS demotes the user on next login — predictable behavior.
    admin_emails = current_app.config.get("ADMIN_EMAILS") or set()
    if email in admin_emails and user.role != "admin":
        user.role = "admin"
    elif email not in admin_emails and user.role == "admin":
        # Demote — but only if no role was ever set otherwise; preserves the
        # case where an admin set a different role intentionally is moot here
        # since admins enter via env, not the profile picker.
        user.role = "student"

    db.session.commit()

    session.permanent = True
    session["uid"] = user.id
    return jsonify(user.to_public_dict())


# ── Logout ───────────────────────────────────────────────────
@bp.route("/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify(ok=True)


# ── /api/me ──────────────────────────────────────────────────
@bp.route("/me", methods=["GET"])
def me():
    user = current_user()
    if not user:
        return jsonify(error="unauthenticated", message="Not signed in."), 401
    return jsonify(user.to_public_dict())


# ── PATCH /api/me — profile completion / edit ────────────────
# Used after first signup to capture role + program. Admins cannot change
# their own role to non-admin via this endpoint (admin status is env-driven).
ALLOWED_PROFILE_FIELDS = {
    "name",
    "role",
    "primary_program",
    "minor_code",
    "advisor_scope",
    "department_scope",
}
USER_SETTABLE_ROLES = {"student", "professor", "area_head", "associate_area_head", "advisor"}


@bp.route("/me", methods=["PATCH"])
@require_login
def update_me():
    from flask import g

    data = request.get_json(silent=True) or {}
    unknown = set(data.keys()) - ALLOWED_PROFILE_FIELDS
    if unknown:
        return jsonify(error="unknown_fields", message=f"Cannot update: {sorted(unknown)}"), 400

    user: User = g.user
    is_admin = user.role == "admin"

    if "role" in data:
        new_role = data["role"]
        if is_admin:
            # Don't let admins demote themselves to non-admin via the API —
            # admin status is env-driven; setting another role would just get
            # flipped back on the next login anyway.
            if new_role != "admin":
                return jsonify(
                    error="cannot_change_admin_role",
                    message="Admin role is managed via the ADMIN_EMAILS env var.",
                ), 400
        else:
            if new_role not in USER_SETTABLE_ROLES:
                return jsonify(error="invalid_role", message=f"Role must be one of {sorted(USER_SETTABLE_ROLES)}."), 400
            user.role = new_role

    for field in ("name", "primary_program", "minor_code", "advisor_scope", "department_scope"):
        if field in data:
            value = data[field]
            if value == "":
                value = None
            setattr(user, field, value)

    db.session.commit()
    return jsonify(user.to_public_dict())
