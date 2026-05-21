#!/usr/bin/env python3
"""
CMU Schedule of Classes (SOC) Scraper
Runs daily via GitHub Actions. Tries upcoming semesters; writes data/soc.json
only when a real, non-empty scrape succeeds.

Scrapes each (semester, department) once per configured campus, then merges
courses that appear at multiple campuses. Each section is tagged with its
campus; each course's `campus` field lists every campus it runs at.

Output structure:
{
  "metadata": {...},
  "semesters": {
    "F26": {
      "courses": [
        {
          "course_number": "15122",
          "title": "Principles of Imperative Computation",
          "department_code": "CS",
          "department": "Computer Science",
          "units": "10",
          "campus": ["Pittsburgh", "Qatar"],
          "sections": [
            {"section": "1", "days": "MWF", ..., "campus": "Pittsburgh"},
            {"section": "A", "days": "MWF", ..., "campus": "Qatar"}
          ]
        }
      ],
      "department_summary": [...],
      "scraped_at": "..."
    }
  }
}
"""
import urllib.request
import urllib.parse
import urllib.error
import re
import json
import time
import sys
import os
from datetime import datetime, timezone

# ---------- Configuration ----------
# Overridable via env vars for local testing against the Flask test server.

BASE = os.environ.get("SOC_BASE_URL", "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet")
SEARCH = BASE + "/search"
MIN_COURSES_FOR_VALID_SCRAPE = int(os.environ.get("MIN_COURSES_FOR_VALID_SCRAPE", "100"))
OUTPUT_PATH = os.environ.get("SOC_OUTPUT_PATH", "data/soc.json")

# Semesters to attempt each run. Add new codes as years roll over.
# Order: most relevant first. Format = <F|S|M><2-digit year>.
SEMESTERS_TO_TRY = ["F26", "S27", "M27", "F27", "S28"]

# Campuses to scrape. Only courses offered at these locations will appear in
# soc.json. Codes come from the PRG_LOCATION dropdown on the SOC search form.
LOCATIONS_TO_SCRAPE = [
    ("PIT", "Pittsburgh"),
    ("DOH", "Qatar"),
]


# ---------- HTTP helpers ----------

def fetch_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (countsfor-bot)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')


def fetch_post(params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(SEARCH, data=data,
                                 headers={'User-Agent': 'Mozilla/5.0 (countsfor-bot)'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')


# ---------- Parsing ----------

def parse_courses(html, dept_code, dept_name):
    """Group every 10 <td> elements into a logical course/section row."""
    courses = []
    all_tds = re.findall(r'<td[^>]*>(.*?)</td>', html, re.DOTALL)

    current_course = None
    for i in range(0, len(all_tds) - 9, 10):
        cells = [re.sub(r'<[^>]+>', '', t).replace('&nbsp;', '').strip()
                 for t in all_tds[i:i + 10]]
        cnum, title, units, sec = cells[0], cells[1], cells[2], cells[3]
        mini, days, begin, end = cells[4], cells[5], cells[6], cells[7]
        location, delivery = cells[8], cells[9]

        if cnum and cnum.isdigit() and len(cnum) == 5 and title:
            current_course = {
                'course_number': cnum, 'title': title, 'units': units,
                'department_code': dept_code, 'department': dept_name,
                'sections': []
            }
            courses.append(current_course)

        if current_course and sec:
            current_course['sections'].append({
                'section': sec, 'mini': mini, 'days': days,
                'begin_time': begin, 'end_time': end,
                'location': location, 'delivery_mode': delivery
            })
    return courses


def get_department_list():
    """Pull the dept dropdown from the search form. Falls back to a hardcoded list."""
    try:
        form_html = fetch_get(SEARCH)
        dept_block = re.search(r'name="DEPT".*?</select>', form_html, re.DOTALL)
        if dept_block:
            dept_list = []
            for m in re.finditer(r'value="([A-Z]{2,5})"[^>]*>(.*?)<',
                                 dept_block.group(), re.DOTALL):
                code = m.group(1)
                name = re.sub(r'\s+', ' ', m.group(2)).strip()
                name = re.sub(r'\s*\(\d+XXX\)\s*', '', name).strip()
                if code != 'All' and name:
                    dept_list.append((code, name))
            if dept_list:
                return dept_list
    except Exception as e:
        print(f"  WARN: couldn't fetch dept list dynamically: {e}")

    # Fallback list
    return [
        ('ARC', 'Architecture'), ('ART', 'Art'), ('AEM', 'Arts & Entertainment Management'),
        ('BXA', 'BXA Intercollege Degree Programs'), ('BSC', 'Biological Sciences'),
        ('BME', 'Biomedical Engineering'), ('BA', 'Business Administration'),
        ('CFA', 'CFA Interdisciplinary'), ('CIT', 'CIT Interdisciplinary'),
        ('ISP', 'Institute for Strategy and Tech'), ('CMU', 'CMU University-Wide Studies'),
        ('CHE', 'Chemical Engineering'), ('CHM', 'Chemistry'),
        ('CEE', 'Civil & Environmental Engineering'), ('CB', 'Computational Biology'),
        ('CS', 'Computer Science'), ('DES', 'Design'), ('DC', 'Dietrich College Interdisciplinary'),
        ('DRA', 'Drama'), ('ECO', 'Economics'), ('ECE', 'Electrical & Computer Engineering'),
        ('EPP', 'Engineering & Public Policy'), ('ENG', 'English'),
        ('ETC', 'Entertainment Technology Center'), ('HIS', 'History'),
        ('HCI', 'Human-Computer Interaction'), ('HSS', 'Humanities & Arts'),
        ('IDS', 'IDeATe'), ('INI', 'Information Networking Institute'),
        ('IS', 'Information Systems'), ('IPS', 'Institute for Politics and Strategy'),
        ('ISR', 'Institute for Software Research'), ('LTI', 'Language Technologies Institute'),
        ('MSE', 'Materials Science & Engineering'), ('MCS', 'MCS Interdisciplinary'),
        ('MTH', 'Mathematical Sciences'), ('ME', 'Mechanical Engineering'),
        ('ML', 'Modern Languages'), ('MUS', 'Music'), ('NS', 'Naval Science'),
        ('NEU', 'Neuroscience'), ('PHI', 'Philosophy'), ('PED', 'Physical Education'),
        ('PHY', 'Physics'), ('PSY', 'Psychology'), ('ROB', 'Robotics'),
        ('SCS', 'SCS Interdisciplinary'), ('SDS', 'Social & Decision Sciences'),
        ('STA', 'Statistics & Data Science'),
    ]


# ---------- Main scrape per semester ----------

def scrape_semester(semester_code, dept_list):
    """
    For each (department, campus) pair, fetch the listing and parse it.
    Courses that appear at multiple campuses are merged into a single entry
    with `campus` as a list and sections tagged by campus.

    Returns (courses, dept_summary) or (None, None) if below threshold.
    """
    print(f"\n[{semester_code}] Scraping {len(dept_list)} depts "
          f"x {len(LOCATIONS_TO_SCRAPE)} campuses...")

    # (dept_code, course_number) -> merged course dict
    courses_by_key = {}
    dept_summary = []

    for i, (code, name) in enumerate(dept_list):
        sys.stdout.write(f"\r  [{i+1}/{len(dept_list)}] {code:<5} {name[:40]:<40}")
        sys.stdout.flush()

        dept_courses_seen = set()
        dept_section_count = 0
        dept_errors = []

        for loc_code, loc_name in LOCATIONS_TO_SCRAPE:
            try:
                html = fetch_post({
                    'SEMESTER': semester_code, 'MINI': 'NO', 'GRAD_UNDER': 'All',
                    'PRG_LOCATION': loc_code, 'DEPT': code, 'COURSE': ''
                })
                for c in parse_courses(html, code, name):
                    # Tag every section with its campus
                    for s in c['sections']:
                        s['campus'] = loc_name

                    key = (c['department_code'], c['course_number'])
                    if key in courses_by_key:
                        existing = courses_by_key[key]
                        if loc_name not in existing['campus']:
                            existing['campus'].append(loc_name)
                        existing['sections'].extend(c['sections'])
                    else:
                        c['campus'] = [loc_name]
                        courses_by_key[key] = c

                    dept_courses_seen.add(key)
                    dept_section_count += len(c['sections'])
            except Exception as e:
                dept_errors.append(f"{loc_code}: {e}")
                print(f"\n  ERROR [{code}/{loc_code}]: {e}")
            time.sleep(0.15)

        summary_entry = {
            'code': code, 'name': name,
            'courses': len(dept_courses_seen),
            'sections': dept_section_count,
        }
        if dept_errors:
            summary_entry['error'] = "; ".join(dept_errors)
        dept_summary.append(summary_entry)

    all_courses = list(courses_by_key.values())
    total_sections = sum(len(c['sections']) for c in all_courses)
    print(f"\n  -> {len(all_courses)} courses, {total_sections} sections")

    if len(all_courses) < MIN_COURSES_FOR_VALID_SCRAPE:
        print(f"  Below threshold ({MIN_COURSES_FOR_VALID_SCRAPE}) -- "
              f"treating as not-yet-released.")
        return None, None

    return all_courses, dept_summary


# ---------- Output assembly ----------

def load_existing():
    if os.path.exists(OUTPUT_PATH):
        try:
            with open(OUTPUT_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {'metadata': {}, 'semesters': {}}


def main():
    campus_names = ", ".join(name for _, name in LOCATIONS_TO_SCRAPE)
    print(f"CMU SOC Scraper (campuses: {campus_names})")
    print("=" * 60)

    dept_list = get_department_list()
    print(f"Departments: {len(dept_list)}")

    existing = load_existing()
    new_semesters_seen = []
    timestamp = datetime.now(timezone.utc).isoformat()

    for sem in SEMESTERS_TO_TRY:
        courses, summary = scrape_semester(sem, dept_list)
        if courses is None:
            continue

        was_new = sem not in existing.get('semesters', {})
        existing.setdefault('semesters', {})[sem] = {
            'courses': courses,
            'department_summary': summary,
            'scraped_at': timestamp,
            'total_courses': len(courses),
            'total_sections': sum(len(c['sections']) for c in courses),
        }
        if was_new:
            new_semesters_seen.append(sem)
            print(f"  * NEW semester detected: {sem}")

    existing['metadata'] = {
        'source': 'Carnegie Mellon University -- Schedule of Classes',
        'url': BASE,
        'last_scrape': timestamp,
        'semesters_available': sorted(existing.get('semesters', {}).keys()),
        'campuses': [name for _, name in LOCATIONS_TO_SCRAPE],
        'note': 'Courses are tagged by campus; sections also carry a campus field.',
    }

    if not existing.get('semesters'):
        print("\nNo valid data scraped. Aborting write.")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(existing, f, indent=2)

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\n{'=' * 60}")
    print(f"  Wrote {OUTPUT_PATH} ({size_mb:.2f} MB)")
    print(f"  Semesters: {', '.join(sorted(existing['semesters'].keys()))}")
    if new_semesters_seen:
        print(f"  NEW THIS RUN: {', '.join(new_semesters_seen)}")


if __name__ == '__main__':
    main()