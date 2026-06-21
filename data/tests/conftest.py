"""Ensure data/ is on sys.path for soc_parse imports."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
