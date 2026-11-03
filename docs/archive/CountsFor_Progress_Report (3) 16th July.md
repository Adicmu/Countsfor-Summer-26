## TL;DR 

- **Search — fixed & shipped (search-v2).** Semester filter removed from search; previously invisible courses (82-112) now discoverable.
- **Data pipeline — operational.** 3-tier source fallback, daily SOC scrape, automatic mapping overlays.
- **Search analytics — live.** Peer search counts power "Popular this semester."
- **Saved courses — live.** localStorage + server sync, full CRUD API.
- **Faculty tools — live.** Postgres-backed directory, course flags, student favorites roster.
- **Excel export — live.** Client-side, fully filter-aware.
- **UI/UX — live.** Unified search, requirement tree, resizable split view, mobile lens toggle.



## 1. What Was Fixed — The 82-111 / 82-112 Search Bug 

**The core data problem of this cycle.**

### Problem
Search applied the *full* filter stack, including the default semester (Fall 2026). A course appeared only if it had an offering matching **F26 + campus + modality**.

- **82-111 Elementary Arabic I** — has F26 sections (Qatar + Pittsburgh) → always found ✅
- **82-112 Elementary Arabic II** — no F26 sections (only S26, F25) → **invisible**, even when typing `82112` exactly 

### Fix (shipped as **search-v2**)
Search now uses a **separate, lighter filter profile** — discovery is decoupled from scheduling:

- **Search / typeahead** → campus  · modality · semester  *ignored*
- **Course card schedule** → all three filters apply
- **Requirement tree** → all three filters apply
- **Excel export** → all three filters apply


**Question** : Do we keep Semester filtering or not. From a student perspective, being able to search which course fulfill a requirement and in which semester is e
### Implementation
- `_searchFilterParams()` — builds campus + modality only (no `semesterCode`)
- `coursePassesSearchFilter()` — applies the lighter profile during search
- `_ensureExactCourseInResults()` — full course codes (`82112` → `82-112`) are **always pinned to the top**, even if campus/modality would exclude them

### Verified behavior
- `82112` and `82-112` both resolve to Elementary Arabic II ✅
- Both Arabic courses appear in general search ✅
- Course card with F26 selected correctly shows *"No matching sections for Fall 2026"* ✅
- Switching navbar semester to S26 reveals real sections ✅

> **Design principle established:** search *discovers the catalog*; filters *shape schedules and trees*.

---

## 2. Data Pipeline — Current State

### Course data sources (priority order)
1. **Bundled `data/courses.json`** — fast, works offline
2. **Live CMU-Q API** — fresh fallback
3. **GitHub raw** — last resort

### Scheduled data jobs
- **SOC scrape** — runs daily; `data/soc.json` feeds section schedules into course offerings
- **Mapping overlays** — `data/mapping_overlays.json` applied automatically during scrape via `.github/workflows/scrape.yml` (no manual DB edits)

### Recently updated mappings (via overlays)
- **82-101 – 82-142 (Modern Languages)** → mapped to IS/BA/BS/CS GenEd → *IS → Intercultural and Global Inquiry*
- **79-286 (Movers & Shakers)** → mapped to IS Contextual Thinking → *IS → Contextual Thinking*

These surface on the home screen as "Recently updated mappings" shortcuts — one click deep-links into the requirement tree.

---

## 3. Search Analytics — New Data Being Collected

Powers **"Popular this semester"** on the home screen.

**Data priority chain:**
1. Server aggregates — `GET /api/search-analytics/popular` (peer counts by program + semester)
2. Local counts — localStorage per program/semester (guest/demo)
3. Static fallback list — 15-122, 21-120, 36-200, 67-250, 82-112

**Collection mechanics:**
- Opening a course card → `_recordCourseSearch()`, debounced to once per 60s per course
- Signed-in students → `POST /api/search-analytics/events`
- Everyone → local count bump

**Context-aware subtitles:** real peer data → *"Top among CS students"* · authed but empty → *"be the first"* · guest → *"Suggested starter courses"*.

---

## 4. Persistent Data Stores (Backend)

- **Postgres `directory_entries`** — elevated-access roster (advisor, professor, area head, admin). **DB wins** over the static `faculty_directory.json` seed; all panel edits go to Postgres, never JSON.
- **Wishlist API** — saved courses + free-text notes. `GET/POST/PATCH/DELETE /api/wishlist`; localStorage synced on sign-in.
- **Search analytics** — course-open events, aggregated per program + semester.
- **Course flags** — 11-reason data-issue reports from faculty; local flags migrate to server on first sign-in.

**Role assignment is data-driven:** `resolve_directory_entry(email)` sets role/department/program at login. Admin is granted only via `role=admin` in the directory — never environment variables.

---

## 5. Feature Progress — What Shipped

### Home screen
- ✅ **Unified search** — courses (code/name/dept) + requirement categories in one typeahead, with example chips
- ✅ **Popular this semester** — top 5 peer-searched courses (analytics-driven)
- ✅ **GenEd chips** — one click opens the requirement tree at that node
- ✅ **Recently updated mappings** — deep links to overlay work
- ✅ **Home dock** — saved/flagged quick-access pills

### Course exploration
- ✅ **Course card** — About / Schedule / Counts For / Description / Actions; double-count banners (student) vs. cross-program grid (faculty); offering-prediction pills from historical patterns
- ✅ **Requirement tree** — expandable per major (CS/IS/BA/BS), filter-aware course counts, tree search, dual-lens for major+minor students
- ✅ **Panel resizer** — drag, arrow keys (16px / Shift 48px), double-click reset, width persisted in localStorage; mobile (<860px) uses a lens toggle instead

### Data export
- ✅ **Excel download** on every requirement node — `CountsFor_{major}_{requirement}.xls` with code, name, units, department, type, campuses, prereqs + export metadata; **fully client-side**, respects the full filter stack

### Faculty & admin
- ✅ **Directory panel** — view/add/edit/revoke elevated access
- ✅ **Course flags** — 11-reason modal; students see read-only badges; flag-review workflow for resolution
- ✅ **Student favorites** — `GET /api/wishlist/roster` groups all students' saved courses for advising

### Auth
- ✅ Google SSO + @andrew.cmu.edu email/password, guest mode (local-only), demo fallback when backend unreachable
- ✅ Auto role recognition from directory; student onboarding (role + major + optional minor)

---

## 6. Key Files

- **App logic & UI** — `js/app.js`
- **Filters, trees, mappings** — `js/data.js`
- **Backend API client** — `js/api.js`
- **Roles & permissions** — `js/profile.js`
- **Excel export** — `js/utils.js`
- **Search analytics API** — `backend/search_analytics.py`
- **Wishlist API** — `backend/wishlist.py`
- **Directory API** — `backend/directory.py`, `backend/directory_routes.py`
- **Course + mapping data** — `data/courses.json`, `data/mapping_overlays.json`

---

## 7. Takeaway

The cycle's defining change was **separating discovery from scheduling** in the data layer: search queries the whole catalog, while semester/campus/modality filters shape what schedules, trees, and exports show. Around that foundation, the data story is now end-to-end — daily SOC scrapes with automated mapping overlays feeding in, Postgres-backed directory/wishlist/flags/analytics persisting user activity, and filter-aware Excel exports flowing out.
