"""ORM models. Mirrors `schema.sql` so the doc and code stay in sync.

Field meanings live in `schema.sql`. Keep this file thin — business logic
belongs in route modules or permissions.py.
"""
from __future__ import annotations

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

# Faculty job titles (permission group "faculty"). Admin is separate.
FACULTY_ROLES = frozenset({"professor", "area_head", "associate_area_head", "advisor"})

# UI bucket for faculty-style app chrome (flags, directory tab). Includes admin.
FACULTY_UI_ROLES = FACULTY_ROLES | {"admin"}

FLAG_STATUSES = ("pending", "reviewed", "resolved", "dismissed")

VALID_DEPARTMENTS = (
    "Business Administration",
    "Arts and Sciences",
    "Biological Sciences",
    "Computer Science",
    "Information Systems",
    "Dean's Office",
    "Education Office",
)


class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    # Google SSO — no password column. If we ever add email+password, add
    # password_hash here as nullable so SSO users don't need a password.
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reset_token_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="student", index=True)
    primary_program: Mapped[str | None] = mapped_column(String(8), nullable=True)
    minor_code: Mapped[str | None] = mapped_column(String(32), nullable=True)
    advisor_scope: Mapped[str | None] = mapped_column(String(32), nullable=True)
    department_scope: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    profile_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)

    flags: Mapped[list["Flag"]] = relationship(back_populates="submitter", foreign_keys="Flag.submitted_by_id")
    wishlist: Mapped[list["WishlistItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    minors: Mapped[list["UserMinor"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", order_by="UserMinor.id"
    )

    def minor_codes_list(self) -> list[str]:
        return [m.minor_code for m in self.minors]

    def sync_minor_code_legacy(self) -> None:
        """Keep nullable minor_code aligned with first minor for legacy clients."""
        codes = self.minor_codes_list()
        self.minor_code = codes[0] if len(codes) == 1 else None

    def role_group(self) -> str:
        """Permission bucket: student | faculty | admin."""
        if self.role == "admin":
            return "admin"
        if self.role in FACULTY_ROLES:
            return "faculty"
        return "student"

    def profile_is_complete(self) -> bool:
        if self.role_group() == "admin":
            return bool(self.department and self.primary_program)
        if self.role == "student":
            return bool(self.primary_program)
        if self.role_group() == "faculty":
            return bool(self.department and self.primary_program)
        return False

    def to_public_dict(self) -> dict:
        """Returned by /api/me — never expose google_sub or DB-internal ids
        to other users, but the owner can see their own."""
        codes = self.minor_codes_list()
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "role_group": self.role_group(),
            "primary_program": self.primary_program,
            "minor_code": self.minor_code,
            "minor_codes": codes,
            "advisor_scope": self.advisor_scope,
            "department_scope": self.department_scope,
            "department": self.department,
            "picture_url": self.picture_url,
            "is_admin": self.is_admin,
            "profile_completed": self.profile_completed,
            "last_login": self.last_login.isoformat() if self.last_login else None,
        }


class UserMinor(db.Model):
    __tablename__ = "user_minors"
    __table_args__ = (UniqueConstraint("user_id", "minor_code", name="uq_user_minor_code"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    minor_code: Mapped[str] = mapped_column(String(32), nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="minors")


class DirectoryEntry(db.Model):
    """Editable directory layer (Postgres). JSON seed is static; DB wins on clash."""
    __tablename__ = "directory_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="professor")
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    primary_program: Mapped[str | None] = mapped_column(String(8), nullable=True)
    picture_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    added_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def to_merged_dict(self) -> dict:
        return {
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "department": self.department,
            "primary_program": self.primary_program,
            "picture_url": self.picture_url,
        }

    def to_public_dict(self, *, source: str = "db") -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "role": self.role,
            "department": self.department,
            "primary_program": self.primary_program,
            "picture_url": self.picture_url,
            "source": source,
            "editable": True,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# Legacy alias — prefer DirectoryEntry
StaffDirectoryEntry = DirectoryEntry


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"
    __table_args__ = (Index("ix_password_reset_tokens_user_used", "user_id", "used"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="password_reset_tokens")


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
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="wishlist")

    def to_dict(self) -> dict:
        return {
            "course_code": self.course_code,
            "note": self.note,
            "added_at": self.added_at.isoformat() if self.added_at else None,
        }


class CourseSearchCount(db.Model):
    """Aggregated course lookups by program + semester (student peer signal)."""
    __tablename__ = "course_search_counts"
    __table_args__ = (
        UniqueConstraint(
            "primary_program", "semester_code", "course_code",
            name="uq_search_count_program_sem_course",
        ),
        Index("ix_search_count_program_sem", "primary_program", "semester_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    primary_program: Mapped[str] = mapped_column(String(8), nullable=False)
    semester_code: Mapped[str] = mapped_column(String(8), nullable=False)
    course_code: Mapped[str] = mapped_column(String(16), nullable=False)
    search_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    last_searched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    def to_dict(self) -> dict:
        return {
            "course_code": self.course_code,
            "search_count": self.search_count,
            "last_searched_at": self.last_searched_at.isoformat() if self.last_searched_at else None,
        }
