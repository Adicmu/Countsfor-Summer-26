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
import sys
from datetime import datetime, timezone

# Shared parsers live alongside this script.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from soc_parse import (  # noqa: E402
    apply_campus_fix,
    build_offering,
    course_number_to_code,
    semester_code_to_label,
)
from soc_departments import (  # noqa: E402
    SOC_LOCATION_CODES,
    get_department_list,
    get_semester_list,
    load_soc_form,
)

# ---------- Configuration ----------
BASE = os.environ.get("SOC_BASE_URL", "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet")
SEARCH = BASE + "/search"
MIN_COURSES_FOR_VALID_SCRAPE = int(os.environ.get("MIN_COURSES_FOR_VALID_SCRAPE", "100"))
# Summer (M-prefix) semesters list far fewer courses than fall/spring.
MIN_COURSES_FOR_SUMMER_SCRAPE = int(os.environ.get("MIN_COURSES_FOR_SUMMER_SCRAPE", "10"))


def scrape_threshold(semester_code: str) -> int:
    if semester_code and semester_code[0].upper() == "M":
        return MIN_COURSES_FOR_SUMMER_SCRAPE
    return MIN_COURSES_FOR_VALID_SCRAPE
OUTPUT_PATH = os.environ.get("SOC_OUTPUT_PATH", "data/soc.json")
LOCATIONS_TO_SCRAPE = SOC_LOCATION_CODES


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
    last_section = None
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
            last_section = None

        if not current_course:
            continue

        sec = (sec or '').strip()
        has_schedule = bool(days or begin or end)
        if sec:
            last_section = sec

        effective_sec = sec or last_section
        # SOC continuation rows leave section blank but repeat meeting times
        # for the same section (e.g. W meets MW and UT at different hours).
        if effective_sec and (sec or has_schedule):
            current_course['sections'].append({
                'section': effective_sec, 'mini': mini, 'days': days,
                'begin_time': begin, 'end_time': end,
                'location': location, 'delivery_mode': delivery
            })
    return courses


def get_department_list_for_scrape(form_html=None):
    return get_department_list(fetch_get, SEARCH, form_html=form_html)


def get_semester_list_for_scrape(form_html=None):
    return get_semester_list(fetch_get, SEARCH, form_html=form_html)


# ---------- Main scrape per semester ----------

def scrape_semester(semester_code, dept_list, min_courses=None):
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

    threshold = min_courses if min_courses is not None else scrape_threshold(semester_code)
    if len(all_courses) < threshold:
        print(f"  Below threshold ({threshold}) -- "
              f"treating as not-yet-released.")
        return None, None

    # Attach normalized per-semester offerings on each course.
    sem_label = semester_code_to_label(semester_code)
    for course in all_courses:
        offerings = []
        for section in course.get('sections') or []:
            off = build_offering(
                semester_code=semester_code,
                section=section,
                units=course.get('units'),
            )
            off['campus'] = apply_campus_fix(
                course.get('course_number', ''),
                course.get('title'),
                off.get('campus'),
            )
            offerings.append(off)
        course['offerings'] = offerings
        course['semester'] = sem_label
        course['semester_code'] = semester_code

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

    try:
        form_html, semester_list, dept_list = load_soc_form(fetch_get, SEARCH)
    except Exception as e:
        print(f"ERROR: could not load SOC search form: {e}")
        sys.exit(1)

    sem_codes = [code for code, _ in semester_list]
    print(f"Semesters from SOC form: {', '.join(f'{c} ({label})' for c, label in semester_list)}")
    print(f"Departments: {len(dept_list)}")

    timestamp = datetime.now(timezone.utc).isoformat()
    prior = load_existing()
    prior_semesters = prior.get("semesters") or {}
    scraped_semesters: dict = {}
    new_semesters_seen = []

    for sem_code, sem_label in semester_list:
        courses, summary = scrape_semester(sem_code, dept_list)
        if courses is None:
            if sem_code in prior_semesters:
                print(f"  Kept prior {sem_code} data from last successful scrape.")
                scraped_semesters[sem_code] = prior_semesters[sem_code]
            else:
                print(f"  Skipped {sem_code} — no schedule data yet.")
            continue

        scraped_semesters[sem_code] = {
            'courses': courses,
            'department_summary': summary,
            'scraped_at': timestamp,
            'semester_label': sem_label,
            'total_courses': len(courses),
            'total_sections': sum(len(c['sections']) for c in courses),
        }
        new_semesters_seen.append(sem_code)

    if not scraped_semesters:
        print("\nNo valid data scraped for any semester on the SOC form. Aborting write.")
        sys.exit(1)

    # Keep semesters from prior runs that are no longer on the SOC form.
    for sem_code, sem_data in prior_semesters.items():
        if sem_code not in scraped_semesters:
            scraped_semesters[sem_code] = sem_data

    existing = {
        'metadata': {},
        'semesters': scraped_semesters,
    }
    existing['metadata'] = {
        'source': 'Carnegie Mellon University -- Schedule of Classes',
        'url': SEARCH,
        'last_scrape': timestamp,
        'semesters_on_form': [{'code': c, 'label': l} for c, l in semester_list],
        'semesters_available': sorted(scraped_semesters.keys()),
        'campuses': [name for _, name in LOCATIONS_TO_SCRAPE],
        'note': 'Scraped every semester listed on the SOC form for Pittsburgh (PIT) and Qatar (DOH).',
    }

    os.makedirs(os.path.dirname(OUTPUT_PATH) or ".", exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(existing, f, indent=2)

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\n{'=' * 60}")
    print(f"  Wrote {OUTPUT_PATH} ({size_mb:.2f} MB)")
    print(f"  Semesters: {', '.join(sorted(existing['semesters'].keys()))}")
    if new_semesters_seen:
        print(f"  Scraped: {', '.join(new_semesters_seen)}")


if __name__ == '__main__':
    main()