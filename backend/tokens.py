"""Signed bearer tokens for cross-origin auth (GitHub Pages → Render).

Browsers often block third-party session cookies. The frontend stores
`auth_token` from login/register and sends `Authorization: Bearer …` on
API calls; the session cookie is still set when the browser allows it.
"""
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import current_app

SALT = "cf-auth-token"
MAX_AGE_SECONDS = 60 * 60 * 24 * 30  # 30 days — match session lifetime


def make_auth_token(user_id: int) -> str:
    serializer = URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=SALT)
    return serializer.dumps({"uid": user_id})


def verify_auth_token(token: str) -> int | None:
    if not token or not token.strip():
        return None
    serializer = URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=SALT)
    try:
        data = serializer.loads(token.strip(), max_age=MAX_AGE_SECONDS)
        return int(data["uid"])
    except (BadSignature, SignatureExpired, ValueError, TypeError, KeyError):
        return None
