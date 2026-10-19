"""Admin console API — overview counts, usage insights and the activity log. Admin only."""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Blueprint, jsonify, request
from sqlalchemy import func

from .db import db
from .models import (
    AdminAuditEvent, CourseSearchCount, DirectoryEntry, Flag, FLAG_STATUSES,
    SchedulePlan, User, WishlistItem,
)
from .permissions import require_role_group, ROLE_GROUP_ADMIN

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

SOC_PATH = Path(__file__).resolve().parent.parent / "data" / "soc.json"
_LAST_SCRAPE_RE = re.compile(r'"last_scrape"\s*:\s*"([^"]+)"')


def record_event(actor: User, action: str, target: str | None = None, **details) -> None:
    """Add an audit row to the current session. The caller's commit saves it with the change."""
    clean = {k: v for k, v in details.items() if v is not None}
    db.session.add(AdminAuditEvent(
        actor_id=actor.id,
        actor_email=actor.email,
        actor_name=actor.name,
        action=action,
        target=target,
        details=json.dumps(clean) if clean else None,
    ))


def _as_utc(dt: datetime | None) -> datetime | None:
    # SQLite hands back naive datetimes; Postgres returns aware ones.
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _course_data_info() -> dict:
    """Read only the header of the 22 MB SOC file; metadata is its first key."""
    try:
        with SOC_PATH.open("r", encoding="utf-8") as fh:
            head = fh.read(4096)
    except OSError:
        return {"last_scrape": None}
    m = _LAST_SCRAPE_RE.search(head)
    return {"last_scrape": m.group(1) if m else None}


def _limit(default: int, maximum: int) -> int:
    try:
        value = int(request.args.get("limit", default))
    except ValueError:
        value = default
    return max(1, min(value, maximum))


@bp.route("/overview", methods=["GET"])
@require_role_group(ROLE_GROUP_ADMIN)
def overview():
    now = datetime.now(timezone.utc)
    week_ago, month_ago = now - timedelta(days=7), now - timedelta(days=30)

    users = db.session.query(User).all()
    by_role: dict[str, int] = {}
    by_group = {"student": 0, "faculty": 0, "admin": 0}
    new_7d = new_30d = active_7d = incomplete = 0
    for u in users:
        by_role[u.role] = by_role.get(u.role, 0) + 1
        by_group[u.role_group()] += 1
        created, last_login = _as_utc(u.created_at), _as_utc(u.last_login)
        if created and created >= week_ago:
            new_7d += 1
        if created and created >= month_ago:
            new_30d += 1
        if last_login and last_login >= week_ago:
            active_7d += 1
        if not u.profile_completed:
            incomplete += 1

    flag_counts = {s: 0 for s in FLAG_STATUSES}
    for status, count in db.session.query(Flag.status, func.count(Flag.id)).group_by(Flag.status):
        flag_counts[status] = count

    recent = sorted(users, key=lambda u: _as_utc(u.created_at) or now, reverse=True)[:6]

    return jsonify(
        users={
            "total": len(users),
            "by_group": by_group,
            "by_role": by_role,
            "new_7d": new_7d,
            "new_30d": new_30d,
            "active_7d": active_7d,
            "incomplete_profiles": incomplete,
        },
        flags=flag_counts,
        wishlist={
            "items": db.session.query(func.count(WishlistItem.id)).scalar() or 0,
            "students": db.session.query(func.count(func.distinct(WishlistItem.user_id))).scalar() or 0,
        },
        plans=db.session.query(func.count(SchedulePlan.id)).scalar() or 0,
        course_lookups=db.session.query(func.coalesce(func.sum(CourseSearchCount.search_count), 0)).scalar() or 0,
        directory_overrides=db.session.query(func.count(DirectoryEntry.id)).scalar() or 0,
        course_data=_course_data_info(),
        recent_signups=[
            {
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "primary_program": u.primary_program,
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in recent
        ],
    )


@bp.route("/insights", methods=["GET"])
@require_role_group(ROLE_GROUP_ADMIN)
def insights():
    semester = (request.args.get("semester") or "").strip().upper() or None

    lookups_q = db.session.query(
        CourseSearchCount.course_code, func.sum(CourseSearchCount.search_count).label("n")
    )
    if semester:
        lookups_q = lookups_q.filter(CourseSearchCount.semester_code == semester)
    top_lookups = lookups_q.group_by(CourseSearchCount.course_code).order_by(func.sum(CourseSearchCount.search_count).desc()).limit(15).all()

    by_program_q = db.session.query(
        CourseSearchCount.primary_program, CourseSearchCount.course_code,
        func.sum(CourseSearchCount.search_count),
    )
    if semester:
        by_program_q = by_program_q.filter(CourseSearchCount.semester_code == semester)
    by_program: dict[str, list[dict]] = {}
    for program, code, n in by_program_q.group_by(CourseSearchCount.primary_program, CourseSearchCount.course_code):
        by_program.setdefault(program, []).append({"course_code": code, "count": int(n)})
    for program in by_program:
        by_program[program] = sorted(by_program[program], key=lambda r: -r["count"])[:5]

    most_saved = (
        db.session.query(WishlistItem.course_code, func.count(WishlistItem.id))
        .group_by(WishlistItem.course_code)
        .order_by(func.count(WishlistItem.id).desc())
        .limit(15)
        .all()
    )

    flagged: dict[str, dict] = {}
    for code, name, status, n in db.session.query(
        Flag.course_code, Flag.course_name, Flag.status, func.count(Flag.id)
    ).group_by(Flag.course_code, Flag.course_name, Flag.status):
        row = flagged.setdefault(code, {"course_code": code, "course_name": name, "total": 0, "open": 0})
        row["total"] += n
        if status in ("pending", "reviewed"):
            row["open"] += n
    most_flagged = sorted(flagged.values(), key=lambda r: (-r["total"], r["course_code"]))[:10]

    students_by_program = dict(
        db.session.query(func.coalesce(User.primary_program, "none"), func.count(User.id))
        .filter(User.role == "student")
        .group_by(func.coalesce(User.primary_program, "none"))
        .all()
    )

    # Sign-ups per week for the last 12 weeks, oldest first.
    now = datetime.now(timezone.utc)
    start = now - timedelta(weeks=12)
    weeks = [0] * 12
    for (created,) in db.session.query(User.created_at).filter(User.created_at >= start):
        created = _as_utc(created)
        idx = min(11, max(0, (created - start).days // 7))
        weeks[idx] += 1

    semesters = [s for (s,) in db.session.query(CourseSearchCount.semester_code).distinct().order_by(CourseSearchCount.semester_code)]

    return jsonify(
        semester=semester,
        semesters=semesters,
        top_lookups=[{"course_code": c, "count": int(n)} for c, n in top_lookups],
        lookups_by_program=by_program,
        most_saved=[{"course_code": c, "count": n} for c, n in most_saved],
        most_flagged=most_flagged,
        students_by_program=students_by_program,
        signups_by_week={
            "start": start.date().isoformat(),
            "counts": weeks,
        },
    )


@bp.route("/activity", methods=["GET"])
@require_role_group(ROLE_GROUP_ADMIN)
def activity():
    limit = _limit(50, 200)
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    q = db.session.query(AdminAuditEvent)
    action = (request.args.get("action") or "").strip()
    if action:
        q = q.filter(AdminAuditEvent.action.like(action.rstrip("*") + "%"))
    total = q.count()
    rows = (
        q.order_by(AdminAuditEvent.created_at.desc(), AdminAuditEvent.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )
    return jsonify(total=total, page=page, limit=limit, items=[r.to_dict() for r in rows])

