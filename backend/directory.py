"""Faculty directory — static JSON seed + editable Postgres layer (DB wins)."""
from __future__ import annotations

import json
from pathlib import Path

from flask import current_app

from .cmu import normalize_cmu_email, parse_seed_rows, resolve_seed_path
from .db import db
from .models import DirectoryEntry, FACULTY_ROLES

ELEVATED_ROLES = FACULTY_ROLES | {"admin"}
UI_DIRECTORY_ROLES = ("advisor", "professor", "area_head", "associate_area_head", "admin")


def _json_directory_paths() -> list[Path]:
    paths: list[Path] = []
    configured = (current_app.config.get("SEED_USERS_PATH") or "").strip()
    if configured:
        paths.append(resolve_seed_path(Path(configured)))
    if not current_app.config.get("TESTING"):
        backend_dir = Path(__file__).resolve().parent
        repo_root = backend_dir.parent
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


def _load_json_directory() -> dict[str, dict]:
    for path in _json_directory_paths():
        if not path.is_file():
            continue
        try:
            rows = parse_seed_rows(json.loads(path.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
        out: dict[str, dict] = {}
        for row in rows:
            email = normalize_cmu_email(row.get("email") or "")
            if email:
                out[email] = dict(row)
        if out:
            return out
    return {}


def resolve_directory_entry(email: str) -> dict | None:
    """Lookup order: Postgres directory_entries first, then JSON seed."""
    row = db.session.query(DirectoryEntry).filter_by(email=email).one_or_none()
    if row is not None:
        return row.to_merged_dict()
    return _load_json_directory().get(email)


def load_merged_directory() -> dict[str, dict]:
    """All directory rows; DB entry overrides JSON for the same email."""
    merged = _load_json_directory()
    for row in db.session.query(DirectoryEntry).all():
        merged[row.email] = row.to_merged_dict()
    return merged


def list_elevated_directory() -> list[dict]:
    """People with elevated access (non-student roles) for the directory panel."""
    merged = load_merged_directory()
    db_rows = {r.email: r for r in db.session.query(DirectoryEntry).all()}
    json_emails = set(_load_json_directory().keys())
    items: list[dict] = []
    for email in sorted(merged.keys()):
        row = merged[email]
        role = (row.get("role") or "professor").strip().lower()
        if role == "student":
            continue
        source = "db" if email in db_rows else "json"
        if email in db_rows and email in json_emails:
            source = "db+json"
        db_row = db_rows.get(email)
        items.append({
            "id": db_row.id if db_row else None,
            "email": email,
            "name": row.get("name") or email.split("@", 1)[0],
            "role": role,
            "department": row.get("department"),
            "primary_program": row.get("primary_program"),
            "picture_url": row.get("picture_url"),
            "source": source,
            "editable": db_row is not None or email not in json_emails,
        })
    return items
