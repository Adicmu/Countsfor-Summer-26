#!/usr/bin/env python3
"""
CMU Schedule of Classes (SOC) Scraper
Runs daily via GitHub Actions. Tries upcoming semesters; writes data/soc.json
only when a real, non-empty scrape succeeds.

Output structure:
{
  "metadata": {...},
  "semesters": {
    "F26": { "courses": [...], "department_summary": [...], "scraped_at": "..." },
    "S27": { ... }
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

# BASE = "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet"
# SEARCH = BASE + "/search"

# # Semesters to attempt each run. Add new codes as years roll over.
# # Order: most relevant first. Format = <F|S|M><2-digit year>.

SEMESTERS_TO_TRY = ["F26", "S27", "M27", "F27", "S28"]

# # Safety threshold: if a semester returns fewer than this many courses,
# # we treat it as "not yet released" and don't overwrite existing data.
# MIN_COURSES_FOR_VALID_SCRAPE = 100

# OUTPUT_PATH = "data/soc.json"




# AFTER
BASE = os.environ.get("SOC_BASE_URL", "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet")
SEARCH = BASE + "/search"
MIN_COURSES_FOR_VALID_SCRAPE = int(os.environ.get("MIN_COURSES_FOR_VALID_SCRAPE", "100"))
OUTPUT_PATH = os.environ.get("SOC_OUTPUT_PATH", "data/soc.json")
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

    # Fallback list (from your original script)
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
    """Return (courses, dept_summary) or (None, None) if nothing/too little."""
    print(f"\n[{semester_code}] Scraping {len(dept_list)} departments...")
    all_courses = []
    dept_summary = []

    for i, (code, name) in enumerate(dept_list):
        sys.stdout.write(f"\r  [{i+1}/{len(dept_list)}] {code:<5} {name[:40]:<40}")
        sys.stdout.flush()
        try:
            html = fetch_post({
                'SEMESTER': semester_code, 'MINI': 'NO', 'GRAD_UNDER': 'All',
                'PRG_LOCATION': 'All', 'DEPT': code, 'COURSE': ''
            })
            courses = parse_courses(html, code, name)
            sec_count = sum(len(c['sections']) for c in courses)
            all_courses.extend(courses)
            dept_summary.append({'code': code, 'name': name,
                                 'courses': len(courses), 'sections': sec_count})
        except Exception as e:
            print(f"\n  ERROR [{code}]: {e}")
            dept_summary.append({'code': code, 'name': name,
                                 'courses': 0, 'sections': 0, 'error': str(e)})
        time.sleep(0.15)

    print(f"\n  → {len(all_courses)} courses, "
          f"{sum(len(c['sections']) for c in all_courses)} sections")

    if len(all_courses) < MIN_COURSES_FOR_VALID_SCRAPE:
        print(f"  Below threshold ({MIN_COURSES_FOR_VALID_SCRAPE}) — "
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
    print("CMU SOC Scraper\n" + "=" * 60)
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
            print(f"  ★ NEW semester detected: {sem}")

    existing['metadata'] = {
        'source': 'Carnegie Mellon University — Schedule of Classes',
        'url': BASE,
        'last_scrape': timestamp,
        'semesters_available': sorted(existing.get('semesters', {}).keys()),
        'note': 'Includes delivery mode — not in the PDF version',
    }

    if not existing.get('semesters'):
        print("\nNo valid data scraped. Aborting write.")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(existing, f, indent=2)

    size_mb = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\n{'=' * 60}")
    print(f"  Wrote {OUTPUT_PATH} ({size_mb:.1f} MB)")
    print(f"  Semesters: {', '.join(sorted(existing['semesters'].keys()))}")
    if new_semesters_seen:
        print(f"  NEW THIS RUN: {', '.join(new_semesters_seen)}")


if __name__ == '__main__':
    main()