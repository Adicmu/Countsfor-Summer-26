#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CODES = [
    "82-101", "82-102", "82-111", "82-112", "82-141", "82-142",
    "82-241", "82-242", "82-313", "82-314", "82-355", "82-411",
    "82-412", "82-414", "82-511", "82-512", "82-277", "79-286",
]

with open(ROOT / "data" / "courses.json", encoding="utf-8") as f:
    courses = json.load(f)["courses"]
by = {c["course_code"]: c for c in courses if c.get("course_code")}

for code in CODES:
    c = by.get(code)
    name = c.get("course_name", "MISSING") if c else "MISSING"
    print(f"--- {code} {name}")
    if not c:
        continue
    for major in ("IS", "BA", "BS", "CS"):
        for req in (c.get("requirements") or {}).get(major) or []:
            print(f"  {major}: {req.get('requirement')} | gened={req.get('type')}")
