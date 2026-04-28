#!/usr/bin/env python3
"""
CMU Schedule of Classes (SOC) Scraper — Fall 2026
Fetches ALL courses from the SOC servlet, including delivery mode
(In-person / Online / Hybrid / Remote) that the PDF doesn't have.
"""
import urllib.request, urllib.parse, re, json, time, sys

BASE = "https://enr-apps.as.cmu.edu/open/SOC/SOCServlet"
SEARCH = BASE + "/search"
SEMESTER = "F26"

def fetch_get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')

def fetch_post(params):
    data = urllib.parse.urlencode(params).encode()
    req = urllib.request.Request(SEARCH, data=data, headers={'User-Agent': 'Mozilla/5.0'})
    return urllib.request.urlopen(req, timeout=60).read().decode('utf-8', errors='replace')

def parse_courses(html, dept_code, dept_name):
    """Parse courses by grouping every 10 <td> elements into a logical row."""
    courses = []
    all_tds = re.findall(r'<td[^>]*>(.*?)</td>', html, re.DOTALL)
    
    current_course = None
    for i in range(0, len(all_tds) - 9, 10):
        cells = [re.sub(r'<[^>]+>', '', t).replace('&nbsp;', '').strip() for t in all_tds[i:i+10]]
        cnum, title, units, sec = cells[0], cells[1], cells[2], cells[3]
        mini, days, begin, end = cells[4], cells[5], cells[6], cells[7]
        location, delivery = cells[8], cells[9]

        # New course row (has a 5-digit number + title)
        if cnum and cnum.isdigit() and len(cnum) == 5 and title:
            current_course = {
                'course_number': cnum, 'title': title, 'units': units,
                'department_code': dept_code, 'department': dept_name,
                'sections': []
            }
            courses.append(current_course)

        # Add section to current course
        if current_course and sec:
            current_course['sections'].append({
                'section': sec, 'mini': mini, 'days': days,
                'begin_time': begin, 'end_time': end,
                'location': location, 'delivery_mode': delivery
            })
    return courses

def main():
    print("CMU SOC Scraper — Fall 2026\n" + "=" * 50)

    # Step 1: Get dept list from form
    print("Fetching department list...")
    form_html = fetch_get(SEARCH)
    dept_list = []
    dept_block = re.search(r'name="DEPT".*?</select>', form_html, re.DOTALL)
    if dept_block:
        for m in re.finditer(r'value="([A-Z]{2,5})"[^>]*>(.*?)<', dept_block.group(), re.DOTALL):
            code, name = m.group(1), re.sub(r'\s+', ' ', m.group(2)).strip()
            name = re.sub(r'\s*\(\d+XXX\)\s*', '', name).strip()
            if code != 'All' and name:
                dept_list.append((code, name))
    
    if not dept_list:
        print("Using fallback department list...")
        dept_list = [
            ('ARC','Architecture'),('ART','Art'),('AEM','Arts & Entertainment Management'),
            ('BXA','BXA Intercollege Degree Programs'),('BSC','Biological Sciences'),
            ('BME','Biomedical Engineering'),('BA','Business Administration'),
            ('CFA','CFA Interdisciplinary'),('CIT','CIT Interdisciplinary'),
            ('ISP','Institute for Strategy and Tech'),('CMU','CMU University-Wide Studies'),
            ('CHE','Chemical Engineering'),('CHM','Chemistry'),
            ('CEE','Civil & Environmental Engineering'),('CB','Computational Biology'),
            ('CS','Computer Science'),('DES','Design'),('DC','Dietrich College Interdisciplinary'),
            ('DRA','Drama'),('ECO','Economics'),('ECE','Electrical & Computer Engineering'),
            ('EPP','Engineering & Public Policy'),('ENG','English'),
            ('ETC','Entertainment Technology Center'),('HIS','History'),
            ('HCI','Human-Computer Interaction'),('HSS','Humanities & Arts'),
            ('IDS','IDeATe'),('INI','Information Networking Institute'),
            ('IS','Information Systems'),('IPS','Institute for Politics and Strategy'),
            ('ISR','Institute for Software Research'),('LTI','Language Technologies Institute'),
            ('MSE','Materials Science & Engineering'),('MCS','MCS Interdisciplinary'),
            ('MTH','Mathematical Sciences'),('ME','Mechanical Engineering'),
            ('ML','Modern Languages'),('MUS','Music'),('NS','Naval Science'),
            ('NEU','Neuroscience'),('PHI','Philosophy'),('PED','Physical Education'),
            ('PHY','Physics'),('PSY','Psychology'),('ROB','Robotics'),
            ('SCS','SCS Interdisciplinary'),('SDS','Social & Decision Sciences'),
            ('STA','Statistics & Data Science'),
        ]

    print(f"  {len(dept_list)} departments found\n")

    all_courses = []
    dept_summary = []

    for i, (code, name) in enumerate(dept_list):
        pct = int((i+1)/len(dept_list)*100)
        sys.stdout.write(f"\r  [{i+1}/{len(dept_list)}] {pct}% — {name:<50}")
        sys.stdout.flush()
        try:
            html = fetch_post({
                'SEMESTER': SEMESTER, 'MINI': 'NO', 'GRAD_UNDER': 'All',
                'PRG_LOCATION': 'All', 'DEPT': code, 'COURSE': ''
            })
            courses = parse_courses(html, code, name)
            sec_count = sum(len(c['sections']) for c in courses)
            all_courses.extend(courses)
            dept_summary.append({'code': code, 'name': name, 'courses': len(courses), 'sections': sec_count})
        except Exception as e:
            print(f"\n  ✗ ERROR [{code}]: {e}")
            dept_summary.append({'code': code, 'name': name, 'courses': 0, 'sections': 0, 'error': str(e)})
        time.sleep(0.15)

    total_courses = len(all_courses)
    total_sections = sum(len(c['sections']) for c in all_courses)
    print(f"\n\n{'=' * 50}")
    print(f"  Departments: {len(dept_summary)}")
    print(f"  Courses:     {total_courses}")
    print(f"  Sections:    {total_sections}")

    output = {
        'metadata': {
            'source': 'Carnegie Mellon University — Schedule of Classes',
            'url': 'https://enr-apps.as.cmu.edu/open/SOC/SOCServlet',
            'semester': 'Fall 2026', 'semester_code': SEMESTER,
            'scrape_date': time.strftime('%Y-%m-%d %H:%M:%S'),
            'total_departments': len(dept_summary),
            'total_courses': total_courses,
            'total_sections': total_sections,
            'note': 'Includes delivery mode (In-person/Online/Hybrid/Remote) — not in the PDF version'
        },
        'department_summary': dept_summary,
        'courses': all_courses
    }

    outpath = 'soc_scraped_data.json'
    with open(outpath, 'w') as f:
        json.dump(output, f, indent=2)
    size_mb = len(json.dumps(output)) / (1024*1024)
    print(f"\n  Saved → {outpath} ({size_mb:.1f} MB)\n")

if __name__ == '__main__':
    main()
