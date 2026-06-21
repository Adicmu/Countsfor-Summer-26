"""Unit tests for SOC campus and modality parsing."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))

from soc_parse import (  # noqa: E402
    apply_campus_fix,
    normalize_modality,
    parse_campus_from_location,
    expected_campus_for_course,
)


def test_82289_fixture_is_qatar():
    assert expected_campus_for_course("82289") == "Qatar"
    assert apply_campus_fix("82289", "Tutoring for Community Outreach - CMUQ", "Pittsburgh") == "Qatar"


def test_doha_location_is_qatar():
    assert parse_campus_from_location("Doha, Qatar") == "Qatar"


def test_pittsburgh_location():
    assert parse_campus_from_location("Pittsburgh, Pennsylvania") == "Pittsburgh"


def test_prg_location_fallback():
    assert parse_campus_from_location("Unknown Location", "Qatar") == "Qatar"


def test_modality_remote_only():
    assert normalize_modality("Remote only") == "Remote"


def test_modality_hybrid():
    assert normalize_modality("In-person + remote") == "Hybrid"


def test_modality_in_person():
    assert normalize_modality("In-person Expectation") == "In Person"
