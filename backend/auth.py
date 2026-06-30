"""Auth routes: Google Sign-In, logout, /api/me.

Frontend posts the Google ID token (JWT from Google Identity Services) to
/api/auth/google. We verify it, upsert the user, and set a signed session
cookie. Subsequent requests carry the cookie automatically (with CORS
`credentials: 'include'`).
"""
import json
import os
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, session

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .db import db
from .models import User
from .permissions import require_login, current_user


bp = Blueprint("auth", __name__, url_prefix="/api")


def _load_seed_users() -> dict[str, dict]:
    """Optional JSON file of pre-seeded faculty/staff profiles keyed by email."""
    path = current_app.config.get("SEED_USERS_PATH") or ""
    if not path:
        return {}
    p = Path(path)
    if not p.is_file():
        return {}
    try:
        rows = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out = {}
    for row in rows if isinstance(rows, list) else []:
        email = (row.get("email") or "").lower()
        if email:
            out[email] = row
    return out


def _apply_seed(user: User, seed: dict) -> None:
    """Merge seed row into a new or incomplete user. Does not overwrite admin."""
    if user.role == "admin":
        return
    for field in ("name", "role", "primary_program", "minor_code", "advisor_scope", "department", "department_scope"):
        if field in seed and seed[field]:
            setattr(user, field, seed[field])
    if user.role == "admin" or seed.get("role") == "admin":
        user.is_admin = True


def _sync_admin_flag(user: User, email: str) -> None:
    admin_emails = current_app.config.get("ADMIN_EMAILS") or set()
    if email in admin_emails:
        user.role = "admin"
        user.is_admin = True


# Faculty role tier a roster member may self-assign in the one-time popup.
# The precise sub-role (Area Head vs Associate Area Head, etc.) is the user's
# to refine — roster membership is the gate, not which faculty role they pick.
ROSTER_FACULTY_ROLES = {"professor", "area_head", "associate_area_head", "advisor"}


def _roster_eligible_roles(email: str) -> set[str]:
    """Faculty roles this email is allowed to self-assign. Non-empty only for
    emails present in the faculty roster (seed_users.json). This is the
    anti-misuse gate: a student not on the roster can never become faculty."""
    if _load_seed_users().get((email or "").lower()):
        return set(ROSTER_FACULTY_ROLES)
    return set()


def _public_user(user: User) -> dict:
    """User's own profile for the client, plus whether they're roster-eligible
    faculty (drives the one-time role popup branch on the frontend)."""
    data = user.to_public_dict()
    data["faculty_eligible"] = bool(_roster_eligible_roles(user.email))
    return data


def _write_session(user: User) -> None:
    session.permanent = True
    session["uid"] = user.id
    session["email"] = user.email
    session["name"] = user.name
    session["role"] = user.role
    session["primary_program"] = user.primary_program
    session["minor_code"] = user.minor_code
    session["is_admin"] = user.is_admin


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
            role="student",
        )
        db.session.add(user)
        seed = _load_seed_users().get(email)
        if seed:
            _apply_seed(user, seed)
    else:
        # Keep google_sub up to date for users who first authed differently
        if google_sub and not user.google_sub:
            user.google_sub = google_sub
        if not user.name and name:
            user.name = name
        if not user.profile_completed:
            seed = _load_seed_users().get(email)
            if seed:
                _apply_seed(user, seed)

    _sync_admin_flag(user, email)

    from datetime import datetime, timezone
    user.last_login = datetime.now(timezone.utc)
    # Admins are scoped server-side and have nothing to fill in, so they skip
    # onboarding. Everyone else — including roster faculty (whose role/program
    # are pre-filled from the seed) — passes through the one-time role popup
    # once so they can confirm/refine their role (e.g. declare "associate area
    # head"). The popup sets profile_completed via PATCH /api/me. We never
    # un-set a previously-completed profile.
    if user.role == "admin":
        user.profile_completed = True

    db.session.commit()

    _write_session(user)
    return jsonify(_public_user(user))


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
    return jsonify(_public_user(user))


# ── PATCH /api/me — profile completion / edit ────────────────
# Used after first signup to capture role + program. Admins cannot change
# their own role to non-admin via this endpoint (admin status is env-driven).
ALLOWED_PROFILE_FIELDS = {
    "name",
    "role",
    "primary_program",
    "minor_code",
    "minor_codes",
    "advisor_scope",
    "department_scope",
    "department",
}
# Roles an admin/area-head may assign to OTHERS via the user-management API
# (backend/users.py). Faculty roles are managed, not self-claimed.
USER_SETTABLE_ROLES = {"student", "professor", "area_head", "associate_area_head", "advisor"}

# Roles a user may set on THEMSELVES via PATCH /api/me. Self-service is
# student-only: faculty roles come from the seed file or an admin via
# users.py — never self-selection. Closes the privilege-escalation path
# where a student could PATCH themselves into a faculty role.
SELF_SETTABLE_ROLES = {"student"}


VALID_PROGRAMS_FOR_PATCH = {"CS", "IS", "BA", "BS", "AI", "GS", "AS"}
VALID_MINORS_FOR_PATCH = {
    "arabic", "biology", "business", "cs", "economics", "finance", "history",
    "math", "neuroscience", "product", "writing", "psychology", "sociology",
    "self_defined", "tech_entre",
}
VALID_ADVISOR_SCOPES = {"major", "minor", "arts_sciences", "all_programs"}

# A student may hold several minors, capped to keep the UI / badge sane.
MAX_MINORS = 3
# A student can't minor in the same field they major in. Mirrors
# MAJOR_TO_MINOR_CODE in js/profile.js.
MAJOR_EQUIVALENT_MINOR = {"CS": "cs", "BS": "biology", "BA": "business"}


def _validate_minor_codes(role, primary_program, minor_codes):
    """Validate a student's list of minors. Returns an error string or None.

    Mirrors the frontend rules: students only, ≤ MAX_MINORS, each a known minor,
    no duplicates, and none equal to the student's own major field."""
    if not minor_codes:
        return None
    if role != "student":
        return "Only students can have minors."
    if not isinstance(minor_codes, list):
        return "minor_codes must be a list."
    if len(minor_codes) > MAX_MINORS:
        return f"At most {MAX_MINORS} minors are allowed."
    seen = set()
    for code in minor_codes:
        if code not in VALID_MINORS_FOR_PATCH:
            return f"Unknown minor: {code}."
        if code in seen:
            return f"Duplicate minor: {code}."
        seen.add(code)
        if MAJOR_EQUIVALENT_MINOR.get(primary_program) == code:
            return f"Cannot minor in '{code}' while majoring in {primary_program}."
    return None


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
    new_advisor_scope   = _next("advisor_scope", user.advisor_scope)

    # Minors. For students, `minor_codes` (a list, ≤ MAX_MINORS) is canonical
    # and `minor_code` mirrors the first. For non-students the list is empty;
    # advisor-minor scope still uses the single `minor_code` for its target.
    if new_role == "student":
        if "minor_codes" in data:
            new_minor_codes = data.get("minor_codes") or []
        elif "minor_code" in data:
            single = _next("minor_code", None)
            new_minor_codes = [single] if single else []
        else:
            new_minor_codes = user.get_minor_codes()
        new_minor = new_minor_codes[0] if new_minor_codes else None
    else:
        new_minor_codes = []
        new_minor = _next("minor_code", user.minor_code)

    if "role" in data:
        if is_admin:
            if new_role != "admin":
                return jsonify(
                    error="cannot_change_admin_role",
                    message="Admin role is managed via the ADMIN_EMAILS env var.",
                ), 400
        else:
            # Students self-assign student; roster faculty may additionally
            # self-assign a faculty role via the one-time popup. Off-roster
            # users can never pick a faculty role (privilege-escalation gate).
            self_settable = SELF_SETTABLE_ROLES | _roster_eligible_roles(user.email)
            if new_role not in self_settable:
                return jsonify(error="invalid_role", message=f"You can't set your own role to '{new_role}'. Faculty roles are assigned from the faculty roster or by an admin."), 400

    # Validate what the client actually requested (so a non-student sending
    # minor_codes is rejected, not silently dropped).
    minors_to_check = data["minor_codes"] if "minor_codes" in data else new_minor_codes
    mc_err = _validate_minor_codes(new_role, new_primary, minors_to_check)
    if mc_err:
        return jsonify(error="invalid_minors", message=mc_err), 400

    err = _validate_consistent_profile(new_role, new_primary, new_minor, new_advisor_scope)
    if err:
        return jsonify(error="inconsistent_profile", message=err), 400

    # All checks passed — apply the patch.
    if "role" in data and not is_admin:
        user.role = new_role
    for field in ("name", "primary_program", "advisor_scope", "department_scope", "department"):
        if field in data:
            value = data[field]
            if value == "":
                value = None
            setattr(user, field, value)

    # Minors: students store the full list (minor_code mirrors the first);
    # non-students hold no list but may set the single minor_code (advisor scope).
    if new_role == "student":
        user.set_minor_codes(new_minor_codes)
    else:
        user.minor_codes = None
        if "minor_code" in data:
            user.minor_code = new_minor

    user.profile_completed = user.profile_is_complete()
    db.session.commit()
    _write_session(user)
    return jsonify(_public_user(user))
