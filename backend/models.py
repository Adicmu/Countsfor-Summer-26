"""ORM models. Mirrors `schema.sql` so the doc and code stay in sync.

Field meanings live in `schema.sql`. Keep this file thin — business logic
belongs in route modules or permissions.py.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


VALID_ROLES = (
    "student",
    "professor",
    "area_head",
    "associate_area_head",
    "advisor",
    "admin",
)

FLAG_STATUSES = ("pending", "reviewed", "resolved", "dismissed")


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Google SSO — no password column. If we ever add email+password, add
    # password_hash here as nullable so SSO users don't need a password.
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="student", index=True)
    primary_program: Mapped[str | None] = mapped_column(String(8), nullable=True)
    minor_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    advisor_scope: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department_scope: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    profile_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    flags: Mapped[list["Flag"]] = relationship(back_populates="submitter", foreign_keys="Flag.submitted_by_id")
    wishlist: Mapped[list["WishlistItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    def profile_is_complete(self) -> bool:
        """True when the user has enough profile data to skip onboarding."""
        if self.role == "admin":
            return bool(self.primary_program)
        if self.role == "student":
            return bool(self.primary_program)
        if self.role == "professor":
            return bool(self.primary_program)
        if self.role in ("area_head", "associate_area_head"):
            return bool(self.primary_program)
        if self.role == "advisor":
            return bool(self.advisor_scope)
        return False

    def to_public_dict(self) -> dict:
        """Returned by /api/me — never expose google_sub or DB-internal ids
        to other users, but the owner can see their own."""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "primary_program": self.primary_program,
            "minor_code": self.minor_code,
            "advisor_scope": self.advisor_scope,
            "department_scope": self.department_scope,
            "department": self.department,
            "is_admin": self.is_admin,
            "profile_completed": self.profile_completed,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }


class Flag(db.Model):
    __tablename__ = "flags"

    # String ID matches the frontend's existing localStorage scheme
    # ('flg-<base36ts>-<rand>') so a one-shot migration POSTs verbatim.
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    course_code: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(64), nullable=False)
    reason_label: Mapped[str] = mapped_column(String(255), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Snapshot the submitter at submit time so the flag stays self-contained
    # if the user is later deleted or renamed.
    submitted_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    submitted_by_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    submitted_by_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    submitted_by_role: Mapped[str] = mapped_column(String(32), nullable=False)
    submitted_program: Mapped[str | None] = mapped_column(String(8), nullable=True)
    submitted_minor: Mapped[str | None] = mapped_column(String(32), nullable=True)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    submitter: Mapped[User | None] = relationship("User", foreign_keys=[submitted_by_id], back_populates="flags")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "course_code": self.course_code,
            "course_name": self.course_name,
            "reason_code": self.reason_code,
            "reason_label": self.reason_label,
            "notes": self.notes,
            "submitted_by_id": self.submitted_by_id,
            "submitted_by_name": self.submitted_by_name,
            "submitted_by_email": self.submitted_by_email,
            "submitted_by_role": self.submitted_by_role,
            "submitted_program": self.submitted_program,
            "submitted_minor": self.submitted_minor,
            "status": self.status,
            "admin_notes": self.admin_notes,
            "resolved_by": self.resolved_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class WishlistItem(db.Model):
    __tablename__ = "wishlist_items"
    __table_args__ = (
        UniqueConstraint("user_id", "course_code", name="uq_user_course"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_code: Mapped[str] = mapped_column(String(16), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="wishlist")

    def to_dict(self) -> dict:
        return {
            "course_code": self.course_code,
            "added_at": self.added_at.isoformat() if self.added_at else None,
        }
