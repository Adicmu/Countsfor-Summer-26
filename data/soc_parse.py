"""Shared SOC parsing: campus attribution, modality, offering records.

Used by scrape_soc.py, reconcile_offerings.py, and unit tests.
"""
from __future__ import annotations

import re

SEMESTER_LABELS = {
    "S": "Spring",
    "M": "Summer",
    "F": "Fall",
    "N": "Fall mini",
}

VALID_CAMPUSES = frozenset({"Qatar", "Pittsburgh"})
VALID_MODALITIES = frozenset({"In Person", "Remote", "Hybrid"})

# Known campus attribution fixtures (T6). Keys are 5-digit course numbers.
CAMPUS_FIXTURES = {
    "82289": "Qatar",  # 82-289 Tutoring for Community Outreach - CMUQ
}


def semester_code_to_label(code: str) -> str:
    """F26 -> Fall 2026"""
    if not code or len(code) < 3:
        return code or ""
    season = SEMESTER_LABELS.get(code[0], code[0])
    year = 2000 + int(code[1:3])
    return f"{season} {year}"


def parse_campus_from_location(location: str | None, fallback_campus: str | None = None) -> str | None:
    """Map SOC location text to Qatar or Pittsburgh.

    PRG_LOCATION fallback (PIT/DOH scrape tag) wins when location is ambiguous.
    """
    if fallback_campus in VALID_CAMPUSES:
        return fallback_campus

    loc = (location or "").strip().lower()
    if not loc:
        return fallback_campus if fallback_campus in VALID_CAMPUSES else None

    if "doha" in loc or "qatar" in loc:
        return "Qatar"
    if "pittsburgh" in loc or loc.endswith(", pennsylvania"):
        return "Pittsburgh"

    return None


def normalize_modality(delivery_mode: str | None) -> str:
    """Map raw SOC delivery_mode strings to In Person / Remote / Hybrid."""
    dm = (delivery_mode or "").strip().lower()
    if not dm:
        return "In Person"
    if "remote only" in dm or dm == "remote":
        return "Remote"
    if "hybrid" in dm:
        return "Hybrid"
    if "in-person + remote" in dm or "in-person (rotation) + remote" in dm:
        return "Hybrid"
    if "in-person + technology" in dm:
        return "Hybrid"
    if "remote" in dm and "in-person" in dm:
        return "Hybrid"
    if "remote" in dm:
        return "Remote"
    return "In Person"


def format_days_times(section: dict) -> str:
    days = (section.get("days") or "").strip() or "TBA"
    begin = (section.get("begin_time") or "").strip()
    end = (section.get("end_time") or "").strip()
    if begin and begin != "TBA" and end:
        return f"{days} {begin}-{end}"
    return days


def course_number_to_code(num: str) -> str:
    """15122 -> 15-122"""
    n = (num or "").strip()
    if len(n) == 5 and n.isdigit():
        return f"{n[:2]}-{n[2:]}"
    return n


def code_to_course_number(code: str) -> str:
    return (code or "").replace("-", "")


def build_offering(
    *,
    semester_code: str,
    section: dict,
    units: str | None = None,
    instructor: str | None = None,
) -> dict:
    campus = parse_campus_from_location(
        section.get("location"),
        section.get("campus"),
    )
    return {
        "semester": semester_code_to_label(semester_code),
        "semester_code": semester_code,
        "campus": campus,
        "section": section.get("section") or "",
        "modality": normalize_modality(section.get("delivery_mode")),
        "units": units or section.get("units") or "",
        "days_times": format_days_times(section),
        "instructor": instructor or section.get("instructor") or "",
        "location": section.get("location") or "",
        "delivery_mode_raw": section.get("delivery_mode") or "",
    }


def expected_campus_for_course(course_number: str, title: str | None = None) -> str | None:
    """Return forced campus for known mis-tagged courses."""
    num = code_to_course_number(course_number)
    if num in CAMPUS_FIXTURES:
        return CAMPUS_FIXTURES[num]
    t = (title or "").lower()
    if "cmuq" in t or "qatar only" in t:
        return "Qatar"
    return None


def apply_campus_fix(course_number: str, title: str | None, campus: str | None) -> str | None:
    forced = expected_campus_for_course(course_number, title)
    if forced:
        return forced
    return campus
