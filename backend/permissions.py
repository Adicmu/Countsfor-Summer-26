"""Role-based authorization decorators.

The frontend's `isFaculty()` (js/profile.js) is the canonical mapping for
UI gating; this module enforces the same on the server. Frontend gating is
not sufficient — a student could otherwise inspect the DOM and POST a flag.
"""
from functools import wraps
from typing import Iterable

from flask import jsonify, session, g

from .db import db
from .models import User


FACULTY_ROLES = {"professor", "area_head", "associate_area_head", "advisor"}
FACULTY_OR_ADMIN = FACULTY_ROLES | {"admin"}


def _load_user() -> User | None:
    """Resolve the current user from the signed session cookie. Cached on
    `g` so multiple decorators in one request don't re-query the DB."""
    if hasattr(g, "_current_user"):
        return g._current_user
    uid = session.get("uid")
    user = db.session.get(User, uid) if uid else None
    g._current_user = user
    return user


def require_login(fn):
    """401 if not logged in. Sets `g.user` for the wrapped view."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _load_user()
        if user is None:
            return jsonify(error="unauthenticated", message="Sign in required."), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles: str | Iterable[str]):
    """403 unless the user's role is in `roles`. Accepts a single role,
    multiple positional roles, or one iterable of roles."""
    if len(roles) == 1 and not isinstance(roles[0], str):
        allowed = set(roles[0])
    else:
        allowed = set(roles)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = _load_user()
            if user is None:
                return jsonify(error="unauthenticated", message="Sign in required."), 401
            if user.role not in allowed:
                return jsonify(
                    error="forbidden",
                    message=f"This action requires one of: {', '.join(sorted(allowed))}.",
                ), 403
            g.user = user
            return fn(*args, **kwargs)
        return wrapper

    return decorator


def current_user() -> User | None:
    """Convenience for routes that handle the unauthenticated case manually."""
    return _load_user()
