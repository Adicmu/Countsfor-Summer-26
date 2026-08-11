"""Unit tests for SOC scrape thresholds and HTML parsing."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))

from scrape_soc import parse_courses, scrape_threshold  # noqa: E402


def test_summer_semester_uses_lower_threshold():
    assert scrape_threshold("M26") < scrape_threshold("F26")
    assert scrape_threshold("M25") < scrape_threshold("S26")


def test_fall_and_spring_share_default_threshold():
    assert scrape_threshold("F26") == scrape_threshold("S26")


def _cells(*values):
    return "".join(f"<td>{v}</td>" for v in values)


def test_parse_courses_keeps_continuation_rows_for_same_section():
    """SOC lists extra meeting times on rows with a blank section cell."""
    html = (
        _cells("21259", "Calculus in Three Dimensions", "10", "W", "", "MW", "10:00AM", "10:50AM", "Doha, Qatar", "In-person only")
        + _cells("", "", "", "", "", "UT", "10:00AM", "11:15AM", "Doha, Qatar", "In-person only")
    )
    courses = parse_courses(html, "MSC", "Mathematical Sciences")
    assert len(courses) == 1
    sections = courses[0]["sections"]
    assert len(sections) == 2
    assert sections[0]["section"] == "W"
    assert sections[0]["days"] == "MW"
    assert sections[1]["section"] == "W"
    assert sections[1]["days"] == "UT"


def test_parse_courses_still_adds_section_only_rows():
    html = _cells("15122", "Principles of Imperative Computation", "10", "A", "", "", "", "", "Doha, Qatar", "In-person only")
    courses = parse_courses(html, "CS", "Computer Science")
    assert len(courses[0]["sections"]) == 1
    assert courses[0]["sections"][0]["section"] == "A"
