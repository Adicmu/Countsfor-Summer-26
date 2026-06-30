"""Auth routes: Google Sign-In, logout, /api/me.

Frontend posts the Google ID token (JWT from Google Identity Services) to
/api/auth/google. We verify it, upsert the user, and set a signed session
cookie. Subsequent requests carry the cookie automatically (with CORS
`credentials: 'include'`).
"""
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
from .email_utils import email_configured, send_email
from .models import User
from .permissions import require_login, current_user


bp = Blueprint("auth", __name__, url_prefix="/api")


CMU_EMAIL_DOMAINS = ("andrew.cmu.edu", "cmu.edu", "qatar.cmu.edu")
MIN_PASSWORD_LEN = 8
RESET_TOKEN_HOURS = 24


def _hash_password(password: str) -> str:
    return generate_password_hash(password)


def _build_reset_url(config, token: str, email: str) -> str:
    """Full link the user clicks to reset, e.g.
    https://adicmu.github.io/Countsfor-Summer-26/?reset=<token>&email=<email>"""
    from urllib.parse import quote
    base = (config.get("PUBLIC_APP_URL") or (config.get("FRONTEND_ORIGINS") or [""])[0] or "").rstrip("/")
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}reset={quote(token)}&email={quote(email)}"


def _reset_email_text(reset_url: str) -> str:
    return (
        "We received a request to reset your CountsFor password.\n\n"
        f"Use this link to choose a new password (valid for {RESET_TOKEN_HOURS} hours):\n"
        f"{reset_url}\n\n"
        "If you didn't request this, you can safely ignore this email."
    )


def _reset_email_html(reset_url: str) -> str:
    return (
        "<p>We received a request to reset your CountsFor password.</p>"
        f"<p><a href=\"{reset_url}\">Choose a new password</a> "
        f"(valid for {RESET_TOKEN_HOURS} hours).</p>"
        "<p>If you didn't request this, you can safely ignore this email.</p>"
    )


def _password_ok(user: User, password: str) -> bool:
    if not user.password_hash:
        return False
    return check_password_hash(user.password_hash, password)


def _validate_password(password: str) -> str | None:
    if not password or len(password) < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters."
    return None


def _finalize_user(user: User, email: str) -> User:
    """Apply seed/admin rules and mark profile complete when ready."""
    if not user.profile_completed:
        seed = _load_seed_users().get(email)
        if seed:
            _apply_seed(user, seed)
    _sync_admin_flag(user, email)
    user.last_login = datetime.now(timezone.utc)
    if user.profile_is_complete():
        user.profile_completed = True
    db.session.commit()
    return user


def _create_user_with_password(email: str, name: str, password: str) -> User:
    user = User(
        email=email,
        name=name,
        role="student",
        password_hash=_hash_password(password),
    )
    db.session.add(user)
    seed = _load_seed_users().get(email)
    if seed:
        _apply_seed(user, seed)
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


def _seed_file_candidates() -> list[Path]:
    """Ordered list of seed JSON paths (first match wins)."""
    paths: list[Path] = []
    configured = (current_app.config.get("SEED_USERS_PATH") or "").strip()
    if configured:
        paths.append(Path(configured))
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
    session["primary_program"] = user.primary_program
    session["minor_code"] = user.minor_code
    session["is_admin"] = user.is_admin


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
        seed = _load_seed_users().get(email)
        if seed:
            _apply_seed(user, seed)
    else:
        if google_sub and not user.google_sub:
            user.google_sub = google_sub
        if not user.name and name:
            user.name = name
        if not user.profile_completed:
            seed = _load_seed_users().get(email)
            if seed:
                _apply_seed(user, seed)

    _sync_admin_flag(user, email)

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

    _write_session(user)
    return jsonify(user.to_public_dict()), 201


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
    return jsonify(user.to_public_dict())


@bp.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Start a password reset. Returns a token in dev when EXPOSE_RESET_TOKEN=1."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    if not email:
        return jsonify(error="invalid_email", message="Enter your @andrew.cmu.edu email."), 400

    cfg = current_app.config
    is_prod = cfg.get("IS_PRODUCTION", False)
    can_email = email_configured(cfg)

    # No email service and we're in production → be honest instead of claiming a
    # mail was sent. Returned for ANY email (existing or not) so it never reveals
    # whether an account exists.
    if not can_email and is_prod:
        return jsonify(
            error="email_unavailable",
            message="Password reset by email isn't available yet. Please contact an administrator.",
        ), 503

    sent_msg = "If an account exists for that email, we've emailed a reset link. Check your inbox."
    dev_msg = "If an account exists for that email, use the reset link below."

    user = db.session.query(User).filter_by(email=email).one_or_none()
    if user is None:
        # Don't reveal non-existence — same shape as the success path.
        return jsonify(ok=True, message=sent_msg if can_email else dev_msg)

    raw_token = secrets.token_urlsafe(32)
    user.reset_token_hash = generate_password_hash(raw_token)
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=RESET_TOKEN_HOURS)
    db.session.commit()

    reset_url = _build_reset_url(cfg, raw_token, email)

    if can_email:
        ok = send_email(
            cfg, email, "Reset your CountsFor password",
            _reset_email_text(reset_url), _reset_email_html(reset_url),
        )
        if not ok:
            return jsonify(
                error="email_failed",
                message="We couldn't send the reset email right now. Please try again in a few minutes.",
            ), 502
        return jsonify(ok=True, message=sent_msg)

    # No email service, non-production → expose the token inline for local dev.
    return jsonify(ok=True, message=dev_msg, reset_token=raw_token, email=email)


@bp.route("/auth/set-password", methods=["POST"])
@require_login
def set_password():
    """Set/replace the signed-in user's password. Used by the Google-based
    recovery flow: Google sign-in has already proven the user owns this
    @andrew.cmu.edu address (the same proof an emailed reset link provides),
    so no reset token is needed."""
    from flask import g

    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    err = _validate_password(password)
    if err:
        return jsonify(error="weak_password", message=err), 400

    user = g.user
    user.password_hash = _hash_password(password)
    # Any outstanding email-reset token is now moot.
    user.reset_token_hash = None
    user.reset_token_expires = None
    db.session.commit()
    return jsonify(ok=True, message="Password set. You can now sign in with your email and password too.")


@bp.route("/auth/reset-password", methods=["POST"])
def reset_password():
    """Set a new password using the token from forgot-password."""
    data = request.get_json(silent=True) or {}
    email = _normalize_cmu_email(data.get("email") or "")
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    if not email or not token:
        return jsonify(error="missing_fields", message="Email and reset token are required."), 400
    err = _validate_password(password)
    if err:
        return jsonify(error="weak_password", message=err), 400

    user = db.session.query(User).filter_by(email=email).one_or_none()
    # SQLite returns naive datetimes for timezone=True columns; coerce to UTC so
    # the comparison with an aware now() doesn't raise (works on Postgres too).
    expires = user.reset_token_expires if user else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if (
        user is None
        or not user.reset_token_hash
        or not expires
        or expires < datetime.now(timezone.utc)
        or not check_password_hash(user.reset_token_hash, token)
    ):
        return jsonify(error="invalid_token", message="This reset link is invalid or has expired."), 400

    user.password_hash = _hash_password(password)
    user.reset_token_hash = None
    user.reset_token_expires = None
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
    return jsonify(user.to_public_dict())


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
    return jsonify(user.to_public_dict())
