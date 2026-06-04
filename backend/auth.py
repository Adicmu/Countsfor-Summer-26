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

    # Admin promotion is one-way via env var: if the email is in
    # ADMIN_EMAILS, the user gets promoted to admin on every login. We do
    # NOT auto-demote — removing an email from the env var stops new
    # admin grants but doesn't clobber a previously-set role. To demote
    # an existing admin, edit the DB directly (`UPDATE users SET role=...`).
    admin_emails = current_app.config.get("ADMIN_EMAILS") or set()
    if email in admin_emails and user.role != "admin":
        user.role = "admin"

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


VALID_PROGRAMS_FOR_PATCH = {"CS", "IS", "BA", "BS", "AI", "GS", "AS"}
VALID_MINORS_FOR_PATCH = {
    "arabic", "biology", "business", "cs", "economics", "finance", "history",
    "math", "neuroscience", "product", "writing", "psychology", "sociology",
    "self_defined", "tech_entre",
}
VALID_ADVISOR_SCOPES = {"major", "minor", "arts_sciences", "all_programs"}


def _validate_consistent_profile(role, primary_program, minor_code, advisor_scope):
    """Return None if the combination is internally consistent, else an error message.

    Mirrors the validateProfile() rules from js/profile.js so server can't be
    pushed into a state the frontend won't render correctly."""
    if role == "student":
        if not primary_program or primary_program not in VALID_PROGRAMS_FOR_PATCH - {"AS"}:
            return "Students must have a primary_program (CS/IS/BA/BS/AI/GS)."
        if minor_code and minor_code not in VALID_MINORS_FOR_PATCH:
            return f"Unknown minor_code: {minor_code}."
        if advisor_scope:
            return "Students cannot have an advisor_scope."
        return None
    if role == "professor":
        if primary_program not in VALID_PROGRAMS_FOR_PATCH:
            return "Professors must have a primary_program."
        if minor_code:
            return "Professors cannot have a minor_code."
        if advisor_scope:
            return "Professors cannot have an advisor_scope."
        return None
    if role in ("area_head", "associate_area_head"):
        if primary_program is not None and primary_program not in VALID_PROGRAMS_FOR_PATCH:
            return "Invalid primary_program for area lead."
        if minor_code:
            return "Area leads cannot have a minor_code."
        if advisor_scope:
            return "Area leads cannot have an advisor_scope."
        return None
    if role == "advisor":
        if advisor_scope not in VALID_ADVISOR_SCOPES:
            return f"Advisor must have advisor_scope ∈ {sorted(VALID_ADVISOR_SCOPES)}."
        if advisor_scope == "major":
            if primary_program not in (VALID_PROGRAMS_FOR_PATCH - {"AS"}):
                return "Advisor with scope=major needs a primary_program (CS/IS/BA/BS/AI/GS)."
            if minor_code:
                return "Advisor with scope=major cannot also have a minor_code."
        elif advisor_scope == "minor":
            if minor_code not in VALID_MINORS_FOR_PATCH:
                return "Advisor with scope=minor needs a valid minor_code."
            if primary_program:
                return "Advisor with scope=minor cannot also have a primary_program."
        else:
            # arts_sciences / all_programs — no target needed
            if primary_program:
                return f"Advisor with scope={advisor_scope} cannot have a primary_program."
            if minor_code:
                return f"Advisor with scope={advisor_scope} cannot have a minor_code."
        return None
    if role == "admin":
        return None  # admins are scoped server-side, no per-field constraints
    return f"Unknown role: {role}."


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

    # Compute what the user would look like AFTER applying the patch, then
    # validate cross-field consistency before any DB write.
    def _next(field, default):
        if field in data:
            v = data[field]
            return None if v == "" else v
        return default

    new_role            = _next("role", user.role)
    new_primary         = _next("primary_program", user.primary_program)
    new_minor           = _next("minor_code", user.minor_code)
    new_advisor_scope   = _next("advisor_scope", user.advisor_scope)

    if "role" in data:
        if is_admin:
            if new_role != "admin":
                return jsonify(
                    error="cannot_change_admin_role",
                    message="Admin role is managed via the ADMIN_EMAILS env var.",
                ), 400
        else:
            if new_role not in USER_SETTABLE_ROLES:
                return jsonify(error="invalid_role", message=f"Role must be one of {sorted(USER_SETTABLE_ROLES)}."), 400

    err = _validate_consistent_profile(new_role, new_primary, new_minor, new_advisor_scope)
    if err:
        return jsonify(error="inconsistent_profile", message=err), 400

    # All checks passed — apply the patch.
    if "role" in data and not is_admin:
        user.role = new_role
    for field in ("name", "primary_program", "minor_code", "advisor_scope", "department_scope"):
        if field in data:
            value = data[field]
            if value == "":
                value = None
            setattr(user, field, value)

    db.session.commit()
    return jsonify(user.to_public_dict())
