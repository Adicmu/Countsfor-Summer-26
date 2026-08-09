# Role-Aware Onboarding & UI Density Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-time role-based onboarding flow that filters CountsFor's UI to show only the programs each user cares about, surface "double-counter" courses (those satisfying both a major and a minor), and redesign the course card and requirement tree with bigger/denser sizing.

**Architecture:** Profile state lives on the `App` object literal in vanilla JS, persisted to localStorage via three keys (`cf_role`, `cf_primary`, `cf_secondary`). View mode (`focused-dual` / `focused-single` / `cross-program`) is derived from the profile and dispatched at render time. Double-counter courses are pre-computed once after data load. Onboarding is a full-screen branded splash rendered into `#app` before the main shell. No build step; test runner is a self-contained HTML page using browser-native assertions.

**Tech Stack:** Vanilla JavaScript (ES6+), CSS3 (custom properties + Grid + Flexbox), zero npm dependencies. Existing load order (`utils.js → data.js → api.js → app.js`) extended to 5 files: `utils.js → data.js → profile.js → api.js → app.js`. Tests live in `tests/test.html` + companion `.test.js` files; run in any browser, no npm.

**Reference:** Design spec at `docs/superpowers/specs/2026-05-10-role-aware-onboarding-design.md`.

---

## File Structure

**New files:**
- `js/profile.js` — Profile state, localStorage persistence, view mode computation, validation
- `tests/test.html` — Self-contained zero-dependency test runner page
- `tests/test-runner.js` — Browser-native assertion helpers (`test()`, `assertEqual()`, etc.)
- `tests/profile.test.js` — Unit tests for `profile.js`
- `tests/data.test.js` — Unit tests for `annotateDoubleCounters` / `annotateMultiProgram`

**Modified files:**
- `index.html` — Add `<script src="js/profile.js">` in correct load order
- `js/data.js` — Add `annotateDoubleCounters(courses, profile)` and `annotateMultiProgram(courses)`
- `js/app.js` — `App.init()` profile bootstrap; `App.renderOnboarding()`; `App.renderShell()` becomes role-aware; `App.renderLeftEmpty()` rewritten per view mode; `App.renderCourseCard()` redesigned per Section 9; tree styles updated per Section 10; navbar gets role badge per Section 11
- `css/styles.css` — Add CSS for onboarding splash, role badge, empty-state-v2, course card v2, tree v2, double-counter banner, double-counter list view
- `.gitignore` — Already has `.superpowers/` (added during brainstorming)

---

## Phase A — Foundation: tests, profile module, double-counter logic

### Task 1: Create zero-dependency test runner

**Files:**
- Create: `tests/test.html`
- Create: `tests/test-runner.js`

- [ ] **Step 1: Create `tests/test.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>CountsFor Tests</title>
  <style>
    body { font-family: 'JetBrains Mono', monospace; padding: 20px; max-width: 900px; margin: 0 auto; background: #fff; color: #222; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    .test { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
    .pass { color: #059669; font-weight: 700; }
    .fail { color: #C41230; font-weight: 700; }
    pre { margin: 6px 0 0; padding: 8px; background: #fafafa; border-left: 3px solid #C41230; font-size: 12px; overflow-x: auto; white-space: pre-wrap; }
    .summary { margin-top: 16px; padding: 12px; background: #f5f5f5; border-radius: 6px; font-weight: 700; font-size: 14px; }
    .summary.fail-summary { background: #fdf2f4; color: #C41230; }
    .summary.pass-summary { background: #ecfdf5; color: #059669; }
  </style>
</head>
<body>
  <h1>CountsFor — Test Suite</h1>
  <div id="results"></div>
  <div id="summary" class="summary">running…</div>

  <!-- Source files (note: load order matches index.html) -->
  <script src="../js/utils.js"></script>
  <script src="../js/data.js"></script>
  <script src="../js/profile.js"></script>

  <!-- Test infrastructure + suites -->
  <script src="test-runner.js"></script>
  <script src="profile.test.js"></script>
  <script src="data.test.js"></script>
  <script>runAll();</script>
</body>
</html>
```

- [ ] **Step 2: Create `tests/test-runner.js`**

```js
const __tests = [];

function test(name, fn) {
  __tests.push({ name, fn });
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg ? msg + '\n' : '') + '  expected: ' + e + '\n  got:      ' + a);
  }
}

function assertTrue(v, msg) {
  if (!v) throw new Error(msg || 'expected truthy, got ' + JSON.stringify(v));
}

function assertFalse(v, msg) {
  if (v) throw new Error(msg || 'expected falsy, got ' + JSON.stringify(v));
}

function assertThrows(fn, msg) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  if (!threw) throw new Error(msg || 'expected function to throw');
}

function runAll() {
  const results = document.getElementById('results');
  const summary = document.getElementById('summary');
  let pass = 0, fail = 0;
  for (const t of __tests) {
    const div = document.createElement('div');
    div.className = 'test';
    try {
      t.fn();
      div.innerHTML = '<span class="pass">PASS</span> ' + t.name;
      pass++;
    } catch (e) {
      div.innerHTML = '<span class="fail">FAIL</span> ' + t.name + '<pre>' + e.message + '</pre>';
      fail++;
    }
    results.appendChild(div);
  }
  summary.textContent = pass + ' passed · ' + fail + ' failed';
  summary.className = 'summary ' + (fail === 0 ? 'pass-summary' : 'fail-summary');
}
```

- [ ] **Step 3: Stub `tests/profile.test.js` and `tests/data.test.js`**

Create empty placeholder files so `test.html` doesn't 404:

`tests/profile.test.js`:
```js
// Tests for profile.js — populated in later tasks
```

`tests/data.test.js`:
```js
// Tests for annotateDoubleCounters / annotateMultiProgram — populated in later tasks
```

- [ ] **Step 4: Verify the runner works (with no tests yet)**

From project root: `python3 -m http.server 8080`

Open: `http://localhost:8080/tests/test.html`

Expected: page loads, "0 passed · 0 failed" in summary, no console errors. (`profile.js` doesn't exist yet — Task 2 creates it. For now, comment out the `<script src="../js/profile.js">` line, OR create an empty `js/profile.js` so the script tag doesn't 404.)

Easier path: create `js/profile.js` as an empty file now.

```bash
touch js/profile.js
```

Reload the test page. Expected: "0 passed · 0 failed", no errors.

- [ ] **Step 5: Commit**

```bash
git add tests/test.html tests/test-runner.js tests/profile.test.js tests/data.test.js js/profile.js
git commit -m "test: add zero-dependency browser test runner"
```

---

### Task 2: Profile module — `validateProfile` and `computeViewMode` (TDD)

**Files:**
- Modify: `js/profile.js`
- Modify: `tests/profile.test.js`

- [ ] **Step 1: Write the failing tests for `computeViewMode`**

Replace `tests/profile.test.js` with:

```js
// ── computeViewMode ──────────────────────────────────────

test('computeViewMode: student with major + minor → focused-dual', () => {
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: 'BA' }),
    'focused-dual'
  );
});

test('computeViewMode: student with major, no minor → focused-single', () => {
  assertEqual(
    computeViewMode({ role: 'student', primary: 'CS', secondary: null }),
    'focused-single'
  );
});

test('computeViewMode: professor with CS → focused-single', () => {
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'CS', secondary: null }),
    'focused-single'
  );
});

test('computeViewMode: professor with AS (Arts & Sciences) → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'professor', primary: 'AS', secondary: null }),
    'cross-program'
  );
});

test('computeViewMode: area_head → cross-program', () => {
  assertEqual(
    computeViewMode({ role: 'area_head', primary: null, secondary: null }),
    'cross-program'
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Reload `http://localhost:8080/tests/test.html`.

Expected: 5 failures with `computeViewMode is not defined`.

- [ ] **Step 3: Implement `computeViewMode` in `js/profile.js`**

```js
// ============================================================
// CountsFor — Profile module
// State, persistence, and derivation for the user's role and
// program selections. Loaded after data.js, before api.js.
// ============================================================

const VALID_ROLES = ['student', 'professor', 'area_head'];
const VALID_PROGRAMS = ['CS', 'IS', 'BA', 'BS', 'AS'];
const STUDENT_PROGRAMS = ['CS', 'IS', 'BA', 'BS'];  // students never pick AS

function computeViewMode(profile) {
  if (!profile || !profile.role) return null;
  if (profile.role === 'area_head') return 'cross-program';
  if (profile.role === 'professor' && profile.primary === 'AS') return 'cross-program';
  if (profile.secondary && profile.secondary !== profile.primary) return 'focused-dual';
  return 'focused-single';
}
```

- [ ] **Step 4: Run tests, verify all 5 pass**

Reload test page. Expected: "5 passed · 0 failed".

- [ ] **Step 5: Write failing tests for `validateProfile`**

Append to `tests/profile.test.js`:

```js
// ── validateProfile ──────────────────────────────────────

test('validateProfile: complete student profile is valid', () => {
  assertTrue(validateProfile({ role: 'student', primary: 'CS', secondary: 'BA' }));
});

test('validateProfile: student with same major and minor → invalid', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'CS', secondary: 'CS' }));
});

test('validateProfile: invalid role → invalid', () => {
  assertFalse(validateProfile({ role: 'admin', primary: 'CS', secondary: null }));
});

test('validateProfile: invalid primary program → invalid', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'XX', secondary: null }));
});

test('validateProfile: student with primary=AS → invalid (AS only for profs)', () => {
  assertFalse(validateProfile({ role: 'student', primary: 'AS', secondary: null }));
});

test('validateProfile: area_head with no primary is valid', () => {
  assertTrue(validateProfile({ role: 'area_head', primary: null, secondary: null }));
});

test('validateProfile: null profile → invalid', () => {
  assertFalse(validateProfile(null));
});

test('validateProfile: missing role → invalid', () => {
  assertFalse(validateProfile({ primary: 'CS' }));
});
```

- [ ] **Step 6: Run tests, verify 8 new failures**

Reload. Expected: "5 passed · 8 failed", all failures say `validateProfile is not defined`.

- [ ] **Step 7: Implement `validateProfile`**

Append to `js/profile.js`:

```js
function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return false;
  if (!VALID_ROLES.includes(profile.role)) return false;

  if (profile.role === 'area_head') {
    return true;  // area heads have no program selection
  }

  if (profile.role === 'student') {
    if (!STUDENT_PROGRAMS.includes(profile.primary)) return false;
    if (profile.secondary && !STUDENT_PROGRAMS.includes(profile.secondary)) return false;
    if (profile.secondary === profile.primary) return false;
    return true;
  }

  if (profile.role === 'professor') {
    if (!VALID_PROGRAMS.includes(profile.primary)) return false;
    return true;  // profs have no minor
  }

  return false;
}
```

- [ ] **Step 8: Run tests, verify all 13 pass**

Reload. Expected: "13 passed · 0 failed".

- [ ] **Step 9: Commit**

```bash
git add js/profile.js tests/profile.test.js
git commit -m "feat(profile): add computeViewMode and validateProfile"
```

---

### Task 3: Profile persistence — `loadProfile`, `saveProfile`, `clearProfile`

**Files:**
- Modify: `js/profile.js`
- Modify: `tests/profile.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/profile.test.js`:

```js
// ── persistence ──────────────────────────────────────────

test('saveProfile then loadProfile round-trips a student', () => {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');

  saveProfile({ role: 'student', primary: 'CS', secondary: 'BA' });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'student');
  assertEqual(loaded.primary, 'CS');
  assertEqual(loaded.secondary, 'BA');
});

test('saveProfile then loadProfile for area_head (null primary/secondary)', () => {
  saveProfile({ role: 'area_head', primary: null, secondary: null });
  const loaded = loadProfile();
  assertEqual(loaded.role, 'area_head');
  assertEqual(loaded.primary, null);
  assertEqual(loaded.secondary, null);
});

test('loadProfile returns null when no role stored', () => {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');
  assertEqual(loadProfile(), null);
});

test('loadProfile returns null when stored profile is invalid', () => {
  localStorage.setItem('cf_role', 'admin');  // not a valid role
  localStorage.setItem('cf_primary', 'CS');
  localStorage.setItem('cf_secondary', '');
  assertEqual(loadProfile(), null);
});

test('clearProfile removes all three keys', () => {
  saveProfile({ role: 'student', primary: 'CS', secondary: 'BA' });
  clearProfile();
  assertEqual(localStorage.getItem('cf_role'), null);
  assertEqual(localStorage.getItem('cf_primary'), null);
  assertEqual(localStorage.getItem('cf_secondary'), null);
});
```

- [ ] **Step 2: Run tests, verify 5 new failures**

Reload. Expected: failures for `saveProfile`, `loadProfile`, `clearProfile` not defined.

- [ ] **Step 3: Implement persistence functions**

Append to `js/profile.js`:

```js
function saveProfile(profile) {
  if (!validateProfile(profile)) {
    throw new Error('saveProfile: profile failed validation');
  }
  localStorage.setItem('cf_role', profile.role);
  localStorage.setItem('cf_primary', profile.primary || '');
  localStorage.setItem('cf_secondary', profile.secondary || '');
}

function loadProfile() {
  const role = localStorage.getItem('cf_role');
  if (!role) return null;
  const primary = localStorage.getItem('cf_primary') || null;
  const secondary = localStorage.getItem('cf_secondary') || null;
  const profile = { role, primary: primary || null, secondary: secondary || null };
  if (!validateProfile(profile)) return null;
  return profile;
}

function clearProfile() {
  localStorage.removeItem('cf_role');
  localStorage.removeItem('cf_primary');
  localStorage.removeItem('cf_secondary');
}
```

- [ ] **Step 4: Run tests, verify all 18 pass**

Reload. Expected: "18 passed · 0 failed".

- [ ] **Step 5: Commit**

```bash
git add js/profile.js tests/profile.test.js
git commit -m "feat(profile): add localStorage persistence helpers"
```

---

### Task 4: Wire `profile.js` into `index.html`

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add the `<script>` tag in correct load order**

In `index.html`, between the `data.js` and `api.js` script tags:

```html
  <script src="js/utils.js"></script>
  <script src="js/data.js"></script>
  <script src="js/profile.js"></script>
  <script src="js/api.js"></script>
  <script src="js/app.js"></script>
```

- [ ] **Step 2: Verify the main app still loads**

From project root: `python3 -m http.server 8080`

Open: `http://localhost:8080/`

Expected: app loads normally (you should still see the search-first home view from before this work). No 404s in the console. Profile functions are now globally available — verify in DevTools console:

```js
typeof loadProfile  // should print "function"
typeof saveProfile  // should print "function"
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: load profile.js between data.js and api.js"
```

---

### Task 5: Add `annotateDoubleCounters` to `data.js` (TDD)

**Files:**
- Modify: `js/data.js`
- Modify: `tests/data.test.js`

- [ ] **Step 1: Write failing tests**

Replace `tests/data.test.js` with:

```js
// ── annotateDoubleCounters ───────────────────────────────

function makeCourse(code, requirementsByMajor) {
  const requirements = {};
  for (const m of Object.keys(requirementsByMajor)) {
    requirements[m] = requirementsByMajor[m].map(r => ({ requirement: r, type: false }));
  }
  return { course_code: code, course_name: code, requirements };
}

test('annotateDoubleCounters: focused-dual marks courses fulfilling both programs', () => {
  const courses = [
    makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] }),  // double-counter
    makeCourse('21-127', { CS: ['CS---Math'] }),                       // CS only
    makeCourse('70-311', { BA: ['BA---Core'] }),                       // BA only
  ];
  const profile = { role: 'student', primary: 'CS', secondary: 'BA' };

  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, true);
  assertEqual(courses[1]._doubleCounter, false);
  assertEqual(courses[2]._doubleCounter, false);
});

test('annotateDoubleCounters: focused-single clears any prior annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;  // simulate stale annotation

  const profile = { role: 'student', primary: 'CS', secondary: null };
  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: cross-program clears annotations', () => {
  const courses = [makeCourse('15-122', { CS: ['CS---Core'], BA: ['BA---Tech'] })];
  courses[0]._doubleCounter = true;

  const profile = { role: 'area_head', primary: null, secondary: null };
  annotateDoubleCounters(courses, profile);

  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: empty requirements arrays do not count', () => {
  const courses = [
    { course_code: '15-122', requirements: { CS: [], BA: [] } },
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' });
  assertEqual(courses[0]._doubleCounter, false);
});

test('annotateDoubleCounters: course with missing requirements key does not crash', () => {
  const courses = [
    { course_code: '15-122' },  // no requirements at all
  ];
  annotateDoubleCounters(courses, { role: 'student', primary: 'CS', secondary: 'BA' });
  assertEqual(courses[0]._doubleCounter, false);
});
```

- [ ] **Step 2: Run tests, verify 5 new failures**

Reload `tests/test.html`. Expected: failures saying `annotateDoubleCounters is not defined`.

- [ ] **Step 3: Implement `annotateDoubleCounters` in `js/data.js`**

Append to `js/data.js` (at the bottom of the file, after `getDeptName`):

```js
// ── Profile-aware annotations ────────────────────────────

function annotateDoubleCounters(courses, profile) {
  const viewMode = computeViewMode(profile);
  if (viewMode !== 'focused-dual') {
    // Clear any stale annotations from a previous profile
    for (const c of courses) c._doubleCounter = false;
    return;
  }
  const p = profile.primary;
  const s = profile.secondary;
  for (const c of courses) {
    const req = c.requirements || {};
    const hasPrimary = Array.isArray(req[p]) && req[p].length > 0;
    const hasSecondary = Array.isArray(req[s]) && req[s].length > 0;
    c._doubleCounter = hasPrimary && hasSecondary;
  }
}
```

- [ ] **Step 4: Run tests, verify all pass**

Reload. Expected: "23 passed · 0 failed".

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.js
git commit -m "feat(data): add annotateDoubleCounters for major+minor profiles"
```

---

### Task 6: Add `annotateMultiProgram` to `data.js` (TDD)

**Files:**
- Modify: `js/data.js`
- Modify: `tests/data.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/data.test.js`:

```js
// ── annotateMultiProgram ─────────────────────────────────

test('annotateMultiProgram: counts non-empty program keys', () => {
  const courses = [
    makeCourse('15-122', { CS: ['x'], IS: ['x'], BA: ['x'] }),  // 3 programs
    makeCourse('21-127', { CS: ['x'] }),                          // 1 program
    makeCourse('76-101', { CS: ['x'], IS: ['x'], BA: ['x'], BS: ['x'] }),  // 4
  ];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 3);
  assertEqual(courses[1]._programCount, 1);
  assertEqual(courses[2]._programCount, 4);
});

test('annotateMultiProgram: empty arrays do not count', () => {
  const courses = [
    { course_code: '15-122', requirements: { CS: ['x'], IS: [], BA: [] } },
  ];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 1);
});

test('annotateMultiProgram: missing requirements → 0', () => {
  const courses = [{ course_code: '15-122' }];
  annotateMultiProgram(courses);
  assertEqual(courses[0]._programCount, 0);
});
```

- [ ] **Step 2: Run tests, verify 3 new failures**

Reload. Expected failures: `annotateMultiProgram is not defined`.

- [ ] **Step 3: Implement `annotateMultiProgram`**

Append to `js/data.js`:

```js
function annotateMultiProgram(courses) {
  const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
  for (const c of courses) {
    const req = c.requirements || {};
    let n = 0;
    for (const p of PROGRAMS) {
      if (Array.isArray(req[p]) && req[p].length > 0) n++;
    }
    c._programCount = n;
  }
}
```

- [ ] **Step 4: Run tests, verify all 26 pass**

Reload. Expected: "26 passed · 0 failed".

- [ ] **Step 5: Commit**

```bash
git add js/data.js tests/data.test.js
git commit -m "feat(data): add annotateMultiProgram for cross-program badge"
```

---

### Task 7: Wire annotations into `App.loadData()`

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add a `profile` field to `App` state**

In `js/app.js`, find the `App` object literal opening (around line 5). Add `profile: null,` after the existing state fields:

```js
const App = {
  // State
  courses: [],
  courseIndex: {},
  trees: {},
  treeSections: {},

  layoutMode: 'focused',
  activeMajor: 'CS',
  selectedCourse: null,
  treeSearchQuery: '',
  locationFilter: 'all',
  theme: loadStore('cf_theme', 'light'),
  expandedNodes: new Set(),
  highlightedPath: null,
  mobileLens: 'lookup',

  profile: null,
  // ... rest unchanged
```

- [ ] **Step 2: Modify `loadData()` to call annotations**

Find `App.loadData()` (around line 43). After `this.courseIndex = buildCourseIndex(this.courses);`, add:

```js
      this.courses = await fetchAllCourses();
      this.courseIndex = buildCourseIndex(this.courses);

      // Profile-aware annotations
      annotateDoubleCounters(this.courses, this.profile);
      annotateMultiProgram(this.courses);

      // Build trees for each major
```

- [ ] **Step 3: Verify the app still loads**

From project root: `python3 -m http.server 8080`

Open: `http://localhost:8080/`

In DevTools console after data loads:
```js
App.courses[0]._programCount  // should be a number 0–4
App.courses[0]._doubleCounter // should be false (no profile yet)
```

Expected: numbers, no errors. The app behaves identically to before — the annotations are computed but unused so far.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(app): annotate courses with double-counter and program-count after load"
```

---

## Phase B — Onboarding splash UI

### Task 8: CSS foundation for onboarding splash

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append onboarding splash CSS at the end of `styles.css`**

```css
/* ════════════════════════════════════════════════════════════
   Onboarding Splash
   ════════════════════════════════════════════════════════════ */

.onboarding-splash {
  position: fixed;
  inset: 0;
  background: linear-gradient(135deg, #C41230 0%, #7a0a1d 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 100;
  overflow-y: auto;
}

.onboarding-card {
  width: 100%;
  max-width: 600px;
  padding: 32px 28px;
  text-align: center;
  color: #fff;
}

.onboarding-brand {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -1px;
  margin-bottom: 4px;
}

.onboarding-brand-sub {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 28px;
}

.onboarding-step-label {
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 6px;
}

.onboarding-question {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 6px;
  letter-spacing: -0.3px;
}

.onboarding-help {
  font-size: 13px;
  opacity: 0.85;
  margin-bottom: 24px;
}

.onboarding-options {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}

.onboarding-options.options-2col { grid-template-columns: 1fr 1fr; }
.onboarding-options.options-stacked { grid-template-columns: 1fr; }

.onboarding-option {
  background: rgba(255, 255, 255, 0.12);
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  padding: 18px 12px;
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: background 120ms ease, transform 80ms ease;
  text-align: center;
}

.onboarding-option:hover {
  background: rgba(255, 255, 255, 0.22);
}

.onboarding-option.selected {
  background: #fff;
  color: #C41230;
  border-color: #fff;
}

.onboarding-option .opt-sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  opacity: 0.85;
  margin-top: 4px;
}

.onboarding-option.selected .opt-sub { opacity: 0.7; }

.onboarding-option:disabled,
.onboarding-option[aria-disabled="true"] {
  opacity: 0.35;
  cursor: not-allowed;
}

.onboarding-section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  opacity: 0.85;
  margin: 18px 0 8px;
  text-align: left;
}

.onboarding-section-label .opt-note {
  font-weight: 400;
  opacity: 0.65;
  margin-left: 4px;
}

.onboarding-continue {
  background: #fff;
  color: #222;
  border: none;
  border-radius: 10px;
  padding: 13px 28px;
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  margin-top: 8px;
  transition: opacity 120ms ease;
}

.onboarding-continue:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.onboarding-cancel {
  position: absolute;
  bottom: 24px;
  right: 24px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  background: none;
  border: none;
  font-family: inherit;
}

.onboarding-cancel:hover { color: #fff; }

@media (max-width: 860px) {
  .onboarding-options { grid-template-columns: 1fr; }
  .onboarding-options.options-2col { grid-template-columns: 1fr; }
  .onboarding-card { padding: 24px 18px; }
  .onboarding-question { font-size: 20px; }
}
```

- [ ] **Step 2: Verify CSS file still parses**

Open: `http://localhost:8080/`

Expected: app still loads. (No visual change yet — these classes aren't used.)

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: add onboarding splash CSS scaffolding"
```

---

### Task 9: Implement `App.renderOnboarding()` — Step 1 (role)

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add the onboarding state and method to `App`**

Find `App.renderShell()` in `js/app.js` (around line 80). Just **before** it, insert:

```js
  // ══════════════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════════════

  _onboardingState: {
    step: 'role',          // 'role' | 'student-program' | 'professor-program'
    role: null,            // 'student' | 'professor' | 'area_head'
    primary: null,
    secondary: null,
    isEdit: false,         // true when re-entering from navbar role badge
  },

  renderOnboarding(isEdit) {
    // Initialize state — pre-fill from current profile if editing
    this._onboardingState = {
      step: 'role',
      role: this.profile ? this.profile.role : null,
      primary: this.profile ? this.profile.primary : null,
      secondary: this.profile ? this.profile.secondary : null,
      isEdit: !!isEdit,
    };
    this._renderOnboardingStep();
  },

  _renderOnboardingStep() {
    const s = this._onboardingState;
    const cancelHtml = s.isEdit
      ? '<button class="onboarding-cancel" onclick="App._cancelOnboarding()">Cancel</button>'
      : '';

    let stepHtml = '';
    if (s.step === 'role') {
      stepHtml = this._renderOnboardingRole();
    } else if (s.step === 'student-program') {
      stepHtml = this._renderOnboardingStudentProgram();
    } else if (s.step === 'professor-program') {
      stepHtml = this._renderOnboardingProfessorProgram();
    }

    document.getElementById('app').innerHTML = `
      <div class="onboarding-splash">
        <div class="onboarding-card">
          <div class="onboarding-brand">CountsFor</div>
          <div class="onboarding-brand-sub">CMU-Q Curriculum Explorer</div>
          ${stepHtml}
        </div>
        ${cancelHtml}
      </div>
    `;
  },

  _renderOnboardingRole() {
    const s = this._onboardingState;
    const sel = (r) => s.role === r ? 'selected' : '';
    return `
      <div class="onboarding-step-label">Step 1 of 2</div>
      <div class="onboarding-question">Who are you?</div>
      <div class="onboarding-help">We'll only show what matters to your role.</div>
      <div class="onboarding-options">
        <button class="onboarding-option ${sel('student')}" onclick="App._pickRole('student')">Student</button>
        <button class="onboarding-option ${sel('professor')}" onclick="App._pickRole('professor')">Professor</button>
        <button class="onboarding-option ${sel('area_head')}" onclick="App._pickRole('area_head')">Area Head</button>
      </div>
    `;
  },

  _pickRole(role) {
    this._onboardingState.role = role;
    if (role === 'area_head') {
      this._onboardingState.primary = null;
      this._onboardingState.secondary = null;
      this._finishOnboarding();
      return;
    }
    if (role === 'student') this._onboardingState.step = 'student-program';
    if (role === 'professor') this._onboardingState.step = 'professor-program';
    this._renderOnboardingStep();
  },

  _renderOnboardingStudentProgram() {
    // Stub — implemented in Task 10
    return '<div>(student program picker — coming in Task 10)</div>';
  },

  _renderOnboardingProfessorProgram() {
    // Stub — implemented in Task 11
    return '<div>(professor program picker — coming in Task 11)</div>';
  },

  _finishOnboarding() {
    // Stub — implemented in Task 12
    console.log('finish onboarding', this._onboardingState);
  },

  _cancelOnboarding() {
    // Stub — implemented in Task 12
    console.log('cancel onboarding');
  },
```

- [ ] **Step 2: Wire onboarding into `App.init()`**

Find `App.init()` (around line 23). Replace its body with:

```js
  async init() {
    this.applyTheme();
    this.profile = loadProfile();
    if (!this.profile) {
      this.renderOnboarding(false);
      return;
    }
    this.renderShell();
    this.bindGlobalEvents();
    await this.loadData();
  },
```

- [ ] **Step 3: Manually verify Step 1 renders**

From project root: `python3 -m http.server 8080`

In DevTools console first clear any stored profile:
```js
localStorage.removeItem('cf_role');
localStorage.removeItem('cf_primary');
localStorage.removeItem('cf_secondary');
```

Reload `http://localhost:8080/`.

Expected:
- Full-screen CMU red gradient covers the viewport
- "CountsFor" title + "CMU-Q Curriculum Explorer" subtitle
- "Step 1 of 2"
- "Who are you?" question
- Three button options: Student / Professor / Area Head
- No emojis on the buttons
- Clicking "Student" advances to a placeholder "(student program picker — coming in Task 10)"
- Clicking "Professor" advances to a placeholder
- Clicking "Area Head" logs `'finish onboarding'` in the console (no advance — handled in Task 12)

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(onboarding): render step 1 role picker on first visit"
```

---

### Task 10: Onboarding Step 2 — Student program picker

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Replace the student stub**

In `js/app.js`, find `_renderOnboardingStudentProgram()` and replace its body:

```js
  _renderOnboardingStudentProgram() {
    const s = this._onboardingState;
    const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
    const majorSel = (m) => s.primary === m ? 'selected' : '';
    const minorSel = (m) => s.secondary === m ? 'selected' : '';
    const minorDisabled = (m) => s.primary === m ? 'aria-disabled="true" disabled' : '';
    const continueDisabled = !s.primary;

    return `
      <div class="onboarding-step-label">Step 2 of 2</div>
      <div class="onboarding-question">What's your program?</div>

      <div class="onboarding-section-label">MAJOR</div>
      <div class="onboarding-options options-2col" style="grid-template-columns:repeat(4,1fr)">
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${majorSel(p)}" onclick="App._pickStudentMajor('${p}')">${p}</button>
        `).join('')}
      </div>

      <div class="onboarding-section-label">MINOR <span class="opt-note">— optional</span></div>
      <div class="onboarding-options" style="grid-template-columns:repeat(5,1fr)">
        <button class="onboarding-option ${s.secondary === null ? 'selected' : ''}" onclick="App._pickStudentMinor(null)">None</button>
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${minorSel(p)}" ${minorDisabled(p)} onclick="App._pickStudentMinor('${p}')">${p}</button>
        `).join('')}
      </div>

      <button class="onboarding-continue" ${continueDisabled ? 'disabled' : ''} onclick="App._finishOnboarding()">Continue →</button>
    `;
  },

  _pickStudentMajor(program) {
    this._onboardingState.primary = program;
    // If selected major equals current minor, clear minor
    if (this._onboardingState.secondary === program) {
      this._onboardingState.secondary = null;
    }
    this._renderOnboardingStep();
  },

  _pickStudentMinor(program) {
    this._onboardingState.secondary = program;
    this._renderOnboardingStep();
  },
```

- [ ] **Step 2: Manually verify**

Reload `http://localhost:8080/` (with profile cleared).

Click "Student" on step 1. Expected:
- "Step 2 of 2"
- "What's your program?"
- "MAJOR" label + 4 buttons (CS, IS, BA, BS)
- "MINOR — optional" label + 5 buttons (None, CS, IS, BA, BS)
- "Continue →" button is grey/disabled
- Clicking CS in major row highlights it. Continue enables.
- The CS button in the *minor* row becomes faded/disabled (can't pick yourself as minor).
- Clicking BA in minor highlights it.
- If you then change major to BA, the minor BA selection clears (since it would self-select).
- Clicking "Continue" logs `finish onboarding {role:'student',primary:'CS',secondary:'BA'}` in console.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(onboarding): student step 2 — major + optional minor on one screen"
```

---

### Task 11: Onboarding Step 2 — Professor program picker

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Replace the professor stub**

In `js/app.js`, replace `_renderOnboardingProfessorProgram()`:

```js
  _renderOnboardingProfessorProgram() {
    const s = this._onboardingState;
    const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
    const sel = (p) => s.primary === p ? 'selected' : '';
    const continueDisabled = !s.primary;

    return `
      <div class="onboarding-step-label">Step 2 of 2</div>
      <div class="onboarding-question">Which program do you teach in?</div>

      <div class="onboarding-options" style="grid-template-columns:repeat(4,1fr);margin-bottom:10px">
        ${PROGRAMS.map(p => `
          <button class="onboarding-option ${sel(p)}" onclick="App._pickProfProgram('${p}')">${p}</button>
        `).join('')}
      </div>

      <div class="onboarding-options options-stacked">
        <button class="onboarding-option ${sel('AS')}" onclick="App._pickProfProgram('AS')">
          Arts &amp; Sciences (Cross-program)
          <span class="opt-sub">I teach courses that apply across all programs</span>
        </button>
      </div>

      <button class="onboarding-continue" ${continueDisabled ? 'disabled' : ''} onclick="App._finishOnboarding()">Continue →</button>
    `;
  },

  _pickProfProgram(program) {
    this._onboardingState.primary = program;
    this._onboardingState.secondary = null;
    this._renderOnboardingStep();
  },
```

- [ ] **Step 2: Manually verify**

Reload (profile still cleared). Click "Professor" on step 1.

Expected:
- "Step 2 of 2 — Which program do you teach in?"
- A row of 4 buttons (CS, IS, BA, BS)
- Below that, a single wide button: "Arts & Sciences (Cross-program)" with subtext "I teach courses that apply across all programs"
- "Continue →" disabled until something is picked
- Picking CS / IS / BA / BS highlights it; "Continue" enables.
- Picking the Arts & Sciences button highlights it.
- Clicking "Continue" logs the right state in console.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(onboarding): professor step 2 — programs + Arts & Sciences option"
```

---

### Task 12: Implement `_finishOnboarding()` and `_cancelOnboarding()`

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Replace `_finishOnboarding` stub**

In `js/app.js`, replace `_finishOnboarding()` and `_cancelOnboarding()` with:

```js
  _finishOnboarding() {
    const s = this._onboardingState;
    const profile = {
      role: s.role,
      primary: s.primary,
      secondary: s.secondary,
    };
    if (!validateProfile(profile)) {
      console.error('invalid profile, refusing to save', profile);
      return;
    }
    saveProfile(profile);
    const wasEdit = s.isEdit;
    this.profile = profile;

    // Render the main app
    this.renderShell();
    this.bindGlobalEvents();

    if (wasEdit) {
      // Re-annotate using the new profile, then re-render whatever's visible
      annotateDoubleCounters(this.courses, this.profile);
      this.renderLeftEmpty();
      this.renderTree();
    } else {
      this.loadData();
    }
  },

  _cancelOnboarding() {
    if (!this._onboardingState.isEdit) return;  // not allowed during first-run
    this.renderShell();
    this.bindGlobalEvents();
    this.renderLeftEmpty();
    this.renderTree();
  },
```

- [ ] **Step 2: Manually verify the full first-run flow**

In DevTools console, clear profile:
```js
localStorage.clear();
location.reload();
```

Onboarding splash should appear. Click `Student → CS major → BA minor → Continue`.

Expected:
- Splash disappears
- Main app shell renders (you'll see the existing search-first home with all four tabs — role-aware filtering comes in later tasks)
- DevTools console: `localStorage.cf_role === 'student'`, `cf_primary === 'CS'`, `cf_secondary === 'BA'`
- `App.profile` shows the saved profile

- [ ] **Step 3: Verify reload doesn't re-onboard**

Reload the page. The onboarding splash should NOT appear; main app loads directly.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(onboarding): persist profile, advance to main shell after Continue"
```

---

## Phase C — Role badge & navbar

### Task 13: CSS for the role badge

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append role badge CSS**

```css
/* ════════════════════════════════════════════════════════════
   Role Badge (navbar)
   ════════════════════════════════════════════════════════════ */

.role-badge {
  display: inline-flex;
  align-items: center;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0;
  margin-left: 12px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 120ms ease;
  font-family: inherit;
}

.role-badge:hover {
  border-color: var(--text-secondary);
}

.role-badge .rb-segment {
  padding: 6px 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.role-badge .rb-divider {
  width: 1px;
  align-self: stretch;
  background: var(--border);
}

.role-badge.rb-cs   .rb-primary { background: var(--major-cs-bg); color: var(--major-cs); }
.role-badge.rb-is   .rb-primary { background: var(--major-is-bg); color: var(--major-is); }
.role-badge.rb-ba   .rb-primary { background: var(--major-ba-bg); color: var(--major-ba); }
.role-badge.rb-bs   .rb-primary { background: var(--major-bs-bg); color: var(--major-bs); }
.role-badge.rb-as   .rb-primary { background: var(--bg-tertiary); color: var(--text-secondary); }
.role-badge.rb-ah   .rb-primary { background: var(--bg-tertiary); color: var(--text-secondary); }

.role-badge.rb-cs-ba .rb-secondary { background: var(--major-ba-bg); color: var(--major-ba); }
.role-badge.rb-cs-is .rb-secondary { background: var(--major-is-bg); color: var(--major-is); }
.role-badge.rb-cs-bs .rb-secondary { background: var(--major-bs-bg); color: var(--major-bs); }
.role-badge.rb-is-cs .rb-secondary { background: var(--major-cs-bg); color: var(--major-cs); }
.role-badge.rb-is-ba .rb-secondary { background: var(--major-ba-bg); color: var(--major-ba); }
.role-badge.rb-is-bs .rb-secondary { background: var(--major-bs-bg); color: var(--major-bs); }
.role-badge.rb-ba-cs .rb-secondary { background: var(--major-cs-bg); color: var(--major-cs); }
.role-badge.rb-ba-is .rb-secondary { background: var(--major-is-bg); color: var(--major-is); }
.role-badge.rb-ba-bs .rb-secondary { background: var(--major-bs-bg); color: var(--major-bs); }
.role-badge.rb-bs-cs .rb-secondary { background: var(--major-cs-bg); color: var(--major-cs); }
.role-badge.rb-bs-is .rb-secondary { background: var(--major-is-bg); color: var(--major-is); }
.role-badge.rb-bs-ba .rb-secondary { background: var(--major-ba-bg); color: var(--major-ba); }

.role-badge .rb-suffix {
  font-weight: 500;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.role-badge .rb-edit-hint {
  display: none;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
}

.role-badge:hover .rb-edit-hint { display: inline-flex; align-items: center; }

@media (max-width: 860px) {
  .navbar { flex-wrap: wrap; }
  .role-badge { margin-left: 0; margin-top: 6px; flex-basis: 100%; justify-content: flex-start; }
}
```

- [ ] **Step 2: Reload, verify CSS parses without breaking the app**

Open `http://localhost:8080/`. Expected: app still loads. (No badge yet — added in Task 14.)

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: add role badge CSS for navbar"
```

---

### Task 14: Render the role badge in the navbar

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `_roleBadgeHtml()` helper above `renderShell`**

Insert just above `renderShell()`:

```js
  _roleBadgeHtml() {
    const p = this.profile;
    if (!p) return '';
    const PROGRAM_LABEL = { CS: 'CS', IS: 'IS', BA: 'BA', BS: 'BS', AS: 'A&S' };

    if (p.role === 'area_head') {
      return `
        <button class="role-badge rb-ah" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Area Head <span class="rb-suffix">· All programs</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    if (p.role === 'professor' && p.primary === 'AS') {
      return `
        <button class="role-badge rb-as" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">Arts &amp; Sciences <span class="rb-suffix">· Faculty</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    const primaryLower = (p.primary || '').toLowerCase();
    const secondaryLower = (p.secondary || '').toLowerCase();
    const facultySuffix = p.role === 'professor' ? '<span class="rb-suffix">· Faculty</span>' : '';

    if (this.profile && this.profile.role === 'student' && p.secondary && p.secondary !== p.primary) {
      const cls = 'rb-' + primaryLower + '-' + secondaryLower;
      return `
        <button class="role-badge rb-${primaryLower} ${cls}" onclick="App.editRole()" title="Click to change role">
          <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]}</span>
          <span class="rb-divider"></span>
          <span class="rb-segment rb-secondary">${PROGRAM_LABEL[p.secondary]} <span class="rb-suffix">minor</span></span>
          <span class="rb-edit-hint">Edit</span>
        </button>`;
    }

    const suffix = p.role === 'student' ? '<span class="rb-suffix">major</span>' : facultySuffix;
    return `
      <button class="role-badge rb-${primaryLower}" onclick="App.editRole()" title="Click to change role">
        <span class="rb-segment rb-primary">${PROGRAM_LABEL[p.primary]} ${suffix}</span>
        <span class="rb-edit-hint">Edit</span>
      </button>`;
  },

  editRole() {
    this.renderOnboarding(true);
  },
```

- [ ] **Step 2: Insert the badge into the navbar**

In `renderShell()`, find the navbar markup. Replace:

```js
        <div class="navbar-brand" onclick="App.reset()">CountsFor <span class="subtitle">CMU-Q</span></div>
        <div class="navbar-right">
```

with:

```js
        <div class="navbar-brand" onclick="App.reset()">CountsFor <span class="subtitle">CMU-Q</span></div>
        ${this._roleBadgeHtml()}
        <div class="navbar-right">
```

- [ ] **Step 3: Manually verify the badge renders**

Reload `http://localhost:8080/`.

If your stored profile is `student / CS / BA`:
- Badge after the brand should show `CS │ BA minor` (CS in red, BA in blue, hairline divider).

To test other modes from console:
```js
saveProfile({role:'professor', primary:'CS', secondary:null}); location.reload();
// → "CS · Faculty"

saveProfile({role:'professor', primary:'AS', secondary:null}); location.reload();
// → "Arts & Sciences · Faculty"

saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();
// → "Area Head · All programs"

saveProfile({role:'student', primary:'CS', secondary:null}); location.reload();
// → "CS major"
```

Hover the badge → "Edit" hint appears on the right.

- [ ] **Step 4: Verify the edit flow**

Click the badge. Expected:
- Onboarding splash appears
- Step 1 has the current role pre-highlighted
- A small "Cancel" link is visible in the bottom-right corner
- Clicking "Cancel" returns to the app without changes
- Picking a different combination + Continue updates localStorage + the badge updates

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(navbar): render clickable role badge that opens edit flow"
```

---

## Phase D — View mode dispatch

### Task 15: Filter major tabs by view mode

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `_visibleMajors()` helper**

Insert just above `renderShell()`:

```js
  _visibleMajors() {
    const vm = computeViewMode(this.profile);
    if (vm === 'cross-program') return MAJOR_ORDER.slice();  // all 4
    if (vm === 'focused-dual') return [this.profile.primary, this.profile.secondary];
    if (vm === 'focused-single') return [this.profile.primary];
    return MAJOR_ORDER.slice();  // safety fallback
  },
```

- [ ] **Step 2: Use it when rendering tabs**

In `renderShell()`, find the major-tabs markup:

```js
            ${MAJOR_ORDER.map(m => `<button class="major-tab ${m===this.activeMajor?'active':''}" data-major="${m}" onclick="App.switchMajor('${m}')">${m}</button>`).join('')}
```

Replace with:

```js
            ${this._visibleMajors().map(m => {
              const isMinor = this.profile && m === this.profile.secondary && m !== this.profile.primary;
              const minorSuffix = isMinor ? '<span class="major-tab-suffix">minor</span>' : '';
              return `<button class="major-tab ${m===this.activeMajor?'active':''}" data-major="${m}" onclick="App.switchMajor('${m}')">${m}${minorSuffix}</button>`;
            }).join('')}
```

- [ ] **Step 3: Default `activeMajor` should be the user's primary, not always 'CS'**

In `App.init()`, after `this.profile = loadProfile();` and before `this.renderShell();`, add:

```js
    this.profile = loadProfile();
    if (!this.profile) {
      this.renderOnboarding(false);
      return;
    }
    // Default the active tab to the user's primary program (if applicable)
    if (this.profile.primary && this.profile.primary !== 'AS') {
      this.activeMajor = this.profile.primary;
    }
    this.renderShell();
```

Apply the same logic in `_finishOnboarding()` after `this.profile = profile;`:

```js
    this.profile = profile;
    if (this.profile.primary && this.profile.primary !== 'AS') {
      this.activeMajor = this.profile.primary;
    }
```

- [ ] **Step 4: Add a small CSS rule for the minor suffix**

Append to `css/styles.css`:

```css
.major-tab-suffix {
  font-weight: 500;
  font-size: 0.75em;
  color: var(--text-tertiary);
  margin-left: 4px;
}
```

- [ ] **Step 5: Manually verify each view mode**

Try each profile in console and reload:

```js
// Focused-dual: only CS + BA tabs visible; BA shows "minor" suffix
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();

// Focused-single: only CS tab
saveProfile({role:'student', primary:'CS', secondary:null}); location.reload();

// Cross-program (area head): all 4 tabs (CS / IS / BA / BS)
saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();

// Cross-program (A&S prof): all 4 tabs
saveProfile({role:'professor', primary:'AS', secondary:null}); location.reload();
```

Expected: tab visibility matches the spec for each mode. Open the right panel ("Browse Map" button or similar) and confirm.

- [ ] **Step 6: Commit**

```bash
git add js/app.js css/styles.css
git commit -m "feat(views): filter major tabs by view mode and label minor"
```

---

## Phase E — Empty state v2

### Task 16: CSS for the redesigned empty state

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append empty-state-v2 CSS**

```css
/* ════════════════════════════════════════════════════════════
   Empty State v2 — search-first home with role context
   ════════════════════════════════════════════════════════════ */

.empty-state-v2 {
  padding: 24px 24px 40px;
}

.es-hero {
  text-align: center;
  margin-bottom: 24px;
}

.es-hero-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.5px;
  margin-bottom: 4px;
}

.es-hero-sub {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.es-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 14px;
}

.es-card {
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease;
}

.es-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}

.es-card .es-card-label {
  font-size: 11px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: 800;
  margin-bottom: 6px;
}

.es-card .es-card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.es-card .es-card-code {
  font-size: 14px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 5px;
  color: #fff;
}

.es-card .es-card-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.es-card .es-card-meta {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Major-color variants */
.es-card-cs { border: 2px solid var(--major-cs); background: var(--major-cs-bg); }
.es-card-cs .es-card-label, .es-card-cs .es-card-code { color: var(--major-cs); }
.es-card-cs .es-card-code { background: var(--major-cs); color: #fff; }
.es-card-is { border: 2px solid var(--major-is); background: var(--major-is-bg); }
.es-card-is .es-card-label { color: var(--major-is); }
.es-card-is .es-card-code { background: var(--major-is); color: #fff; }
.es-card-ba { border: 2px solid var(--major-ba); background: var(--major-ba-bg); }
.es-card-ba .es-card-label { color: var(--major-ba); }
.es-card-ba .es-card-code { background: var(--major-ba); color: #fff; }
.es-card-bs { border: 2px solid var(--major-bs); background: var(--major-bs-bg); }
.es-card-bs .es-card-label { color: var(--major-bs); }
.es-card-bs .es-card-code { background: var(--major-bs); color: #fff; }
.es-card-all { border: 1.5px solid var(--border); background: var(--bg-secondary); grid-column: 1 / -1; }
.es-card-all .es-card-label { color: var(--text-tertiary); }

/* Double-counter banner (also used inside course card) */
.dc-banner {
  position: relative;
  background: linear-gradient(90deg, rgba(196,18,48,0.04), rgba(37,99,235,0.04));
  border: 1.5px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px 10px 18px;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  cursor: pointer;
  transition: border-color 120ms ease;
}

.dc-banner:hover { border-color: var(--text-secondary); }

.dc-banner::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--major-cs), var(--major-ba));
  border-radius: 8px 0 0 8px;
}

.dc-banner-badges {
  display: inline-flex;
  gap: 4px;
}

.dc-mini-badge {
  font-size: 10px;
  font-weight: 800;
  padding: 3px 7px;
  border-radius: 4px;
  color: #fff;
  letter-spacing: 0.5px;
}

.dc-mini-cs { background: var(--major-cs); }
.dc-mini-is { background: var(--major-is); }
.dc-mini-ba { background: var(--major-ba); }
.dc-mini-bs { background: var(--major-bs); }

.dc-banner-text {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.dc-banner-cta {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
}

.es-try-row {
  margin-top: 18px;
}

.es-try-label {
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--text-tertiary);
  margin-bottom: 6px;
}

.es-try-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.es-try-chip {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 12px;
  padding: 6px 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}

.es-try-chip:hover { border-color: var(--major-cs); color: var(--major-cs); }

@media (max-width: 860px) {
  .es-cards { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Verify CSS parses**

Reload. Expected: app still works. (No new visuals yet.)

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: add empty-state-v2 CSS (role cards, double-counter banner)"
```

---

### Task 17: Render the focused-dual empty state

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `_pickTryCourses()` helper above `renderLeftEmpty`**

Find `renderLeftEmpty()` (around line 385). Just **above** it, insert:

```js
  _pickTryCourses() {
    const FALLBACK = ['15-122', '21-259', '73-102', '67-262', '70-311'];
    const vm = computeViewMode(this.profile);
    let picks = [];

    if (vm === 'focused-dual') {
      picks = this.courses.filter(c => c._doubleCounter).map(c => c.course_code);
    } else if (vm === 'focused-single') {
      // Top-N codes appearing in primary's tree, in tree order
      const primaryCourses = this.courses.filter(c => {
        const r = c.requirements || {};
        return Array.isArray(r[this.profile.primary]) && r[this.profile.primary].length > 0;
      });
      picks = primaryCourses.map(c => c.course_code);
    } else if (vm === 'cross-program') {
      picks = this.courses.filter(c => (c._programCount || 0) >= 3).map(c => c.course_code);
    }

    picks = picks.slice(0, 5);
    // Backfill with FALLBACK if fewer than 3
    if (picks.length < 3) {
      for (const code of FALLBACK) {
        if (picks.length >= 5) break;
        if (!picks.includes(code)) picks.push(code);
      }
    }
    return picks.slice(0, 5);
  },
```

- [ ] **Step 2: Add the focused-dual empty state renderer**

Insert just below `_pickTryCourses()`:

```js
  _renderEmptyDual() {
    const PROGRAM_NAME = { CS: 'Computer Science', IS: 'Information Systems', BA: 'Business Administration', BS: 'Biological Sciences' };
    const p = this.profile.primary;
    const s = this.profile.secondary;
    const pLower = p.toLowerCase();
    const sLower = s.toLowerCase();

    const primaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[p]) && r[p].length > 0;
    }).length;

    const secondaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[s]) && r[s].length > 0;
    }).length;

    const dcCount = this.courses.filter(c => c._doubleCounter).length;

    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards">
          <div class="es-card es-card-${pLower}" onclick="App.enterExplorer('${p}')">
            <div class="es-card-label">Your major</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${p}</span>
              <span class="es-card-name">${PROGRAM_NAME[p]}</span>
            </div>
            <div class="es-card-meta">${primaryCount} courses</div>
          </div>
          <div class="es-card es-card-${sLower}" onclick="App.enterExplorer('${s}')">
            <div class="es-card-label">Your minor</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${s}</span>
              <span class="es-card-name">${PROGRAM_NAME[s]}</span>
            </div>
            <div class="es-card-meta">${secondaryCount} courses</div>
          </div>
        </div>

        <div class="dc-banner" onclick="App.showDoubleCounterList()">
          <span class="dc-banner-badges">
            <span class="dc-mini-badge dc-mini-${pLower}">${p}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${s}</span>
          </span>
          <span class="dc-banner-text">${dcCount} courses count for BOTH your ${p} major and ${s} minor</span>
          <span class="dc-banner-cta">View all →</span>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },
```

- [ ] **Step 3: Wire the renderer into `renderLeftEmpty`**

Replace the existing `renderLeftEmpty()` body:

```js
  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';

    const vm = computeViewMode(this.profile);
    if (vm === 'focused-dual') {
      el.innerHTML = this._renderEmptyDual();
      return;
    }
    // Other modes will be implemented in Tasks 18, 19. Until then, fall back:
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-text">Type a course code or name above</div>
        <div class="empty-hint">
          Try <code>15-122</code> · <code>21-259</code> · <code>73-102</code> · <code>67-262</code> · <code>70-311</code>
        </div>
      </div>`;
  },
```

- [ ] **Step 4: Add `showDoubleCounterList` stub** (real impl in Task 21)

Add anywhere in the App object:

```js
  showDoubleCounterList() {
    // Implemented in Task 21
    console.log('TODO: render double-counter list view');
  },
```

- [ ] **Step 5: Manually verify the focused-dual empty state**

Save a CS+BA student profile and reload:
```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```

Expected:
- "What does this course count for?" hero
- Two cards: "YOUR MAJOR — CS Computer Science (62 courses)" in red + "YOUR MINOR — BA Business Administration (38 courses)" in blue
- Double-counter banner with `[CS] [BA]` mini-badges + count text + "View all →"
- "Try a course" chips below — populated from double-counter codes
- Clicking a CS card enters explorer mode on the CS tree.
- Clicking a BA card enters explorer mode on the BA tree.
- Clicking the banner logs "TODO: render double-counter list view".
- Clicking a try-chip loads that course's card.

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(empty-state): focused-dual home with role cards and double-counter banner"
```

---

### Task 18: Render the focused-single empty state

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `_renderEmptySingle()`**

Add it next to `_renderEmptyDual()`:

```js
  _renderEmptySingle() {
    const PROGRAM_NAME = { CS: 'Computer Science', IS: 'Information Systems', BA: 'Business Administration', BS: 'Biological Sciences' };
    const p = this.profile.primary;
    const pLower = p.toLowerCase();

    const primaryCount = this.courses.filter(c => {
      const r = c.requirements || {};
      return Array.isArray(r[p]) && r[p].length > 0;
    }).length;

    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    const cardLabel = this.profile.role === 'professor' ? 'You teach in' : 'Your program';

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards" style="grid-template-columns:1fr">
          <div class="es-card es-card-${pLower}" onclick="App.enterExplorer('${p}')">
            <div class="es-card-label">${cardLabel}</div>
            <div class="es-card-title-row">
              <span class="es-card-code">${p}</span>
              <span class="es-card-name">${PROGRAM_NAME[p]}</span>
            </div>
            <div class="es-card-meta">${primaryCount} courses</div>
          </div>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },
```

- [ ] **Step 2: Wire it into `renderLeftEmpty`**

Replace the focused-single fallback in `renderLeftEmpty()`:

```js
  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';

    const vm = computeViewMode(this.profile);
    if (vm === 'focused-dual') { el.innerHTML = this._renderEmptyDual(); return; }
    if (vm === 'focused-single') { el.innerHTML = this._renderEmptySingle(); return; }

    // Cross-program — implemented in Task 19
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <div class="empty-text">Type a course code or name above</div>
        <div class="empty-hint">
          Try <code>15-122</code> · <code>21-259</code> · <code>73-102</code> · <code>67-262</code> · <code>70-311</code>
        </div>
      </div>`;
  },
```

- [ ] **Step 3: Manually verify focused-single**

Console:
```js
saveProfile({role:'student', primary:'CS', secondary:null}); location.reload();
```

Expected:
- Hero
- Single full-width "Your program — CS Computer Science (62 courses)" card
- No banner
- Try-a-course chips populated from CS-required courses

Try with a professor:
```js
saveProfile({role:'professor', primary:'BA', secondary:null}); location.reload();
```

Expected: Same layout, but card label says "You teach in" instead of "Your program".

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(empty-state): focused-single home with single program card"
```

---

### Task 19: Render the cross-program empty state

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Add `_renderEmptyCross()`**

Add next to the others:

```js
  _renderEmptyCross() {
    const tryCodes = this._pickTryCourses();
    const tryHtml = tryCodes.map(code => `<button class="es-try-chip" onclick="App.selectCourseFromTree('${esc(code)}')">${esc(code)}</button>`).join('');

    return `
      <div class="empty-state-v2">
        <div class="es-hero">
          <div class="es-hero-title">What does this course count for?</div>
          <div class="es-hero-sub">Search any of ${this.courses.length.toLocaleString()} CMU-Q courses</div>
        </div>

        <div class="es-cards">
          <div class="es-card es-card-all" onclick="App.enterExplorer('CS')">
            <div class="es-card-label">All programs</div>
            <div class="es-card-title-row">
              <span class="es-card-name">${this.courses.length.toLocaleString()} courses across CS · IS · BA · BS</span>
            </div>
            <div class="es-card-meta">Click to open the requirement map</div>
          </div>
        </div>

        <div class="es-try-row">
          <div class="es-try-label">Try a course (cross-cutting)</div>
          <div class="es-try-chips">${tryHtml}</div>
        </div>
      </div>
    `;
  },
```

- [ ] **Step 2: Wire it in**

Replace `renderLeftEmpty()` once more:

```js
  renderLeftEmpty() {
    const el = document.getElementById('leftBody');
    if (!el) return;
    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = 'none';

    const vm = computeViewMode(this.profile);
    if (vm === 'focused-dual') el.innerHTML = this._renderEmptyDual();
    else if (vm === 'focused-single') el.innerHTML = this._renderEmptySingle();
    else el.innerHTML = this._renderEmptyCross();
  },
```

- [ ] **Step 3: Manually verify cross-program**

```js
saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();
```

Expected:
- Hero header
- One wide "All programs" card with the total course count and a description
- Try-a-course chips (5 codes, all from courses with `_programCount >= 3`)
- Clicking the card enters explorer mode

Same for A&S professor:
```js
saveProfile({role:'professor', primary:'AS', secondary:null}); location.reload();
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(empty-state): cross-program home with All programs summary card"
```

---

### Task 20: CSS for the double-counter list view

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append CSS**

```css
/* ════════════════════════════════════════════════════════════
   Double-Counter List View
   ════════════════════════════════════════════════════════════ */

.dc-list-view {
  padding: 18px 24px 40px;
}

.dc-list-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
}

.dc-back-link {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
}

.dc-back-link:hover { border-color: var(--text-primary); color: var(--text-primary); }

.dc-list-count {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.dc-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dc-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.dc-row:hover {
  border-color: var(--text-primary);
  background: var(--bg-secondary);
}

.dc-row .dc-row-code {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  font-size: 16px;
  color: var(--major-cs);
}

.dc-row .dc-row-main { display: flex; flex-direction: column; gap: 4px; }

.dc-row .dc-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.dc-row .dc-row-fills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.dc-row .dc-row-fill {
  font-size: 10px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
}

.dc-row .dc-row-side {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dc-row .dc-row-units {
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 600;
}
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "style: add CSS for double-counter list view"
```

---

### Task 21: Implement the double-counter list view

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Replace the `showDoubleCounterList` stub**

Replace the stub with:

```js
  showDoubleCounterList() {
    if (computeViewMode(this.profile) !== 'focused-dual') return;
    const el = document.getElementById('leftBody');
    if (!el) return;

    const p = this.profile.primary;
    const s = this.profile.secondary;
    const pLower = p.toLowerCase();
    const sLower = s.toLowerCase();

    const list = this.courses.filter(c => c._doubleCounter);

    const lastSegment = (req) => {
      const parts = (req || '').split('---');
      return parts[parts.length - 1] || req || '';
    };

    const rowsHtml = list.map(c => {
      const pReqs = (c.requirements[p] || []).map(r => esc(lastSegment(r.requirement))).slice(0, 2);
      const sReqs = (c.requirements[s] || []).map(r => esc(lastSegment(r.requirement))).slice(0, 2);
      const fills = [
        ...pReqs.map(r => `<span class="dc-row-fill"><strong style="color:var(--major-${pLower})">${p}:</strong> ${r}</span>`),
        ...sReqs.map(r => `<span class="dc-row-fill"><strong style="color:var(--major-${sLower})">${s}:</strong> ${r}</span>`),
      ].join('');
      return `
        <div class="dc-row" onclick="App.selectCourseFromTree('${esc(c.course_code)}')">
          <div class="dc-row-code">${esc(c.course_code)}</div>
          <div class="dc-row-main">
            <div class="dc-row-name">${esc(c.course_name)}</div>
            <div class="dc-row-fills">${fills}</div>
          </div>
          <div class="dc-row-side">
            <span class="dc-mini-badge dc-mini-${pLower}">${p}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${s}</span>
            <span class="dc-row-units">${c.units || '?'}u</span>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="dc-list-view">
        <div class="dc-list-header">
          <button class="dc-back-link" onclick="App.renderLeftEmpty()">← Back to home</button>
          <div class="dc-list-count">${list.length} courses count for both ${p} and ${s}</div>
        </div>
        <div class="dc-list">${rowsHtml || '<div class="empty-state"><div class="empty-text">No double-counter courses found.</div></div>'}</div>
      </div>
    `;
  },
```

- [ ] **Step 2: Manually verify**

```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```

On the home view, click the double-counter banner.

Expected:
- The left panel body is replaced with a list
- Header shows "← Back to home" + "N courses count for both CS and BA"
- Each row: course code (red monospace bold) + course name + small chips listing what it fills in CS and BA + dual color badges + units
- Clicking a row loads that course's card (uses existing `selectCourseFromTree`)
- Clicking "← Back to home" returns to the empty state

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(empty-state): double-counter list view with back link"
```

---

## Phase F — Course card redesign

### Task 22: CSS for course card v2

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append course card v2 CSS**

```css
/* ════════════════════════════════════════════════════════════
   Course Card v2 — bigger, denser, single column
   ════════════════════════════════════════════════════════════ */

.course-card-v2 { padding: 24px 24px 32px; }

.cc2-header {
  display: flex;
  align-items: baseline;
  gap: 14px;
  margin-bottom: 4px;
}

.cc2-code {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 800;
  font-size: 32px;
  letter-spacing: -1px;
  line-height: 1;
  color: var(--major-cs);
}

.cc2-units {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.cc2-name {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
  margin-bottom: 12px;
}

.cc2-pills {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.cc2-pill {
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 12px;
  padding: 4px 10px;
  color: var(--text-secondary);
  font-weight: 600;
}

.cc2-pill-offered {
  background: transparent;
  border: 1px solid var(--major-cs);
  color: var(--major-cs);
  font-weight: 700;
  cursor: pointer;
}

.cc2-section-title {
  font-size: 11px;
  font-weight: 800;
  color: var(--text-primary);
  margin: 0 0 7px;
}

.cc2-counts-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.cc2-counts-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  padding: 9px 11px;
  cursor: pointer;
  transition: transform 80ms ease;
}

.cc2-counts-row:hover { transform: translateX(2px); }

.cc2-counts-row.cf-row-cs { border: 2px solid var(--major-cs); background: var(--major-cs-bg); }
.cc2-counts-row.cf-row-is { border: 2px solid var(--major-is); background: var(--major-is-bg); }
.cc2-counts-row.cf-row-ba { border: 2px solid var(--major-ba); background: var(--major-ba-bg); }
.cc2-counts-row.cf-row-bs { border: 2px solid var(--major-bs); background: var(--major-bs-bg); }

.cc2-counts-badge {
  font-size: 11px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 5px;
  color: #fff;
  letter-spacing: 0.5px;
}

.cc2-counts-type {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  background: #fff;
  border: 1px solid;
}

.cc2-counts-row.cf-row-cs .cc2-counts-badge { background: var(--major-cs); }
.cc2-counts-row.cf-row-cs .cc2-counts-type { color: var(--major-cs); border-color: var(--major-cs); }
.cc2-counts-row.cf-row-is .cc2-counts-badge { background: var(--major-is); }
.cc2-counts-row.cf-row-is .cc2-counts-type { color: var(--major-is); border-color: var(--major-is); }
.cc2-counts-row.cf-row-ba .cc2-counts-badge { background: var(--major-ba); }
.cc2-counts-row.cf-row-ba .cc2-counts-type { color: var(--major-ba); border-color: var(--major-ba); }
.cc2-counts-row.cf-row-bs .cc2-counts-badge { background: var(--major-bs); }
.cc2-counts-row.cf-row-bs .cc2-counts-type { color: var(--major-bs); border-color: var(--major-bs); }

.cc2-counts-text {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 600;
  flex: 1;
}

.cc2-counts-arrow {
  font-size: 14px;
  font-weight: 700;
}

.cc2-counts-row.cf-row-cs .cc2-counts-arrow { color: var(--major-cs); }
.cc2-counts-row.cf-row-is .cc2-counts-arrow { color: var(--major-is); }
.cc2-counts-row.cf-row-ba .cc2-counts-arrow { color: var(--major-ba); }
.cc2-counts-row.cf-row-bs .cc2-counts-arrow { color: var(--major-bs); }

.cc2-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 16px;
}

.cc2-prereq-text { font-size: 13px; color: var(--text-primary); line-height: 1.4; }
.cc2-prereq-none { color: var(--text-tertiary); font-style: italic; }

.cc2-sched-section {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.45;
}

.cc2-sched-secline { margin-bottom: 4px; }
.cc2-sched-more {
  margin-top: 4px;
  font-size: 11px;
  color: var(--major-cs);
  font-weight: 600;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}

.cc2-dm-pill {
  display: inline-block;
  font-size: 9px;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.5px;
  vertical-align: middle;
}

.cc2-dm-inperson { background: #dcfce7; color: #166534; }
.cc2-dm-remote   { background: #dbeafe; color: #1e40af; }
.cc2-dm-other    { background: var(--bg-secondary); color: var(--text-secondary); }

.cc2-description {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
}

@media (max-width: 860px) {
  .cc2-grid-2 { grid-template-columns: 1fr; }
  .cc2-code { font-size: 26px; }
  .cc2-name { font-size: 16px; }
}
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "style: add course-card-v2 CSS"
```

---

### Task 23: Rewrite `renderCourseCard` — header, double-counter banner, counts-for, prereq + schedule, description

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Replace `renderCourseCard()` body completely**

In `js/app.js`, find `renderCourseCard()`. Replace its entire body with:

```js
  renderCourseCard(course) {
    const el = document.getElementById('leftBody');
    if (!el) return;

    const deptName = getDeptName(course.course_code);
    const semesters = sortSemesters(course.offered || []);
    const prereq = formatPrereq(course.prerequisites);
    const mappings = getCourseMappings(course);
    const sections = course.soc_sections || [];
    const isDoubleCounter = !!course._doubleCounter;
    const profile = this.profile;
    const pLower = profile && profile.primary ? profile.primary.toLowerCase() : 'cs';
    const sLower = profile && profile.secondary ? profile.secondary.toLowerCase() : 'cs';

    // ── Double-counter banner ─────────────────────────────
    let dcBannerHtml = '';
    if (isDoubleCounter && profile && profile.secondary) {
      dcBannerHtml = `
        <div class="dc-banner" style="cursor:default">
          <span class="dc-banner-badges">
            <span class="dc-mini-badge dc-mini-${pLower}">${profile.primary}</span>
            <span class="dc-mini-badge dc-mini-${sLower}">${profile.secondary}</span>
          </span>
          <span class="dc-banner-text">Counts for BOTH your ${profile.primary} major and ${profile.secondary} minor</span>
        </div>`;
    }

    // ── Header pills ──────────────────────────────────────
    const locFlags = [];
    if (course.offered_qatar) locFlags.push('🇶🇦 Qatar');
    if (course.offered_pitts) locFlags.push('🇺🇸 Pittsburgh');

    let semPillsHtml = '';
    if (semesters.length > 0) {
      const visible = semesters.slice(0, 4);
      const more = semesters.length > 4 ? ` · +${semesters.length - 4}` : '';
      semPillsHtml = `<button class="cc2-pill cc2-pill-offered" onclick="App.expandSemestersV2(event)" id="semesterPillsV2" data-expanded="0" title="Click to show all">Offered ${visible.join(' · ')}${more}</button>`;
    }

    // ── Counts For ────────────────────────────────────────
    let cfHtml = '';
    for (const majorCode of MAJOR_ORDER) {
      const majorMappings = mappings[majorCode];
      if (!majorMappings || majorMappings.length === 0) continue;
      for (const m of majorMappings) {
        const typeLabel = m.isGenEd ? 'GEN ED' : 'CORE';
        const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        cfHtml += `
          <div class="cc2-counts-row cf-row-${majorCode.toLowerCase()}" data-nav-major="${majorCode}" data-nav-path="${safePath}">
            <span class="cc2-counts-badge">${majorCode}</span>
            <span class="cc2-counts-type">${typeLabel}</span>
            <span class="cc2-counts-text">${esc(m.shortLabel)}</span>
            <span class="cc2-counts-arrow">→</span>
          </div>`;
      }
    }
    if (!cfHtml) cfHtml = '<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">This course does not count toward any tracked major requirements.</div>';

    // ── Prereq + Schedule (2-col block) ──────────────────
    const prereqHtml = prereq
      ? `<div class="cc2-prereq-text">${esc(prereq)}</div>`
      : `<div class="cc2-prereq-text cc2-prereq-none">None</div>`;

    let schedHtml = '';
    const dmCls = (dm) => {
      const d = (dm || '').toLowerCase();
      if (d.includes('remote')) return 'cc2-dm-remote';
      if (d.includes('in-person')) return 'cc2-dm-inperson';
      return 'cc2-dm-other';
    };

    // Filter by location
    let filtered = sections.slice();
    if (this.locationFilter === 'qatar') {
      filtered = filtered.filter(s => s.location && (s.location.includes('Qatar') || s.location.includes('Doha')));
    } else if (this.locationFilter === 'pittsburgh') {
      filtered = filtered.filter(s => s.location && s.location.includes('Pittsburgh'));
    }

    if (filtered.length > 0) {
      const first = filtered[0];
      const moreCount = filtered.length - 1;
      const timeStr = first.begin_time && first.begin_time !== 'TBA'
        ? `${esc(first.begin_time)}–${esc(first.end_time)}`
        : 'TBA';
      const dm = first.delivery_mode ? `<span class="cc2-dm-pill ${dmCls(first.delivery_mode)}">${esc(first.delivery_mode).toUpperCase()}</span>` : '';
      schedHtml = `
        <div class="cc2-sched-section">
          <div class="cc2-sched-secline">Sec ${esc(first.section)} · ${esc(first.days || 'TBA')} ${timeStr}</div>
          ${dm}
          ${moreCount > 0 ? `<button class="cc2-sched-more" onclick="App.expandScheduleV2(event)" id="cc2SchedMore" data-expanded="0">+${moreCount} more sections</button><div id="cc2SchedExtra" style="display:none;margin-top:6px;font-size:11px;color:var(--text-secondary);line-height:1.5"></div>` : ''}
        </div>`;
    } else {
      const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
      schedHtml = `<div style="font-size:12px;color:var(--text-tertiary);font-style:italic">Not offered at ${campus} for Fall 2026</div>`;
    }

    el.innerHTML = `
      <div class="course-card-v2">
        ${dcBannerHtml}

        <div class="cc2-header">
          <div class="cc2-code">${esc(course.course_code)}</div>
          <div class="cc2-units">${course.units || '?'} units</div>
        </div>
        <div class="cc2-name">${esc(course.course_name)}</div>

        <div class="cc2-pills">
          <span class="cc2-pill">${esc(deptName)} (${course.course_code.split('-')[0]})</span>
          ${locFlags.map(f => `<span class="cc2-pill">${f}</span>`).join('')}
          ${semPillsHtml}
        </div>

        <div class="cc2-section-title">Counts For</div>
        <div class="cc2-counts-list">${cfHtml}</div>

        <div class="cc2-grid-2">
          <div>
            <div class="cc2-section-title">Prerequisites</div>
            ${prereqHtml}
          </div>
          <div>
            <div class="cc2-section-title">Fall 2026</div>
            ${schedHtml}
          </div>
        </div>

        ${course.description ? `
          <div class="cc2-section-title">Description</div>
          <div class="cc2-description">${esc(course.description)}</div>
        ` : ''}
      </div>`;

    const explBtn = document.getElementById('exploreInlineBtn');
    if (explBtn) explBtn.style.display = this.layoutMode === 'focused' ? 'flex' : 'none';

    this._cc2Sections = filtered;  // used by expand handler
  },
```

- [ ] **Step 2: Add `expandSemestersV2` and `expandScheduleV2` helpers**

Replace the existing `expandSemesters` and add new sibling:

```js
  expandSemestersV2(e) {
    e.stopPropagation();
    if (!this.selectedCourse) return;
    const btn = document.getElementById('semesterPillsV2');
    if (!btn) return;
    const semesters = sortSemesters(this.selectedCourse.offered || []);
    const expanded = btn.dataset.expanded === '1';
    if (expanded) {
      const visible = semesters.slice(0, 4);
      const more = semesters.length > 4 ? ` · +${semesters.length - 4}` : '';
      btn.textContent = 'Offered ' + visible.join(' · ') + more;
      btn.dataset.expanded = '0';
    } else {
      btn.textContent = 'Offered ' + semesters.join(' · ');
      btn.dataset.expanded = '1';
    }
  },

  expandScheduleV2(e) {
    e.stopPropagation();
    const btn = document.getElementById('cc2SchedMore');
    const extra = document.getElementById('cc2SchedExtra');
    if (!btn || !extra) return;
    const expanded = btn.dataset.expanded === '1';
    const sections = (this._cc2Sections || []).slice(1);
    if (!expanded) {
      extra.style.display = 'block';
      extra.innerHTML = sections.map(s => {
        const time = s.begin_time && s.begin_time !== 'TBA' ? esc(s.begin_time) + '–' + esc(s.end_time) : 'TBA';
        return 'Sec ' + esc(s.section) + ' · ' + esc(s.days || 'TBA') + ' ' + time + ' · ' + esc(s.delivery_mode || '—');
      }).join('<br>');
      btn.textContent = 'Hide extra sections';
      btn.dataset.expanded = '1';
    } else {
      extra.style.display = 'none';
      btn.textContent = '+' + sections.length + ' more sections';
      btn.dataset.expanded = '0';
    }
  },
```

You can leave the old `expandSemesters` method alone — nothing calls it anymore — and remove it in the final cleanup task.

- [ ] **Step 3: Manually verify the redesigned course card**

```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```

Search `15-122` and click it.

Expected:
- Double-counter banner at the top (gradient red/blue accent on left, `[CS] [BA]` mini-badges, "Counts for BOTH your CS major and BA minor")
- 32px monospace red course code, 12u next to it
- 18px course name
- Pills row: dept (15), Qatar/Pittsburgh flags if applicable, "Offered F25 · M25 · S25 · F24 · +N" pill
- Clicking the offered pill expands all semesters; clicking again collapses
- "Counts For" section with bigger color-bordered rows; clicking a row enters explorer to that path
- 2-col block: Prerequisites on left, "Fall 2026" with first section on right
- "+N more sections" link expands inline if multiple sections
- Description below

Then test as cross-program:
```js
saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();
```

Search `15-122`. Expected: no banner. Card otherwise identical.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(course-card): redesign — bigger code, double-counter banner, single column"
```

---

## Phase G — Tree redesign

### Task 24: CSS for the redesigned tree

**Files:**
- Modify: `css/styles.css`

- [ ] **Step 1: Append CSS**

```css
/* ════════════════════════════════════════════════════════════
   Tree v2 — bigger rows, denser, double-counter tags
   ════════════════════════════════════════════════════════════ */

.major-tabs .major-tab {
  font-size: 13px;
  font-weight: 700;
  padding: 10px 16px;
}

.tree-node-row {
  min-height: 36px;
  font-size: 14px;
  font-weight: 700;
}

.tree-node-row .tree-arrow {
  font-size: 12px;
  width: 14px;
  text-align: center;
}

.tree-node-row .tree-label {
  font-size: 14px;
  font-weight: 700;
}

.tree-node-row .tree-label-l1 { font-size: 14px; font-weight: 800; }

.tree-node-row .rule-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
}

.tree-node-row .course-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}

.tree-section-divider {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 16px 16px 6px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 6px;
}

.tree-course {
  min-height: 36px;
  align-items: center;
}

.tree-course .tree-course-code {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: 14px;
}

.tree-course .tree-course-name { font-size: 13px; }
.tree-course .tree-course-units { font-size: 12px; font-weight: 600; }

.tree-course.active-course {
  background: var(--major-cs-bg);
  border-left: 2px solid var(--major-cs);
}

.tree-course:hover {
  background: var(--bg-secondary);
}

/* Double-counter tag at end of leaf row */
.dc-leaf-tag {
  margin-left: auto;
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  color: #fff;
  letter-spacing: 0.5px;
}

.dc-leaf-tag-cs { background: var(--major-cs); }
.dc-leaf-tag-is { background: var(--major-is); }
.dc-leaf-tag-ba { background: var(--major-ba); }
.dc-leaf-tag-bs { background: var(--major-bs); }

/* Multi-program chip (cross-program view) */
.mp-chip {
  margin-left: auto;
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.tree-search input {
  font-size: 14px;
  padding: 12px 14px;
  border-radius: 8px;
}
```

- [ ] **Step 2: Reload and visually scan**

Open `http://localhost:8080/`. With any profile, click "Browse Map" / "Explore Map". Tree rows should now feel taller and more readable.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css
git commit -m "style: tree v2 — bigger rows and tap targets"
```

---

### Task 25: Add double-counter tag to tree leaf rows in focused-dual mode

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Modify `renderTreeNode` leaf-course rendering**

Find the leaf course rendering inside `renderTreeNode()` (around line 700, the line generating `<div class="tree-course"...`). Replace that block with:

```js
      // Leaf courses
      if (hasCourses) {
        const vm = computeViewMode(this.profile);
        for (const c of filteredCourses) {
          const fullCourse = this.courseIndex[c.code] || c;
          const alsoMajors = getAlsoCountsFor(fullCourse, major);
          const isActive = this.selectedCourse && this.selectedCourse.course_code === c.code;
          const courseIndent = 16 + (depth + 1) * 18 + 16;

          // Double-counter tag (focused-dual): if this course also fills the secondary, tag it
          let dcTag = '';
          if (vm === 'focused-dual' && fullCourse._doubleCounter) {
            const other = (this.profile.secondary === major) ? this.profile.primary : this.profile.secondary;
            if (other) {
              dcTag = `<span class="dc-leaf-tag dc-leaf-tag-${other.toLowerCase()}">${other}</span>`;
            }
          }
          // Multi-program chip (cross-program view, 3+ programs)
          let mpChip = '';
          if (vm === 'cross-program' && (fullCourse._programCount || 0) >= 3) {
            mpChip = `<span class="mp-chip">${fullCourse._programCount} programs</span>`;
          }

          html += `<div class="tree-course ${isActive ? 'active-course' : ''}" style="padding-left:${courseIndent}px" data-course-code="${esc(c.code)}">`;
          html += `<span class="tree-course-code">${esc(c.code)}</span>`;
          html += `<span class="tree-course-name">${esc(c.name)}</span>`;
          if (c.units) html += `<span class="tree-course-units">${c.units}u</span>`;
          if (alsoMajors.length > 0 && vm !== 'focused-dual' && vm !== 'cross-program') {
            html += `<span class="also-tags">${alsoMajors.map(m => `<span class="also-tag also-tag-${m.toLowerCase()}">${m}</span>`).join('')}</span>`;
          }
          html += dcTag;
          html += mpChip;
          html += `</div>`;
        }
      }
```

- [ ] **Step 2: Manually verify**

```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```

Open Browse Map, navigate into the CS tree. Find a course like `15-122` — its leaf row should have a `[BA]` blue tag at the end.

Switch to BA tab → that same course on the BA side should have a `[CS]` red tag at the end.

```js
saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();
```

Open Browse Map → navigate into a tree → find a course with `_programCount >= 3` (likely a GenEd like `76-101`). Should show a neutral grey "3 programs" or "4 programs" chip.

Focused-single mode should show neither tag nor chip.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(tree): double-counter tag on leaf rows in focused-dual; multi-program chip in cross-program"
```

---

### Task 26: Tag double-counter results in the search typeahead

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Modify the typeahead-row HTML in `handleSearch`**

Find `handleSearch` (around line 285). In the row construction, find the line:

```js
        return '<div class="typeahead-item" data-idx="' + i + '" onclick="App.selectSearchResult(' + i + ')">' +
          '<span class="typeahead-code">' + esc(c.course_code) + '</span>' +
          '<span class="typeahead-name">' + esc(c.course_name) + '</span>' +
          matchHint +
          '<span class="typeahead-units">' + (c.units || '?') + ' u</span>' +
        '</div>';
```

Replace with:

```js
        const vm = computeViewMode(App.profile);
        let dcTag = '';
        if (vm === 'focused-dual' && c._doubleCounter && App.profile.secondary) {
          dcTag = '<span class="dc-leaf-tag dc-leaf-tag-' + App.profile.secondary.toLowerCase() + '" style="margin-left:6px">' + App.profile.secondary + '</span>';
        }
        return '<div class="typeahead-item" data-idx="' + i + '" onclick="App.selectSearchResult(' + i + ')">' +
          '<span class="typeahead-code">' + esc(c.course_code) + '</span>' +
          '<span class="typeahead-name">' + esc(c.course_name) + '</span>' +
          matchHint +
          dcTag +
          '<span class="typeahead-units">' + (c.units || '?') + ' u</span>' +
        '</div>';
```

- [ ] **Step 2: Manually verify**

```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```

Type `15-122` in the search box. The typeahead row should show a small `[BA]` blue tag next to the course name (since 15-122 fills both CS and BA).

Type a CS-only course like `15-251`. Its row should NOT have a `[BA]` tag (assuming it doesn't double-count).

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat(search): tag double-counter results in typeahead"
```

---

## Phase H — Polish & verification

### Task 27: Re-annotate on profile edit + remove old `expandSemesters`

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Verify `_finishOnboarding` already re-annotates**

Open `_finishOnboarding` and confirm this block exists (added in Task 12):

```js
    if (wasEdit) {
      annotateDoubleCounters(this.courses, this.profile);
      this.renderLeftEmpty();
      this.renderTree();
    } else {
      this.loadData();
    }
```

If the `annotateDoubleCounters(this.courses, this.profile);` line is missing, add it.

- [ ] **Step 2: Remove the now-dead `expandSemesters` method**

Find the old `expandSemesters(e)` method (around former line 562). Delete it. The new `expandSemestersV2` replaces it.

- [ ] **Step 3: Confirm app still loads**

Reload `http://localhost:8080/` with any profile. App should work normally.

- [ ] **Step 4: Verify edit flow re-annotates**

```js
saveProfile({role:'student', primary:'CS', secondary:null}); location.reload();
```

Search `15-122` → no double-counter banner (focused-single mode).

Click the role badge → change to CS+BA → Continue.

The page should re-render. Search `15-122` again → double-counter banner now appears (re-annotation worked).

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "chore: remove deprecated expandSemesters method"
```

---

### Task 28: Manual end-to-end verification

**Files:** none (verification-only)

Run through every spec acceptance criterion (Section 16 of the spec). For each, open the app, perform the action, confirm the expected result.

- [ ] **Step 1: First-visit onboarding**

```js
localStorage.clear(); location.reload();
```

- [ ] Splash with CMU red gradient appears
- [ ] Three role buttons present, no emojis
- [ ] Click Student → step 2 with major + minor selectors
- [ ] Pick CS major + BA minor + Continue → focused-dual home view loads with two role cards + banner

- [ ] **Step 2: Each role flow**

For each profile below, set + reload + verify:

```js
saveProfile({role:'student', primary:'CS', secondary:'BA'}); location.reload();
```
- [ ] Two tabs visible (CS, BA), BA labeled "minor"
- [ ] Empty state shows two role cards + double-counter banner
- [ ] Search `15-122` → card has banner + `[CS]` `[BA]` mini-badges
- [ ] In tree, CS leaf rows have `[BA]` tags on double-counters

```js
saveProfile({role:'student', primary:'BA', secondary:null}); location.reload();
```
- [ ] One tab (BA)
- [ ] Empty state shows single full-width "Your program" card
- [ ] Search a course → card has no banner

```js
saveProfile({role:'professor', primary:'CS', secondary:null}); location.reload();
```
- [ ] One tab (CS)
- [ ] Empty state card label says "You teach in"

```js
saveProfile({role:'professor', primary:'AS', secondary:null}); location.reload();
```
- [ ] All four tabs
- [ ] Role badge says "Arts & Sciences · Faculty"
- [ ] Empty state shows "All programs" summary card

```js
saveProfile({role:'area_head', primary:null, secondary:null}); location.reload();
```
- [ ] All four tabs
- [ ] Role badge says "Area Head · All programs"
- [ ] Tree leaf rows show "3 programs" / "4 programs" chips on cross-cutting courses

- [ ] **Step 3: Edit flow**

With any profile loaded, click the role badge.
- [ ] Splash returns
- [ ] Step 1 shows current role pre-selected
- [ ] "Cancel" link visible bottom-right
- [ ] Cancel returns without writing
- [ ] Continue with a different profile updates the badge + view mode immediately

- [ ] **Step 4: Mobile sanity check**

Resize browser to <860px or use DevTools device emulation.
- [ ] Onboarding splash buttons stack to one column
- [ ] Role badge wraps below brand
- [ ] Empty-state role cards stack to one column
- [ ] Course card stays single-column (already mobile-friendly)
- [ ] Lens toggle still works in split mode

- [ ] **Step 5: Edge cases**

```js
localStorage.setItem('cf_role', 'admin');  // invalid
location.reload();
```
- [ ] App detects the invalid profile and shows the onboarding splash

```js
localStorage.setItem('cf_role', 'student');
localStorage.setItem('cf_primary', 'CS');
localStorage.setItem('cf_secondary', 'CS');  // self-self minor
location.reload();
```
- [ ] App rejects this and shows the onboarding splash (validateProfile drops it)

- [ ] **Step 6: No decorative emojis check**

Scan the new UI: onboarding splash, role badge, empty states, double-counter banner, course card, tree.
- [ ] No `⭐` `✨` `✦` or similar
- [ ] Functional emojis still present where expected: `🔍` (search), `🇶🇦` `🇺🇸` (location flags), `🌙` `☀️` (theme)

- [ ] **Step 7: Run unit tests**

Open `http://localhost:8080/tests/test.html`. Expected: all 26 tests pass.

- [ ] **Step 8: Commit a marker for the verification pass (optional)**

If anything was broken and fixed during verification, commit those fixes. Otherwise no commit needed.

---

## Self-Review (after writing the plan)

The author of this plan re-read the spec. Coverage check:

| Spec section | Implemented in |
|---|---|
| §4 User model — roles, programs, view modes | Tasks 2 (computeViewMode), 7 (annotations), 15 (tab filtering) |
| §5 Architecture — App.profile, profile.js, dispatch, annotations | Tasks 2, 3, 4, 5, 6, 7 |
| §6 Onboarding flow — splash, state machine, step 1, step 2 student, step 2 prof, edit | Tasks 8, 9, 10, 11, 12, 14 |
| §7 Three view modes — tab filtering | Tasks 15, 17, 18, 19 |
| §8 Empty-state home view — focused-dual, focused-single, cross-program, list view | Tasks 16, 17, 18, 19, 20, 21 |
| §9 Course card redesign — banner, header, counts-for, prereq+sched, description | Tasks 22, 23 |
| §10 Tree redesign — bigger rows, secondary tag, multi-program chip | Tasks 24, 25 |
| §11 Navbar & role-edit | Tasks 13, 14 |
| §12 Edge cases — validation, mobile, accessibility | Built into Tasks 2, 3, 8, 16, 27, 28 |
| §13 CSS plan | Tasks 8, 13, 16, 20, 22, 24 |
| §16 Acceptance criteria | Task 28 |

Identified one place where the spec specified a behavior I didn't write a task for: the spec mentions "Expand arrow rotates 90° when expanded" for tree nodes. The existing app.js already has `${expanded ? 'expanded' : ''}` on the `.tree-arrow` element and the existing CSS handles rotation. No new task needed.

Also: the spec mentions "Search results / typeahead indicator". Implemented in Task 26.

Plan is complete with no placeholders.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-05-10-role-aware-onboarding.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. Good for big plans like this one where each task is testable in isolation.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Faster but less context isolation per task.

Which approach?
