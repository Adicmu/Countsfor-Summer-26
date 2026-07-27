# CountsFor — CMU-Q Curriculum Explorer

A role-aware curriculum explorer for Carnegie Mellon University in Qatar. Tell the app who you are once, then see only what matters for *your* degree path — your major, your minor, and the courses that fill **both** at the same time.

![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

**Live:** [adicmu.github.io/Countsfor-Summer-26](https://adicmu.github.io/Countsfor-Summer-26/) · **CMU-Q deployment:** [countsfor.qatar.cmu.edu](https://countsfor.qatar.cmu.edu) (CMU network only)

**Production deploy (Google SSO + User table):** see [`docs/DEPLOY_PRODUCTION.md`](docs/DEPLOY_PRODUCTION.md)

---

## What's new

The app now opens with a one-time onboarding splash that asks **who you are**. The rest of the UI tailors to your answer:

| Who you are | What you see |
|-------------|--------------|
| **Student** with major + minor | Two-program view (e.g. CS + BA) — double-counter courses get a banner and a `[BA]` tag in the tree |
| **Student** with major only | Single-program view — clean, no clutter |
| **Professor** in CS / IS / BA / BS | Single-program view focused on what you teach |
| **Professor** in Arts & Sciences (cross-program) | All four programs — same as Area Heads |
| **Area Head** | All four programs side-by-side |

Click the role badge in the navbar anytime to change your answer.

---

## Features

### Onboarding splash
- Full-screen CMU red gradient on first visit
- Step 1: pick **Student**, **Professor**, or **Area Head**
- Step 2: pick your program (and minor, if you're a student)
- Stored to localStorage — never asked again unless you click the role badge to edit

### Double-counter highlighting (focused-dual view)
When a course satisfies a requirement in **both** your major and your minor, the app flags it everywhere:
- A gradient banner on the course card: *"Counts for BOTH your CS major and BA minor"*
- A small color tag (e.g. `[BA]`) at the end of every matching row in the requirement tree
- The same tag in the search typeahead
- A dedicated **"N courses count for BOTH"** list view, one click from the home screen

### Multi-program chip (cross-program view)
Area heads and Arts & Sciences faculty see a `3 programs` / `4 programs` chip on courses that span many majors — useful for spotting cross-cutting GenEds.

### Search-first home
- Hero header + bold search box (≥1,727 CMU-Q courses indexed)
- Two role-colored cards showing your major and minor with course counts
- "Try a course" chips populated from your double-counters (or top required courses for single-program users)

### Course card (rebuilt)
- 32px course code, full course name, units pill, location & semester pills
- Big color-bordered **"Counts For"** rows you can click to jump into the requirement tree
- Prerequisites + Fall 2026 schedule side-by-side
- Full course description

### Requirement tree (rebuilt)
- 36px tap targets (no more squinting on mobile)
- Tabs filter to only the programs you care about
- Rule chips (`take all`, `≥19 units`, `pick 1`) and course counts per node
- Click any course in the tree to load its card

### Other
- 🌍 Location filter (Qatar / Pittsburgh / All)
- 🌙 Dark / light theme with localStorage persistence
- 📱 Mobile-responsive — onboarding stacks, role badge wraps, panels lens-toggle below 860px
- ⚡ **Zero dependencies** — no npm, no build step, no framework

---

## Quick Start

To browse the site as a guest you only need a way to serve static files:

```bash
git clone https://github.com/Adicmu/Countsfor-Summer-26.git
cd Countsfor-Summer-26
python3 -m http.server 8765
```

Open `http://localhost:8765`, the onboarding splash appears, you pick your role, you're in.

**Use port 8765.** The backend's CORS allow-list (`FRONTEND_ORIGIN`) only permits
`http://localhost:8765`. On any other port every API call is rejected by the
browser and the UI reports "could not reach the server", which looks like an
outage but is a local misconfiguration.

Windows: `py -m http.server 8765`. Or VS Code Live Server, `npx serve -p 8765`, or any other static server on that port.

### Running the backend locally

Guest mode needs no backend, but sign-in does. From the **repo root**:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp backend/.env.example backend/.env    # defaults to local SQLite
python -m backend.bootstrap_db          # create the tables once
python -m backend.app                   # http://localhost:5050
```

Run these from the repo root, not from `backend/`: the package uses relative
imports, so `python app.py` inside `backend/` fails to start.

A freshly bootstrapped database has no users, so **Create account** before trying
to sign in.

---

## Tests

The project ships with a tiny zero-dependency test runner:

```bash
python3 -m http.server 8080
# open http://localhost:8080/tests/test.html
```

You'll see a list of all unit tests with pass/fail status. Currently **26 tests** covering profile state, view-mode computation, validation, localStorage round-tripping, and double-counter / multi-program annotations.

---

## Project structure

```
.
├── index.html                  # Heritage landing (sign in / register)
├── app.html                    # Main app shell (after auth)
├── .nojekyll                   # Tells GitHub Pages: skip Jekyll, serve as-is
├── css/
│   ├── landing.css             # Heritage Single landing styles
│   └── styles.css              # Full design system — onboarding, role badge, course card v2, tree v2
├── js/
│   ├── landing.js              # Landing auth (sign in, register, forgot, reset)
│   ├── utils.js                # Debounce, HTML escaping, localStorage helpers, toast
│   ├── data.js                 # Tree builder, requirement parser, annotateDoubleCounters, annotateMultiProgram
│   ├── profile.js              # Profile state, localStorage, view-mode derivation, validation
│   ├── api.js                  # 3-tier data fetcher (live API → GitHub raw → bundled JSON)
│   └── app.js                  # App object — onboarding, shell, search, course card, tree
├── data/
│   ├── courses.json            # Bundled course data (1,727 courses)
│   ├── scrape_soc.py           # Python scraper for the CMU Schedule of Classes
│   └── soc_scraped_data.json   # Raw SOC scrape output
├── tests/
│   ├── test.html               # Test runner page
│   ├── test-runner.js          # Browser-native assertion helpers
│   ├── profile.test.js         # Tests for profile.js
│   └── data.test.js            # Tests for annotateDoubleCounters / annotateMultiProgram
└── docs/
    ├── superpowers/specs/      # Design specs (e.g. role-aware-onboarding-design.md)
    └── superpowers/plans/      # Implementation plans
```

Script load order in `app.html` matters:
```
utils.js → data.js → profile.js → api.js → app.js
```

---

## Architecture

### State
All state lives on a single `App` object literal — no framework, no store, no modules. The new `App.profile` field holds `{ role, primary, secondary }` and persists to three localStorage keys (`cf_role`, `cf_primary`, `cf_secondary`). View mode (`focused-dual` / `focused-single` / `cross-program`) is **derived** from the profile, not stored.

### View-mode dispatch
- `App.init()` reads the profile from localStorage. No profile → render onboarding splash. Has profile → render main shell.
- `App.renderShell()` filters the major tabs via `_visibleMajors()`.
- `App.renderLeftEmpty()` dispatches to `_renderEmptyDual()` / `_renderEmptySingle()` / `_renderEmptyCross()` based on the view mode.
- `App.renderCourseCard()` shows the double-counter banner when `course._doubleCounter === true` and the user has a minor.
- `App.renderTreeNode()` appends a secondary-program tag on leaf rows in focused-dual mode, and a `N programs` chip in cross-program mode.

### Annotations
After course data loads, two passes over `App.courses`:
- `annotateDoubleCounters(courses, profile)` — sets `_doubleCounter = true` on courses fulfilling both `profile.primary` and `profile.secondary`. Re-run on role edits.
- `annotateMultiProgram(courses)` — sets `_programCount = N` (count of non-empty `requirements` keys among CS/IS/BA/BS). Profile-independent.

### Data sources (priority order)
1. **Live CMU-Q API** — `https://countsfor.qatar.cmu.edu/api` (used when on the CMU-Q network)
2. **GitHub Raw JSON** — `open-cmuq/CountsFor` (fallback)
3. **Bundled local JSON** — `data/courses.json` (always works offline)

---

## Major color system

| Code | Major | Color |
|------|-------|-------|
| **CS** | Computer Science | 🔴 `#C41230` (CMU Red) |
| **IS** | Information Systems | 🟡 `#D97706` (Amber) |
| **BA** | Business Administration | 🔵 `#2563EB` (Blue) |
| **BS** | Biological Sciences | 🟢 `#059669` (Green) |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes — keep the zero-dependency constraint (no npm, no build step)
4. Run the test suite at `/tests/test.html` and add new tests for any pure functions
5. Push and open a Pull Request

Design and implementation docs live in `docs/superpowers/specs/` and `docs/superpowers/plans/` — useful reading before a substantial change.

---

## Credits

- Course and requirement data sourced from [open-cmuq/CountsFor](https://github.com/open-cmuq/CountsFor)
- Course descriptions scraped from [countsfor.qatar.cmu.edu](https://countsfor.qatar.cmu.edu)
- Built for CMU-Q students by [Aditya Vivek](https://github.com/Adicmu) and [Hind Jendara](https://github.com/HindJendara)

---

## License

MIT
