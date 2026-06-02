"""Wishlist API: student-only saved courses."""
from flask import Blueprint, g, jsonify, request
from sqlalchemy.exc import IntegrityError

from .db import db
from .models import WishlistItem
from .permissions import require_role


bp = Blueprint("wishlist", __name__, url_prefix="/api/wishlist")


@bp.route("", methods=["GET"])
@require_role("student")
def get_wishlist():
    items = (
        db.session.query(WishlistItem)
        .filter_by(user_id=g.user.id)
        .order_by(WishlistItem.added_at.desc())
        .all()
    )
    return jsonify(items=[i.to_dict() for i in items])


@bp.route("", methods=["POST"])
@require_role("student")
def add_wishlist():
    """Idempotent — re-POST of an existing course_code is a no-op (200)."""
    data = request.get_json(silent=True) or {}
    course_code = (data.get("course_code") or "").strip()
    if not course_code:
        return jsonify(error="missing_course_code", message="course_code required."), 400

    item = WishlistItem(user_id=g.user.id, course_code=course_code)
    db.session.add(item)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        existing = (
            db.session.query(WishlistItem)
            .filter_by(user_id=g.user.id, course_code=course_code)
            .one()
        )
        return jsonify(existing.to_dict()), 200

    return jsonify(item.to_dict()), 201


@bp.route("/<course_code>", methods=["DELETE"])
@require_role("student")
def remove_wishlist(course_code: str):
    item = (
        db.session.query(WishlistItem)
        .filter_by(user_id=g.user.id, course_code=course_code)
        .one_or_none()
    )
    if not item:
        return jsonify(error="not_found", message="Not in wishlist."), 404
    db.session.delete(item)
    db.session.commit()
    return "", 204
