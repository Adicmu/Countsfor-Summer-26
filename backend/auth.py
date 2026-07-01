"""Auth routes: Google Sign-In, logout, /api/me.

Frontend posts the Google ID token (JWT from Google Identity Services) to
/api/auth/google. We verify it, upsert the user, and set a signed session
cookie. Subsequent requests carry the cookie automatically (with CORS
`credentials: 'include'`).
"""
import hashlib
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from .db import db
from .email_util import send_password_reset_email
from .models import PasswordResetToken, User
from .permissions import require_login, current_user
from .tokens import make_auth_token


bp = Blueprint("auth", __name__, url_prefix="/api")


CMU_EMAIL_DOMAINS = ("andrew.cmu.edu", "cmu.edu", "qatar.cmu.edu")
MIN_PASSWORD_LEN = 8
GENERIC_RESET_MESSAGE = "If an account exists for that email, a reset link has been sent."


def _hash_password(password: str) -> str:
    return generate_password_hash(password)


def _password_ok(user: User, password: str) -> bool:
    if not user.password_hash:
        return False
    return check_password_hash(user.password_hash, password)


def _validate_password(password: str) -> str | None:
    if not password or len(password) < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters."
    return None


def _hash_reset_token(raw_token: str) -> str:
    """Deterministic SHA-256 so we can look up by raw token without storing it."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _reset_token_ttl() -> timedelta:
    minutes = int(current_app.config.get("RESET_TOKEN_MINUTES") or 30)
    return timedelta(minutes=minutes)


def _frontend_reset_url(raw_token: str) -> str:
    """Build the link emailed to the user (static GH Pages / local)."""
    configured = (current_app.config.get("FRONTEND_RESET_BASE") or "").strip()
    if configured:
        base = configured.rstrip("/")
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}token={raw_token}"
    origins = current_app.config.get("FRONTEND_ORIGINS") or []
    origin = (origins[0] if origins else "http://localhost:8765").rstrip("/")
    return f"{origin}/reset.html?token={raw_token}"


def _invalidate_reset_tokens(user_id: int) -> None:
    db.session.query(PasswordResetToken).filter_by(user_id=user_id, used=False).update(
        {"used": True}, synchronize_session=False
    )


def _create_reset_token(user: User) -> str:
    """Store hashed token; return raw token for email/dev exposure."""
    _invalidate_reset_tokens(user.id)
    raw_token = secrets.token_urlsafe(32)
    row = PasswordResetToken(
        user_id=user.id,
        token_hash=_hash_reset_token(raw_token),
        expires_at=datetime.now(timezone.utc) + _reset_token_ttl(),
        used=False,
    )
    db.session.add(row)
    db.session.commit()
    return raw_token


def _find_valid_reset_token(raw_token: str) -> PasswordResetToken | None:
    if not raw_token:
        return None
    token_hash = _hash_reset_token(raw_token.strip())
    row = (
        db.session.query(PasswordResetToken)
        .filter_by(token_hash=token_hash, used=False)
        .one_or_none()
    )
    if row is None:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    return row


def _finalize_user(user: User, email: str) -> User:
    """Apply directory/admin rules and mark profile complete when ready."""
    _sync_directory_profile(user, email)
    user.last_login = datetime.now(timezone.utc)
    if user.profile_is_complete():
        user.profile_completed = True
    db.session.commit()
    return user


def _sync_directory_profile(user: User, email: str) -> None:
    """Apply faculty directory on every login/register (not only first onboarding)."""
    if user.role != "admin":
        seed = _load_seed_users().get(email)
        if seed:
            _apply_seed(user, seed)
    _sync_admin_flag(user, email)


def _create_user_with_password(email: str, name: str, password: str) -> User:
    user = User(
        email=email,
        name=name,
        role="student",
        password_hash=_hash_password(password),
    )
    db.session.add(user)
    db.session.flush()
    if not user.password_hash:
        raise RuntimeError("password_hash was not set during registration")
    return _finalize_user(user, email)


def _normalize_cmu_email(raw: str) -> str | None:
    """Accept CMU addresses; store/lookup as @andrew.cmu.edu when possible."""
    email = (raw or "").strip().lower()
    if "@" not in email:
        return None
    local, _, domain = email.partition("@")
    if domain not in CMU_EMAIL_DOMAINS:
        return None
    if domain in ("cmu.edu", "qatar.cmu.edu"):
        return f"{local}@andrew.cmu.edu"
    return email


def _resolve_seed_path(path: Path) -> Path:
    """Resolve relative seed paths against cwd, backend/, and repo root."""
    if path.is_absolute():
        return path
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent
    for base in (Path.cwd(), backend_dir, repo_root):
        candidate = (base / path).resolve()
        if candidate.is_file():
            return candidate
    return (repo_root / path).resolve()


def _seed_file_candidates() -> list[Path]:
    """Ordered list of seed JSON paths (first match wins)."""
    paths: list[Path] = []
    configured = (current_app.config.get("SEED_USERS_PATH") or "").strip()
    if configured:
        paths.append(_resolve_seed_path(Path(configured)))
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent
    if not current_app.config.get("TESTING"):
        paths.extend([
            backend_dir / "seed_users.json",
            backend_dir / "faculty_seed.json",
            repo_root / "data" / "faculty_directory.json",
        ])
    seen: set[str] = set()
    out: list[Path] = []
    for p in paths:
        key = str(p.resolve()) if p.is_absolute() else str(p)
        if key not in seen:
            seen.add(key)
            out.append(p)
    return out


def _parse_seed_rows(raw) -> list[dict]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        if isinstance(raw.get("people"), list):
            return raw["people"]
    return []


def _load_seed_users() -> dict[str, dict]:
    """Optional JSON file(s) of pre-seeded faculty/staff profiles keyed by email."""
    for path in _seed_file_candidates():
        if not path.is_file():
            continue
        try:
            rows = _parse_seed_rows(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
        out = {}
        for row in rows:
            email = _normalize_cmu_email(row.get("email") or "")
            if email:
                out[email] = row
        if out:
            return out
    return {}


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


def _write_session(user: User) -> None:
    session.permanent = True
    session["uid"] = user.id
    session["email"] = user.email
    session["name"] = user.name
    session["role"] = user.role
    session["role_group"] = user.role_group()
    session["primary_program"] = user.primary_program
    session["minor_code"] = user.minor_code
    session["is_admin"] = user.is_admin
    session.modified = True


def _auth_payload(user: User) -> dict:
    """Public user dict plus bearer token for cross-origin clients."""
    body = user.to_public_dict()
    body["auth_token"] = make_auth_token(user.id)
    return body


def _email_allowed(email: str) -> bool:
    allowed_domain = (current_app.config.get("ALLOWED_EMAIL_DOMAIN") or "").lower()
    if allowed_domain:
        return email.endswith("@" + allowed_domain)
    return True


def _upsert_user_from_login(email: str, name: str, google_sub: str | None = None) -> User:
    """Find or create a user, apply seed/admin rules, mark profile complete when ready."""
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
    else:
        if google_sub and not user.google_sub:
            user.google_sub = google_sub
        if not user.name and name:
            user.name = name

    _sync_directory_profile(user, email)

    user.last_login = datetime.now(timezone.utc)
    if user.profile_is_complete():
        user.profile_completed = True

    db.session.commit()
    return user


# ── Register / login / password reset ────────────────────────
@bp.route("/auth/register", methods=["POST"])
def register():
    """Create an account with @andrew.cmu.edu email and password."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    if not email:
        return jsonify(
            error="invalid_email",
            message="Use your @andrew.cmu.edu email to create an account.",
        ), 400
    if not _email_allowed(email):
        allowed_domain = current_app.config.get("ALLOWED_EMAIL_DOMAIN") or "andrew.cmu.edu"
        return jsonify(error="domain_not_allowed", message=f"Only {allowed_domain} accounts are allowed."), 403

    password = data.get("password") or ""
    err = _validate_password(password)
    if err:
        return jsonify(error="weak_password", message=err), 400

    confirm = data.get("confirm_password") or password
    if password != confirm:
        return jsonify(error="password_mismatch", message="Passwords do not match."), 400

    existing = db.session.query(User).filter_by(email=email).one_or_none()
    if existing:
        if existing.password_hash:
            return jsonify(error="email_taken", message="An account with this email already exists. Sign in instead."), 409
        existing.password_hash = _hash_password(password)
        if not existing.name:
            existing.name = (data.get("name") or "").strip() or email.split("@", 1)[0].replace(".", " ").title()
        user = _finalize_user(existing, email)
    else:
        name = (data.get("name") or "").strip() or email.split("@", 1)[0].replace(".", " ").title()
        user = _create_user_with_password(email, name, password)

    if not user.password_hash:
        return jsonify(error="server_error", message="Account could not be created. Try again."), 500

    _write_session(user)
    return jsonify(_auth_payload(user)), 201


@bp.route("/auth/login", methods=["POST"])
def login():
    """Sign in with @andrew.cmu.edu email and password."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    password = data.get("password") or ""
    if not email:
        return jsonify(error="invalid_email", message="Enter your @andrew.cmu.edu email."), 400
    if not password:
        return jsonify(error="missing_password", message="Enter your password."), 400

    user = db.session.query(User).filter_by(email=email).one_or_none()
    if user is None or not _password_ok(user, password):
        return jsonify(error="invalid_credentials", message="Email or password is incorrect."), 401

    user = _finalize_user(user, email)
    _write_session(user)
    return jsonify(_auth_payload(user))


@bp.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Start a password reset. Returns a token in dev when EXPOSE_RESET_TOKEN=1."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    if not email:
        return jsonify(error="invalid_email", message="Enter your @andrew.cmu.edu email."), 400

    payload = {"ok": True, "message": GENERIC_RESET_MESSAGE}
    user = db.session.query(User).filter_by(email=email).one_or_none()
    if user is not None:
        raw_token = _create_reset_token(user)
        reset_url = _frontend_reset_url(raw_token)
        send_password_reset_email(email, reset_url)

        expose = os.environ.get("EXPOSE_RESET_TOKEN", "").lower() in ("1", "true", "yes")
        if expose:
            payload["reset_token"] = raw_token
            payload["reset_url"] = reset_url

    return jsonify(payload)


@bp.route("/auth/reset-password", methods=["POST"])
def reset_password():
    """Set a new password using the token from the reset email."""
    data = request.get_json(silent=True) or {}
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if not token:
        return jsonify(error="missing_fields", message="Reset token is required."), 400
    err = _validate_password(password)
    if err:
        return jsonify(error="weak_password", message=err), 400

    row = _find_valid_reset_token(token)
    if row is None:
        return jsonify(error="invalid_token", message="This reset link is invalid or has expired."), 400

    user = db.session.get(User, row.user_id)
    if user is None:
        return jsonify(error="invalid_token", message="This reset link is invalid or has expired."), 400

    user.password_hash = _hash_password(password)
    _invalidate_reset_tokens(user.id)
    db.session.commit()
    return jsonify(ok=True, message="Password updated. You can sign in now.")


# ── Legacy email sign-in (passwordless — deprecated) ─────────
@bp.route("/auth/email", methods=["POST"])
def email_signin():
    """Body: { "email": "name@andrew.cmu.edu" [, "name": "Display Name"] }
    Campus-only login for GH Pages when Google SSO is awkward. Faculty in the
    seed file are recognized automatically; everyone else is a student."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    if not email:
        return jsonify(
            error="invalid_email",
            message="Enter a valid CMU email (@andrew.cmu.edu, @cmu.edu, or @qatar.cmu.edu).",
        ), 400

    if not _email_allowed(email):
        allowed_domain = current_app.config.get("ALLOWED_EMAIL_DOMAIN") or "andrew.cmu.edu"
        return jsonify(
            error="domain_not_allowed",
            message=f"Only {allowed_domain} accounts are allowed.",
        ), 403

    name = (data.get("name") or "").strip() or email.split("@", 1)[0].replace(".", " ").title()
    user = _upsert_user_from_login(email, name)
    _write_session(user)
    return jsonify(_auth_payload(user))


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

    email = _normalize_cmu_email(info.get("email") or "")
    if not email or not info.get("email_verified"):
        return jsonify(error="email_unverified", message="Google account email is not verified."), 401

    if not _email_allowed(email):
        allowed_domain = current_app.config.get("ALLOWED_EMAIL_DOMAIN") or "andrew.cmu.edu"
        return jsonify(
            error="domain_not_allowed",
            message=f"Only {allowed_domain} accounts are allowed.",
        ), 403

    google_sub = info.get("sub")
    name = info.get("name") or info.get("given_name") or email.split("@", 1)[0]
    user = _upsert_user_from_login(email, name, google_sub=google_sub)
    _write_session(user)
    return jsonify(_auth_payload(user))


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
    return jsonify(_auth_payload(user))


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
            if new_role not in SELF_SETTABLE_ROLES:
                return jsonify(error="invalid_role", message=f"You can't set your own role to '{new_role}'. Faculty roles are assigned by an admin."), 400

    err = _validate_consistent_profile(new_role, new_primary, new_minor, new_advisor_scope)
    if err:
        return jsonify(error="inconsistent_profile", message=err), 400

    # All checks passed — apply the patch.
    if "role" in data and not is_admin:
        user.role = new_role
    for field in ("name", "primary_program", "minor_code", "advisor_scope", "department_scope", "department"):
        if field in data:
            value = data[field]
            if value == "":
                value = None
            setattr(user, field, value)

    user.profile_completed = user.profile_is_complete()
    db.session.commit()
    _write_session(user)
    return jsonify(_auth_payload(user))
