#!/usr/bin/env python3
"""
Update offered_qatar / offered_pitts flags in data/courses.json based on
a fresh scrape of the CMU Schedule of Classes.

Everything else in courses.json (descriptions, prerequisites, requirements,
units, etc.) is preserved untouched. Only the two campus flags get rewritten.

Logic:
  - Scrape every upcoming semester for both PIT and DOH locations.
  - For each course in courses.json, set:
      offered_pitts = True  if the course showed up in PIT in any semester
      offered_qatar = True  if the course showed up in DOH in any semester
      otherwise both = False
  - Courses not present in courses.json are ignored (we don't add new rows).

Run locally for testing:
    SOC_BASE_URL=http://localhost:5000/open/SOC/SOCServlet \
    python data/update_campus_flags.py

Run against real CMU (default):
    python data/update_campus_flags.py

Output: rewrites data/courses.json in place, plus prints a summary.
Exits non-zero on suspicious results (e.g. zero matches found) so the
GitHub Action fails loudly rather than silently zeroing out everyone's flags.
"""
import json
import os
import sys
import time
import re
import urllib.request
import urllib.parse
from datetime import datetime, timezone

# ---------- Configuration ----------
# Reuses the same env vars as scrape_soc.py so testing works the same way.

BASE = os.environ.get("SOC_BASE_URL", "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet")
SEARCH = BASE + "/search"
COURSES_PATH = os.environ.get("COURSES_JSON_PATH", "data/courses.json")

# Semesters to scrape. Match scrape_soc.py.
SEMESTERS_TO_TRY = ["M25", "F25", "S26", "M26", "F26"]

LOCATIONS = [
    ("PIT", "pitts"),   # field suffix used in courses.json: offered_pitts
    ("DOH", "qatar"),   # field suffix used in courses.json: offered_qatar
]

# Safety: if the scrape returns fewer than this many unique courses *total*
# across all semesters and campuses, abort instead of writing. Protects
# against the SOC being down and us zeroing everyone's flags to False.
MIN_COURSES_FOR_VALID_SCRAPE = int(os.environ.get("MIN_COURSES_FOR_VALID_SCRAPE", "100"))


# ---------- HTTP / parsing (same as scrape_soc.py) ----------

def fetch_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (countsfor-bot)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')


def fetch_post(params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(SEARCH, data=data,
                                 headers={'User-Agent': 'Mozilla/5.0 (countsfor-bot)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')


def parse_course_numbers(html):
    """Yield 5-digit course numbers from a SOC results page."""
    all_tds = re.findall(r'<td[^>]*>(.*?)</td>', html, re.DOTALL)
    for i in range(0, len(all_tds) - 9, 10):
        cell0 = re.sub(r'<[^>]+>', '', all_tds[i]).replace('&nbsp;', '').strip()
        if cell0 and cell0.isdigit() and len(cell0) == 5:
            yield cell0


def get_department_list():
    """Pull the dept dropdown; fall back to a small list if it fails."""
    try:
        form_html = fetch_get(SEARCH)
        dept_block = re.search(r'name="DEPT".*?</select>', form_html, re.DOTALL)
        if dept_block:
            depts = []
            for m in re.finditer(r'value="([A-Z]{2,5})"', dept_block.group()):
                code = m.group(1)
                if code != 'All':
                    depts.append(code)
            if depts:
                return depts
    except Exception as e:
        print(f"  WARN: couldn't fetch dept list: {e}")
    # Minimal fallback — same list as scrape_soc.py
    return ['ARC', 'ART', 'AEM', 'BXA', 'BSC', 'BME', 'BA', 'CFA', 'CIT', 'ISP',
            'CMU', 'CHE', 'CHM', 'CEE', 'CB', 'CS', 'DES', 'DC', 'DRA', 'ECO',
            'ECE', 'EPP', 'ENG', 'ETC', 'HIS', 'HCI', 'HSS', 'IDS', 'INI', 'IS',
            'IPS', 'ISR', 'LTI', 'MSE', 'MCS', 'MTH', 'ME', 'ML', 'MUS', 'NS',
            'NEU', 'PHI', 'PED', 'PHY', 'PSY', 'ROB', 'SCS', 'SDS', 'STA']


# ---------- Scrape: collect course-number sets per campus ----------

def scrape_offerings(depts):
    """
    Returns dict: { 'pitts': set('15122', ...), 'qatar': set('79465', ...) }
    Each set contains 5-digit course numbers offered at that campus in any
    semester in SEMESTERS_TO_TRY.
    """
    seen = {suffix: set() for _, suffix in LOCATIONS}

    total_calls = len(SEMESTERS_TO_TRY) * len(LOCATIONS) * len(depts)
    call_num = 0

    for sem in SEMESTERS_TO_TRY:
        for loc_code, suffix in LOCATIONS:
            for dept in depts:
                call_num += 1
                sys.stdout.write(
                    f"\r  [{call_num}/{total_calls}] {sem} {loc_code} {dept:<5}"
                )
                sys.stdout.flush()
                try:
                    html = fetch_post({
                        'SEMESTER': sem, 'MINI': 'NO', 'GRAD_UNDER': 'All',
                        'PRG_LOCATION': loc_code, 'DEPT': dept, 'COURSE': ''
                    })
                    for cnum in parse_course_numbers(html):
                        seen[suffix].add(cnum)
                except Exception as e:
                    print(f"\n  ERROR [{sem}/{loc_code}/{dept}]: {e}")
                time.sleep(0.15)
    print()
    return seen


# ---------- Update courses.json ----------

def code_to_5digit(course_code):
    """'79-465' -> '79465'. Returns None if format is unexpected."""
    if not isinstance(course_code, str):
        return None
    digits = course_code.replace('-', '')
    return digits if (len(digits) == 5 and digits.isdigit()) else None


def main():
    print(f"Update campus flags (BASE={BASE})")
    print("=" * 60)

    # Load existing courses.json
    if not os.path.exists(COURSES_PATH):
        print(f"ERROR: {COURSES_PATH} not found")
        sys.exit(1)
    with open(COURSES_PATH) as f:
        data = json.load(f)

    # The file might be a list of courses or {courses: [...]}. Handle both.
    if isinstance(data, list):
        courses_list = data
        wrapper = None
    elif isinstance(data, dict) and 'courses' in data:
        courses_list = data['courses']
        wrapper = data
    else:
        print(f"ERROR: unexpected shape in {COURSES_PATH}")
        sys.exit(1)

    print(f"Loaded {len(courses_list)} courses from {COURSES_PATH}")

    # Scrape
    depts = get_department_list()
    print(f"Departments: {len(depts)}")
    seen = scrape_offerings(depts)

    total_unique = len(seen['pitts'] | seen['qatar'])
    print(f"\n  Pittsburgh: {len(seen['pitts'])} course numbers")
    print(f"  Qatar:      {len(seen['qatar'])} course numbers")
    print(f"  Combined:   {total_unique} unique course numbers")

    # Safety check: if we got almost nothing, the SOC is probably down.
    # Refuse to write rather than zero out every flag in the file.
    if total_unique < MIN_COURSES_FOR_VALID_SCRAPE:
        print(f"\nScrape returned too few courses ({total_unique} < "
              f"{MIN_COURSES_FOR_VALID_SCRAPE}). Refusing to write — "
              f"the SOC may be down or the format may have changed.")
        sys.exit(1)

    # Update flags
    pitt_flipped = qatar_flipped = both_off = unchanged = unrecognized = 0

    for c in courses_list:
        code5 = code_to_5digit(c.get('course_code', ''))
        if not code5:
            unrecognized += 1
            continue

        old_pitts = c.get('offered_pitts')
        old_qatar = c.get('offered_qatar')
        new_pitts = code5 in seen['pitts']
        new_qatar = code5 in seen['qatar']

        c['offered_pitts'] = new_pitts
        c['offered_qatar'] = new_qatar

        if old_pitts == new_pitts and old_qatar == new_qatar:
            unchanged += 1
        else:
            if old_pitts != new_pitts:
                pitt_flipped += 1
            if old_qatar != new_qatar:
                qatar_flipped += 1
        if not new_pitts and not new_qatar:
            both_off += 1

    # Add a small audit trail so anyone wondering "why did this change"
    # can see when and how.
    audit = {
        'last_campus_flag_update': datetime.now(timezone.utc).isoformat(),
        'scrape_source': BASE,
        'semesters_considered': SEMESTERS_TO_TRY,
        'pitts_courses_found': len(seen['pitts']),
        'qatar_courses_found': len(seen['qatar']),
    }
    if wrapper is not None:
        wrapper.setdefault('_meta', {}).update(audit)

    # Write back
    with open(COURSES_PATH, 'w') as f:
        json.dump(wrapper if wrapper is not None else courses_list, f, indent=2)

    print(f"\n{'=' * 60}")
    print(f"  Wrote {COURSES_PATH}")
    print(f"  pitts flag changed:  {pitt_flipped}")
    print(f"  qatar flag changed:  {qatar_flipped}")
    print(f"  no change:           {unchanged}")
    print(f"  now both false:      {both_off}  (not offered any upcoming sem)")
    if unrecognized:
        print(f"  unrecognized codes:  {unrecognized}  (skipped)")


if __name__ == '__main__':
    main()