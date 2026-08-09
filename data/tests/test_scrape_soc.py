"""Unit tests for SOC scrape thresholds."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "data"))

from scrape_soc import scrape_threshold  # noqa: E402


def test_summer_semester_uses_lower_threshold():
    assert scrape_threshold("M26") < scrape_threshold("F26")
    assert scrape_threshold("M25") < scrape_threshold("S26")


def test_fall_and_spring_share_default_threshold():
    assert scrape_threshold("F26") == scrape_threshold("S26")
