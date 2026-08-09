"""CMU email normalization shared by auth and directory."""
import json
from pathlib import Path

CMU_EMAIL_DOMAINS = ("andrew.cmu.edu", "cmu.edu", "qatar.cmu.edu")


def normalize_cmu_email(raw: str) -> str | None:
    email = (raw or "").strip().lower()
    if "@" not in email:
        return None
    local, _, domain = email.partition("@")
    if domain not in CMU_EMAIL_DOMAINS:
        return None
    if domain in ("cmu.edu", "qatar.cmu.edu"):
        return f"{local}@andrew.cmu.edu"
    return email


def parse_seed_rows(raw) -> list[dict]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict) and isinstance(raw.get("people"), list):
        return raw["people"]
    return []


def resolve_seed_path(path: Path) -> Path:
    if path.is_absolute():
        return path
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent
    for base in (Path.cwd(), backend_dir, repo_root):
        candidate = (base / path).resolve()
        if candidate.is_file():
            return candidate
    return (repo_root / path).resolve()
