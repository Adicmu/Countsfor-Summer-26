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


def test_normalize_course_code_compact_and_float():
    from soc_parse import normalize_course_code

    assert normalize_course_code("82101") == "82-101"
    assert normalize_course_code("82101.0") == "82-101"
    assert normalize_course_code("82-101") == "82-101"


def test_course_number_to_code_uses_normalizer():
    from soc_parse import course_number_to_code

    assert course_number_to_code("82101.0") == "82-101"


def test_department_list_parses_soc_form():
    from soc_departments import parse_department_list

    html = """
    <select name="DEPT">
      <option value="All">All Departments</option>
      <option value="BUS">Business Administration (70XXX)</option>
      <option value="S3D">Software & Societal Systems (17XXX)</option>
    </select>
    """
    depts = parse_department_list(html)
    assert depts == [("BUS", "Business Administration"), ("S3D", "Software & Societal Systems")]


def test_semester_list_parses_soc_form():
    from soc_departments import parse_semester_list

    html = """
    <select name="SEMESTER" class="form-control">
      <option value="F26">Fall 2026</option>
      <option value="M26">Summer 2026</option>
      <option value="S26">Spring 2026</option>
    </select>
    """
    sems = parse_semester_list(html)
    assert sems == [("F26", "Fall 2026"), ("M26", "Summer 2026"), ("S26", "Spring 2026")]
