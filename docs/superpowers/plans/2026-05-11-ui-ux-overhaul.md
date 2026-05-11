# UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the five user-facing surfaces (onboarding, navbar, home, course card, requirement tree) per `docs/superpowers/specs/2026-05-11-ui-ux-overhaul-design.md` without touching the profile model, view-mode dispatch, or data layer.

**Architecture:** Six sequential phases. Each phase leaves the app in a working state and is committed independently. Phase A lays the CSS foundation everyone else builds on. Phases B–E rewrite one surface at a time (smallest first, biggest last). Phase F is end-to-end verification against the spec's 12 acceptance criteria.

**Tech Stack:** Vanilla JS (single `App` object), one CSS file with custom-property tokens, zero build step. Tests are zero-dependency browser tests in `tests/test.html`. No new dependencies — confirmed by spec § 2.

---

## File Structure

| File | Status | Responsibility |
|------|--------|----------------|
| `css/styles.css` | Modify | Adjust color tokens, add type scale, rewrite onboarding/home/card/tree blocks. Touched in every phase. |
| `js/app.js` | Modify | Rewrite `renderOnboarding*` (Phase B), `renderShell` + `_renderEmpty*` → `_renderHome` (Phase C), `renderCourseCard` (Phase D), `renderTree*` (Phase E). |
| `js/data.js` | Modify | Add `pickAccentColor` pure function (Phase E). |
| `tests/data.test.js` | Modify | Add tests for `pickAccentColor` (Phase E). |
| `tests/test.html` | Untouched | Test runner page — no changes needed. |
| `index.html` | Untouched | Single shell — no changes needed. |
| `js/profile.js`, `js/api.js`, `js/utils.js` | Untouched | Profile model, data fetcher, helpers — spec § 6 says these stay. |

---

## Phase A — CSS foundation

Lay down the token + type system Phases B–E will use. Single commit; small and safe.

### Task 1: Add new color tokens & adjust contrast values

**Files:**
- Modify: `css/styles.css:38-92` (the `:root` and `[data-theme="dark"]` blocks)

- [ ] **Step 1: Read the current `:root` block** in `css/styles.css` to confirm line numbers haven't drifted. The token names referenced below must already exist (`--text-primary`, `--text-secondary`, `--text-tertiary`, `--bg-primary`, etc.).

- [ ] **Step 2: Adjust light-mode token values to spec § 3 palette.** In the light-mode `:root` block, change these lines to match exactly:

  ```css
  --text-primary: #1a1a1a;     /* was #111827 — slight softening */
  --text-secondary: #4a4a4a;   /* was #4B5563 */
  --text-tertiary: #6a6a6a;    /* was #9CA3AF — CRITICAL contrast fix */
  ```

  Append the following **new** tokens at the end of the same `:root` block. **Do not** re-declare `--major-cs/is/ba/bs` — those already exist in the same block with companion `-bg`/`-text`/`-border` tokens; redeclaring would silently shift the base hue while leaving the companions on the old hue, producing visual inconsistency.

  ```css
  /* Tree section accent tokens (consumed in Phase E) */
  --accent-math: #6b21a8;
  --accent-humanities: #B45309;   /* darker amber — distinct from --major-is */
  --accent-science: #047857;      /* darker green — distinct from --major-bs */
  ```

- [ ] **Step 3: Adjust dark-mode token values** in the `[data-theme="dark"]` block to keep parity:

  ```css
  --text-primary: #f1f5f9;
  --text-secondary: #cbd5e1;   /* was #94A3B8 — was too dim against panel bg */
  --text-tertiary: #94a3b8;    /* was #4B5563 — was unreadable on dark panels */
  ```

- [ ] **Step 4: Reload http://localhost:8080/ and visually confirm** no immediate breakage (color shift only — layout should be unchanged). Tertiary text on white should now look meaningfully darker than before.

- [ ] **Step 5: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: adjust text/major tokens for high-contrast spec"
  ```

### Task 2: Add type-scale utility classes

**Files:**
- Modify: `css/styles.css` (append a new block right after the `:root` blocks, before existing component CSS)

- [ ] **Step 1: Append a `/* === Type scale === */` block** with these utility classes. These are the building blocks for Phases B–E (the spec § 3 type scale):

  ```css
  /* === Type scale (spec § 3) === */
  .t-hero      { font-size: 26px; font-weight: 800; line-height: 1.15; letter-spacing: -0.01em; color: var(--text-primary); }
  .t-display   { font-size: 28px; font-weight: 800; line-height: 1.05; letter-spacing: -0.01em; color: var(--text-primary); }
  .t-section   { font-size: 14px; font-weight: 700; color: var(--text-primary); }
  .t-body      { font-size: 13px; font-weight: 500; color: var(--text-primary); line-height: 1.45; }
  .t-body-sm   { font-size: 12.5px; font-weight: 500; color: var(--text-primary); line-height: 1.4; }
  .t-label     { font-size: 11px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }
  .t-label-sm  { font-size: 10px; font-weight: 700; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }
  .t-caption   { font-size: 11px; font-weight: 500; color: var(--text-tertiary); }
  .t-mono      { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 12px; font-weight: 700; }
  ```

- [ ] **Step 2: Reload http://localhost:8080/** — no visible change (none of the new classes are used yet). Confirm CSS still parses by opening DevTools and checking for parse errors.

- [ ] **Step 3: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: add type-scale utility classes (t-hero/section/body/label/mono)"
  ```

### Task 3: Audit and fix lingering low-contrast text in existing CSS

**Files:**
- Modify: `css/styles.css` (any hard-coded `color: #9CA3AF`, `#888`, `#A1A1AA`, etc.)

- [ ] **Step 1: Grep for low-contrast hard-coded colors** and capture line numbers:

  ```bash
  grep -nE "color:\s*#[89aAbBcC][89aAbBcC0-9a-fA-F][89aAbBcC0-9a-fA-F]" css/styles.css
  ```

  Expected output: zero or a small list (≤ 10 hits).

- [ ] **Step 2: For each hit above**, if it's body or sentence text on a white background, replace with `var(--text-tertiary)` (now `#6a6a6a`) or `var(--text-secondary)` depending on importance. If it's a disabled/placeholder element, leave it alone.

- [ ] **Step 3: Reload and visually scan** the home screen, course card (search "15-122"), and a few tree nodes for any remaining washed-out text.

- [ ] **Step 4: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: replace hard-coded low-contrast grays with tokens"
  ```

---

## Phase B — Onboarding splash

Replace the 2-step splash with single-screen progressive disclosure per spec § 4.1.

### Task 4: Rewrite `_renderOnboardingStep` and helpers to single-screen

**Files:**
- Modify: `js/app.js:97-247` (the entire onboarding block from `_onboardingState` through `_pickProfProgram`)

- [ ] **Step 1: Replace the onboarding block** with the version below. This consolidates the three step-render functions into one and removes the `step` state machine. The new state has only `role`, `primary`, `secondary`, `isEdit`:

  ```js
    _onboardingState: {
      role: null,
      primary: null,
      secondary: null,
      isEdit: false,
    },

    renderOnboarding(isEdit) {
      this._onboardingState = {
        role: this.profile ? this.profile.role : null,
        primary: this.profile ? this.profile.primary : null,
        secondary: this.profile ? this.profile.secondary : null,
        isEdit: !!isEdit,
      };
      this._renderOnboardingScreen();
    },

    _renderOnboardingScreen() {
      const s = this._onboardingState;
      const PROGRAMS = ['CS', 'IS', 'BA', 'BS'];
      const roleSel = (r) => s.role === r ? 'selected' : '';
      const majorSel = (m) => s.primary === m ? 'selected' : '';
      const minorSel = (m) => s.secondary === m ? 'selected' : '';
      const showMajor = s.role === 'student' || s.role === 'professor';
      const showMinor = s.role === 'student' && !!s.primary;
      const showProfAS = s.role === 'professor';

      // Validity rule per spec § 4.1
      const valid =
        (s.role === 'area_head') ||
        (s.role === 'professor' && (s.primary === 'AS' || PROGRAMS.includes(s.primary))) ||
        (s.role === 'student' && PROGRAMS.includes(s.primary));

      const cancelHtml = s.isEdit
        ? '<button class="onboarding-cancel" onclick="App._cancelOnboarding()">Cancel</button>'
        : '';

      // Stage classes drive opacity + pointer-events via CSS
      const majorStage = showMajor ? 'on' : 'off';
      const minorStage = showMinor ? 'on' : 'off';

      const majorBtns = PROGRAMS.map(p => `
        <button class="ob-pill ${majorSel(p)}" onclick="App._obPickMajor('${p}')">${p}<span class="ob-pill-sub">${this._programFullName(p)}</span></button>
      `).join('');

      const profASBtn = showProfAS
        ? `<button class="ob-pill ob-pill-wide ${s.primary === 'AS' ? 'selected' : ''}" onclick="App._obPickMajor('AS')">Arts &amp; Sciences<span class="ob-pill-sub">Cross-program teaching</span></button>`
        : '';

      const minorBtns = PROGRAMS.map(p => {
        const disabled = (s.primary === p) ? 'disabled aria-disabled="true"' : '';
        return `<button class="ob-pill ${minorSel(p)}" ${disabled} onclick="App._obPickMinor('${p}')">${p}</button>`;
      }).join('');

      document.getElementById('app').innerHTML = `
        <div class="onboarding-splash">
          <div class="onboarding-card">
            <div class="onboarding-brand">CountsFor</div>
            <div class="onboarding-brand-sub">CMU-Q Curriculum Explorer</div>

            <div class="ob-heading">Tell us who you are.</div>
            <div class="ob-sub">We'll tailor the curriculum view to your role. Takes 5 seconds.</div>

            <div class="ob-section">
              <div class="ob-section-label">I AM A</div>
              <div class="ob-row3">
                <button class="ob-pill ${roleSel('student')}" onclick="App._obPickRole('student')">Student</button>
                <button class="ob-pill ${roleSel('professor')}" onclick="App._obPickRole('professor')">Professor</button>
                <button class="ob-pill ${roleSel('area_head')}" onclick="App._obPickRole('area_head')">Area Head</button>
              </div>
            </div>

            <div class="ob-section ob-stage-${majorStage}">
              <div class="ob-section-label">${s.role === 'professor' ? 'I TEACH IN' : 'MAJORING IN'}</div>
              <div class="ob-row4">${majorBtns}</div>
              ${profASBtn}
            </div>

            <div class="ob-section ob-stage-${minorStage}">
              <div class="ob-section-label">WITH A MINOR IN <span class="ob-optional">— optional</span></div>
              <div class="ob-row5">
                <button class="ob-pill ${s.secondary === null ? 'selected' : ''}" onclick="App._obPickMinor(null)">None</button>
                ${minorBtns}
              </div>
            </div>

            <button class="onboarding-continue" ${valid ? '' : 'disabled'} onclick="App._finishOnboarding()">Continue →</button>
          </div>
          ${cancelHtml}
        </div>
      `;
    },

    _programFullName(p) {
      return ({ CS: 'Computer Sci', IS: 'Info Systems', BA: 'Business', BS: 'Biology' })[p] || p;
    },

    _obPickRole(role) {
      this._onboardingState.role = role;
      // Clear program picks when role changes meaningfully
      if (role === 'area_head') {
        this._onboardingState.primary = null;
        this._onboardingState.secondary = null;
      }
      this._renderOnboardingScreen();
    },

    _obPickMajor(program) {
      this._onboardingState.primary = program;
      // If minor matches new major, clear it
      if (this._onboardingState.secondary === program) {
        this._onboardingState.secondary = null;
      }
      this._renderOnboardingScreen();
    },

    _obPickMinor(program) {
      this._onboardingState.secondary = program;
      this._renderOnboardingScreen();
    },
  ```

  **Important:** Preserve `_finishOnboarding`, `_cancelOnboarding`, and `renderOnboarding` (entry point) function names — the navbar role badge and `init()` call them. Only the internal step functions are deleted.

- [ ] **Step 2: Verify `_finishOnboarding` exists below** (it should — it was not in the block above and should be left untouched). If it references `s.step`, drop the reference; otherwise leave alone.

- [ ] **Step 3: Quick syntax sanity** — reload the app with `localStorage.clear(); location.reload();` in DevTools. Confirm the page shows the new single-screen onboarding (even unstyled).

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat(onboarding): single-screen progressive disclosure (replaces 2-step)"
  ```

### Task 5: CSS for single-screen onboarding

**Files:**
- Modify: `css/styles.css` — replace the existing `.onboarding-*` block. Find the start with `grep -n "onboarding-splash" css/styles.css`.

- [ ] **Step 1: Append (or replace existing) onboarding CSS**:

  ```css
  /* === Onboarding splash (spec § 4.1) === */
  .onboarding-splash {
    position: fixed; inset: 0;
    background: linear-gradient(135deg, #C41230 0%, #7d0a1f 45%, #4a0612 100%);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    padding: 24px; overflow-y: auto;
    z-index: 1000;
  }
  .onboarding-card {
    width: 100%; max-width: 520px;
    background: transparent;
  }
  .onboarding-brand { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; }
  .onboarding-brand-sub { font-size: 11px; opacity: 0.75; margin-top: 2px; }
  .ob-heading { font-size: 26px; font-weight: 800; line-height: 1.15; margin-top: 24px; }
  .ob-sub { font-size: 13px; opacity: 0.85; margin-top: 6px; line-height: 1.5; }

  .ob-section { margin-top: 22px; transition: opacity 200ms ease; }
  .ob-section.ob-stage-off { opacity: 0.35; pointer-events: none; }
  .ob-section.ob-stage-on  { opacity: 1; pointer-events: auto; }
  .ob-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.7; font-weight: 700; margin-bottom: 8px; }
  .ob-optional { opacity: 0.65; font-weight: 500; letter-spacing: 0; }

  .ob-row3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ob-row4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .ob-row5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }

  .ob-pill {
    display: block; width: 100%;
    padding: 13px 10px; border-radius: 11px;
    background: rgba(255,255,255,0.08);
    border: 1.5px solid rgba(255,255,255,0.18);
    color: #fff; font-size: 13px; font-weight: 700; text-align: center;
    cursor: pointer; transition: background 120ms, transform 80ms;
  }
  .ob-pill:hover:not([disabled]) { background: rgba(255,255,255,0.16); }
  .ob-pill:active:not([disabled]) { transform: scale(0.98); }
  .ob-pill.selected { background: #fff; color: #C41230; border-color: #fff; }
  .ob-pill[disabled] { opacity: 0.3; cursor: not-allowed; }
  .ob-pill-sub { display: block; font-size: 10px; font-weight: 500; opacity: 0.75; margin-top: 2px; }
  .ob-pill-wide { margin-top: 8px; width: 100%; padding: 12px; }

  .onboarding-continue {
    width: 100%; padding: 14px; border-radius: 11px; border: 0;
    background: #fff; color: #C41230; font-size: 14px; font-weight: 700;
    margin-top: 22px; cursor: pointer; transition: opacity 120ms;
  }
  .onboarding-continue[disabled] { opacity: 0.4; cursor: not-allowed; }
  .onboarding-cancel {
    position: fixed; bottom: 20px; right: 24px;
    background: transparent; border: 0;
    color: rgba(255,255,255,0.7); font-size: 13px; cursor: pointer; text-decoration: underline;
  }

  @media (max-width: 480px) {
    .ob-row4 { grid-template-columns: repeat(2, 1fr); }
    .ob-row5 { grid-template-columns: repeat(3, 1fr); }
    .ob-heading { font-size: 22px; }
  }
  ```

- [ ] **Step 2: Delete the old onboarding CSS block** (`.onboarding-option`, `.onboarding-options`, `.onboarding-question`, `.onboarding-help`, `.onboarding-step-label`, `.options-2col`, `.options-stacked`, `.opt-note`, `.opt-sub`). Search with `grep -n "onboarding-option\|onboarding-question\|onboarding-step-label" css/styles.css` and remove every block whose selector starts with those classes.

- [ ] **Step 3: Reload with `localStorage.clear(); location.reload();`** and walk through:
  - Student → CS → BA → Continue
  - Professor → IS → Continue
  - Professor → Arts & Sciences → Continue
  - Area Head → Continue (instant — no program needed)
  - Visually verify: no "Step 1 of 2" indicator anywhere; major row dims when no role picked; minor row dims for non-students.

- [ ] **Step 4: Verify edit flow** — once into the app, click the role pill in the navbar. The splash should reappear pre-filled with the current profile and a "Cancel" link at the bottom-right.

- [ ] **Step 5: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: onboarding splash CSS for single-screen disclosure"
  ```

---

## Phase C — Home screen

The biggest behavioral change. Spec § 4.3.

### Task 6: Strip panel-header on the home screen

**Files:**
- Modify: `js/app.js:347-404` (the `renderShell` function)

- [ ] **Step 1: Replace `renderShell` so the panel-header is only emitted when a course is selected.** Locate the existing function (starts around line 347) and replace its body with:

  ```js
    renderShell() {
      const isSplit = this.layoutMode === 'split';
      const hasCourse = !!this.selectedCourse;

      const headerHtml = hasCourse ? `
        <div class="panel-header">
          <div class="search-row">
            <div class="search-wrapper">
              <span class="search-icon">🔍</span>
              <input type="text" class="search-input" id="courseSearch" placeholder='Try "15-122" or "Probability"' autocomplete="off" />
              <div class="typeahead" id="typeahead"></div>
            </div>
            <button class="explore-btn-inline" id="exploreInlineBtn" onclick="App.enterExplorer()" style="display:none;">🗂 Explore Map</button>
          </div>
        </div>
      ` : '';

      document.getElementById('app').innerHTML = `
        <nav class="navbar">
          <div class="navbar-brand" onclick="App.reset()">CountsFor <span class="subtitle">CMU-Q</span></div>
          ${this._roleBadgeHtml()}
          <div class="navbar-right">
            <div class="navbar-location-toggle">
              <button class="loc-btn ${this.locationFilter==='all'?'active':''}" onclick="App.setLocation('all')">All</button>
              <button class="loc-btn ${this.locationFilter==='qatar'?'active':''}" onclick="App.setLocation('qatar')">🇶🇦 Qatar</button>
              <button class="loc-btn ${this.locationFilter==='pittsburgh'?'active':''}" onclick="App.setLocation('pittsburgh')">🇺🇸 Pittsburgh</button>
            </div>
            <button class="theme-toggle" id="themeBtn" onclick="App.toggleTheme()" title="Toggle theme">${this.theme==='dark'?'☀️':'🌙'}</button>
          </div>
        </nav>

        <div class="mobile-lens-toggle ${isSplit?'split-active':''}" id="mobileLensToggle">
          <button class="mobile-lens-btn ${this.mobileLens==='lookup'?'active':''}" onclick="App.setMobileLens('lookup')">🔍 Course Lookup</button>
          <button class="mobile-lens-btn ${this.mobileLens==='map'?'active':''}" onclick="App.setMobileLens('map')">🗂 Requirement Map</button>
        </div>

        <div class="main-layout ${isSplit?'layout-split':'layout-focused'}" id="mainLayout">
          <div class="panel panel-left ${isSplit && this.mobileLens==='map'?'hidden-mobile':''}" id="panelLeft">
            ${headerHtml}
            <div class="panel-body" id="leftBody"></div>
          </div>

          <div class="panel panel-right ${isSplit && this.mobileLens==='lookup'?'hidden-mobile':''}" id="panelRight">
            <div class="major-tabs" id="majorTabs">
              ${this._visibleMajors().map(m => {
                const isMinor = this.profile && m === this.profile.secondary && m !== this.profile.primary;
                const minorSuffix = isMinor ? '<span class="major-tab-suffix">minor</span>' : '';
                return `<button class="major-tab ${m===this.activeMajor?'active':''}" data-major="${m}" onclick="App.switchMajor('${m}')">${m}${minorSuffix}</button>`;
              }).join('')}
              <button class="panel-close" onclick="App.exitExplorer()" title="Close">&times;</button>
            </div>
            <div class="tree-search">
              <input type="text" id="treeSearchInput" placeholder="Filter requirements…" />
            </div>
            <div class="panel-body" id="rightBody"></div>
          </div>
        </div>
      `;
      this.applyTheme();
    },
  ```

  **What changed:** the panel-tag ("Course Lookup") and panel-title ("What does this course count for?") strings are gone. The search row only renders when `selectedCourse` is non-null. The placeholder text is shortened.

- [ ] **Step 2: Ensure `renderCourseCard` and `selectCourseFromTree` call `renderShell` again so the header re-renders** when a course gets selected. Search `js/app.js` for `this.renderCourseCard(`. If callers don't already trigger `renderShell`, add a `this.renderShell()` call *before* the `renderCourseCard()` call inside `selectCourseFromTree` and `handleSearchSelection` (or wherever `selectedCourse` is set from null → something). Verify by reading the file.

  Concretely, modify the place where `this.selectedCourse` is first assigned in `selectCourseFromTree` (search for `this.selectedCourse =` to find all sites) to wrap the assignment with a `wasEmpty` check and re-render the shell when transitioning from empty:

  ```js
    selectCourseFromTree(code) {
      const course = this.courseIndex[code];
      if (!course) return;
      const wasEmpty = !this.selectedCourse;
      this.selectedCourse = course;
      if (wasEmpty) this.renderShell();   // re-attach the search header
      this.renderCourseCard(course);
      // ... rest of function (highlighting, etc.) stays the same
    },
  ```

  Apply the same pattern to any other site that assigns `this.selectedCourse` from null. The `reset()` function already calls `renderLeftEmpty()` — change that to call `renderShell()` + `renderLeftEmpty()` so the header disappears when going back to home.

- [ ] **Step 3: Reload http://localhost:8080/** with a valid profile. Verify:
  - Home screen: no panel-header search bar above the body (the body now needs to render its own search — Task 7 fills this).
  - Search a course (in any way you can — e.g. via the tree): once a course is shown, a search bar reappears at the top of the left panel.

  Expected: the layout temporarily looks broken because the home body still calls the old `_renderEmptyDual`/etc. Phase C continues to fix that.

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat(home): show panel-header only when a course is selected"
  ```

### Task 7: Replace `_renderEmpty*` with a single `_renderHome`

**Files:**
- Modify: `js/app.js:693-838` (the three `_renderEmpty*` functions and `renderLeftEmpty`)

- [ ] **Step 1: Replace the three `_renderEmptyDual` / `_renderEmptySingle` / `_renderEmptyCross` functions and the dispatcher `renderLeftEmpty`** with a single home renderer. New code:

  ```js
    renderLeftEmpty() {
      const el = document.getElementById('leftBody');
      if (!el) return;
      const explBtn = document.getElementById('exploreInlineBtn');
      if (explBtn) explBtn.style.display = 'none';
      el.innerHTML = this._renderHome();
    },

    _renderHome() {
      const vm = computeViewMode(this.profile);
      const p = this.profile && this.profile.primary;
      const s = this.profile && this.profile.secondary;
      const PROGRAM_NAME = { CS: 'Computer Science', IS: 'Information Systems', BA: 'Business Administration', BS: 'Biological Sciences' };

      // Lead sentence per spec § 4.3
      let lead;
      if (vm === 'focused-dual') {
        lead = `See what it counts for in your ${p} major and ${s} minor.`;
      } else if (vm === 'focused-single' && this.profile.role === 'professor') {
        lead = `See what it counts for in the program you teach.`;
      } else if (vm === 'focused-single') {
        lead = `See what it counts for in your ${p} program.`;
      } else {
        lead = `See what it counts for across CS, IS, BA, and BS.`;
      }

      // Browse-button subtitle
      let browseSub;
      if (vm === 'focused-dual') browseSub = `${p} + ${s} requirement tree — find courses by slot`;
      else if (vm === 'focused-single') browseSub = `${p} requirement tree`;
      else browseSub = `CS · IS · BA · BS requirement tree`;

      // The major to open when Browse is clicked
      const browseMajor = (vm === 'cross-program') ? this.activeMajor : (p || this.activeMajor);

      // Double-counter banner (focused-dual only)
      let dcBannerHtml = '';
      if (vm === 'focused-dual') {
        const dcCount = this.courses.filter(c => c._doubleCounter).length;
        const pLower = p.toLowerCase();
        const sLower = s.toLowerCase();
        dcBannerHtml = `
          <div class="home-insight" onclick="App.showDoubleCounterList()">
            <div class="home-insight-num">${dcCount}</div>
            <div class="home-insight-col">
              <div class="home-insight-label">${p} MAJOR + ${s} MINOR</div>
              <div class="home-insight-text">courses count for both — pick these first</div>
            </div>
            <span class="home-insight-cta">See all →</span>
          </div>
        `;
      }

      // Multi-program lane (cross-program only) replaces the dc banner
      let mpBannerHtml = '';
      if (vm === 'cross-program') {
        const mpCount = this.courses.filter(c => (c._programCount || 0) >= 3).length;
        mpBannerHtml = `
          <div class="home-insight home-insight-mp" onclick="App.enterExplorer(this.activeMajor)">
            <div class="home-insight-num">${mpCount}</div>
            <div class="home-insight-col">
              <div class="home-insight-label">CROSS-PROGRAM</div>
              <div class="home-insight-text">courses count for 3+ programs</div>
            </div>
            <span class="home-insight-cta">Browse →</span>
          </div>
        `;
      }

      return `
        <div class="home">
          <h1 class="home-hero">Find a course.</h1>
          <p class="home-lead">${lead}</p>

          <div class="home-search">
            <span class="home-search-icon">🔍</span>
            <input type="text" class="home-search-input" id="courseSearch" placeholder='Try "15-122" or "Probability"' autocomplete="off" />
            <div class="typeahead" id="typeahead"></div>
          </div>

          <button class="home-browse" onclick="App.enterExplorer('${browseMajor}')">
            <span class="home-browse-icon">🗂</span>
            <span class="home-browse-text">
              <span class="home-browse-title">Browse requirements</span>
              <span class="home-browse-sub">${browseSub}</span>
            </span>
            <span class="home-browse-arrow">→</span>
          </button>

          ${dcBannerHtml}${mpBannerHtml}
        </div>
      `;
    },
  ```

- [ ] **Step 2: Delete the now-dead `_pickTryCourses` function** (search `grep -n "_pickTryCourses" js/app.js`). If nothing else references it, remove the function definition. If something else references it (it shouldn't — only the empty-state functions used it), update that caller.

- [ ] **Step 3: Reload http://localhost:8080/** with a valid profile. Verify:
  - One "Find a course." headline (no duplicate).
  - Search bar with `Try "15-122" or "Probability"` — fully readable, no clipping.
  - Big dark "Browse requirements" button with the right subtitle for your role.
  - For students with a minor: red gradient insight banner shows `<count>` and "courses count for both — pick these first". Clicking opens the double-counter list.
  - For students without minor / single-program professors: no insight banner.
  - Type a course code in the new search — typeahead still works (it's wired via the global `input` handler on `#courseSearch`).
  - Click a course — the home is replaced by the course card, the panel-header search reappears at the top.

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat(home): single _renderHome with search + browse + insight banner"
  ```

### Task 8: CSS for the new home screen

**Files:**
- Modify: `css/styles.css` — append new home block; remove old empty-state-v2 block

- [ ] **Step 1: Append the new home CSS**:

  ```css
  /* === Home screen (spec § 4.3) === */
  .home { padding: 28px 24px 32px; max-width: 720px; margin: 0 auto; }
  .home-hero {
    font-size: 28px; font-weight: 800; line-height: 1.1;
    color: var(--text-primary); margin: 0 0 6px;
    letter-spacing: -0.01em;
  }
  .home-lead {
    font-size: 14px; color: var(--text-secondary);
    margin: 0 0 22px; line-height: 1.45;
  }

  .home-search {
    position: relative; display: flex; align-items: center; gap: 10px;
    background: var(--bg-card); border: 2px solid var(--cmu-red); border-radius: 12px;
    padding: 13px 16px; box-shadow: 0 4px 14px rgba(196,18,48,0.08);
  }
  .home-search-icon { font-size: 16px; }
  .home-search-input {
    flex: 1; border: 0; outline: 0; background: transparent;
    font-size: 14px; color: var(--text-primary); font-family: inherit;
  }
  .home-search-input::placeholder { color: var(--text-tertiary); }

  .home-browse {
    width: 100%; display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; margin-top: 12px;
    background: #1a1a1a; color: #fff; border: 0; border-radius: 12px;
    font-family: inherit; cursor: pointer; text-align: left;
    transition: background 120ms;
  }
  .home-browse:hover { background: #2a2a2a; }
  .home-browse-icon { font-size: 18px; }
  .home-browse-text { flex: 1; display: flex; flex-direction: column; }
  .home-browse-title { font-size: 14px; font-weight: 600; }
  .home-browse-sub   { font-size: 11px; font-weight: 400; opacity: 0.72; margin-top: 2px; }
  .home-browse-arrow { font-size: 16px; opacity: 0.85; }

  .home-insight {
    display: flex; align-items: center; gap: 14px;
    background: linear-gradient(135deg, #C41230 0%, #7d0a1f 100%); color: #fff;
    border-radius: 14px; padding: 16px 18px; margin-top: 18px;
    cursor: pointer; transition: transform 120ms;
  }
  .home-insight:hover { transform: translateY(-1px); }
  .home-insight-num   { font-size: 40px; font-weight: 800; line-height: 1; min-width: 56px; }
  .home-insight-col   { flex: 1; }
  .home-insight-label { font-size: 11px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.06em; }
  .home-insight-text  { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .home-insight-cta   { background: #fff; color: var(--cmu-red); padding: 7px 14px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .home-insight-mp    { background: linear-gradient(135deg, #1f2937 0%, #0f172a 100%); }
  .home-insight-mp .home-insight-cta { color: #1f2937; }

  @media (max-width: 480px) {
    .home { padding: 22px 16px 28px; }
    .home-hero { font-size: 22px; }
    .home-lead { margin-bottom: 18px; }
    .home-insight { flex-direction: column; align-items: flex-start; gap: 8px; padding: 14px; }
    .home-insight-cta { align-self: stretch; text-align: center; }
  }
  ```

- [ ] **Step 2: Delete old empty-state CSS.** Search and remove: `grep -n "empty-state-v2\|es-hero\|es-cards\|es-card\|es-card-meta\|es-try-row\|es-try-chip\|es-try-label\|dc-banner\b" css/styles.css` and delete the matching blocks. Keep `dc-banner-text`, `dc-mini-badge` etc. if they're still used by the course card (verify with `grep` before deleting — the course card spec keeps a thin DC banner).

- [ ] **Step 3: Reload** and visually compare against spec § 4.3 layout. Tap-target check at 375 px: hero, search, browse button, insight banner all readable and reachable.

- [ ] **Step 4: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: home screen CSS (search + browse + insight banner)"
  ```

---

## Phase D — Course card

Spec § 4.4.

### Task 9: Rewrite `renderCourseCard` body to spec-sheet layout

**Files:**
- Modify: `js/app.js:890-1022` (the `renderCourseCard` function)

- [ ] **Step 1: Replace the existing `renderCourseCard` body** so the inner `el.innerHTML = …` template matches the new spec-sheet structure. Keep all the data-gathering at the top of the function (the `mappings`, `semesters`, `sections`, `prereq`, `isDoubleCounter` variables — they all stay).

  Replace from `// ── Double-counter banner ───` through the end of `el.innerHTML = …` with:

  ```js
      // Where string
      const whereParts = [];
      if (course.offered_qatar) whereParts.push('Qatar');
      if (course.offered_pitts) whereParts.push('Pittsburgh');
      const whereStr = whereParts.length ? whereParts.join(' &amp; ') : '—';

      // Slim DC banner (spec § 4.4)
      let dcBannerHtml = '';
      if (isDoubleCounter && profile && profile.secondary) {
        dcBannerHtml = `
          <div class="cc-dc-strip">
            <span class="cc-dc-badge cc-dc-${pLower}">${profile.primary}</span>
            <span class="cc-dc-badge cc-dc-${sLower}">${profile.secondary}</span>
            <span class="cc-dc-text">Double-counter</span>
          </div>`;
      }

      // About column rows
      const aboutRows = `
        <div class="cc-kv"><span class="cc-k">Dept</span><span class="cc-v">${esc(deptName)} (${esc(course.course_code.split('-')[0])})</span></div>
        <div class="cc-kv"><span class="cc-k">Offered</span><span class="cc-v">${semesters.length ? semesters.join(' · ') : '—'}</span></div>
        <div class="cc-kv"><span class="cc-k">Where</span><span class="cc-v">${whereStr}</span></div>
        <div class="cc-kv"><span class="cc-k">Prereq</span><span class="cc-v">${prereq ? esc(prereq) : '<em>None</em>'}</span></div>
      `;

      // Fall 2026 schedule rows (filtered + show up to 4 inline, rest behind a button)
      let filtered = sections.slice();
      if (this.locationFilter === 'qatar') {
        filtered = filtered.filter(s => s.location && (s.location.includes('Qatar') || s.location.includes('Doha')));
      } else if (this.locationFilter === 'pittsburgh') {
        filtered = filtered.filter(s => s.location && s.location.includes('Pittsburgh'));
      }
      const dmCls = (dm) => {
        const d = (dm || '').toLowerCase();
        if (d.includes('remote')) return 'cc-dm-remote';
        if (d.includes('in-person')) return 'cc-dm-inperson';
        return 'cc-dm-other';
      };
      const renderSchedRow = (s) => {
        const time = (s.begin_time && s.begin_time !== 'TBA')
          ? `${esc(s.begin_time)}–${esc(s.end_time)}`
          : 'TBA';
        const dm = s.delivery_mode ? `<span class="cc-dm-pill ${dmCls(s.delivery_mode)}">${esc(s.delivery_mode).toUpperCase()}</span>` : '';
        return `<div class="cc-kv"><span class="cc-k">Sec ${esc(s.section)}</span><span class="cc-v">${esc(s.days || 'TBA')} ${time} ${dm}</span></div>`;
      };
      let schedHtml = '';
      if (filtered.length === 0) {
        const campus = this.locationFilter === 'qatar' ? 'Qatar' : this.locationFilter === 'pittsburgh' ? 'Pittsburgh' : 'this filter';
        schedHtml = `<div class="cc-empty">Not offered at ${campus} for Fall 2026</div>`;
      } else {
        const inline = filtered.slice(0, 4).map(renderSchedRow).join('');
        const extraCount = filtered.length - 4;
        const more = extraCount > 0
          ? `<button class="cc-more" onclick="App.expandScheduleV2(event)" id="cc2SchedMore" data-expanded="0">+${extraCount} more sections</button>
             <div id="cc2SchedExtra" style="display:none;margin-top:6px;font-size:11px;color:var(--text-secondary);line-height:1.5"></div>`
          : '';
        schedHtml = inline + more;
      }

      // Counts For rows
      let cfHtml = '';
      for (const majorCode of MAJOR_ORDER) {
        const majorMappings = mappings[majorCode];
        if (!majorMappings || majorMappings.length === 0) continue;
        for (const m of majorMappings) {
          const typeLabel = m.isGenEd ? 'GenEd' : 'Required';
          const safePath = m.fullPath.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
          cfHtml += `
            <div class="cc-cf-row" data-nav-major="${majorCode}" data-nav-path="${safePath}">
              <span class="cc-cf-badge cc-cf-${majorCode.toLowerCase()}">${majorCode}</span>
              <span class="cc-cf-text">${esc(m.shortLabel)} — ${typeLabel}</span>
              <span class="cc-cf-arrow">→</span>
            </div>`;
        }
      }
      if (!cfHtml) cfHtml = '<div class="cc-empty">This course does not count toward any tracked major requirements.</div>';

      el.innerHTML = `
        <div class="cc-card">
          ${dcBannerHtml}
          <div class="cc-head">
            <div class="cc-code">${esc(course.course_code)}</div>
            <div class="cc-name">${esc(course.course_name)} · ${course.units || '?'} units</div>
          </div>

          <div class="cc-cols">
            <div class="cc-section">
              <div class="cc-h4">ABOUT</div>
              ${aboutRows}
            </div>
            <div class="cc-section">
              <div class="cc-h4">FALL 2026</div>
              ${schedHtml}
            </div>
          </div>

          <div class="cc-section cc-section-cf">
            <div class="cc-h4">COUNTS FOR</div>
            ${cfHtml}
          </div>

          ${course.description ? `
            <div class="cc-section">
              <div class="cc-h4">DESCRIPTION</div>
              <div class="cc-desc">${esc(course.description)}</div>
            </div>
          ` : ''}
        </div>
      `;
  ```

- [ ] **Step 2: Find and remove the now-dead `expandSemestersV2` method** (search `grep -n "expandSemestersV2" js/app.js`). The new card lists all offered semesters inline, so the expander is no longer reachable. Delete the function entirely.

- [ ] **Step 3: Reload, search "15-122"**, verify:
  - Slim DC banner at top with two badges + "Double-counter".
  - Big "15-122" code, name + units inline below.
  - 2-column About / Fall 2026 grid.
  - "COUNTS FOR" section with colored row badges.
  - Description in a separate block, no border tint.
  - Click any Counts-For row → tree navigates to that requirement (existing `data-nav-major` behavior).
  - +N more sections still works if a course has many sections (try `21-127` or another popular CS course).

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat(course-card): spec-sheet layout with about/fall/counts-for blocks"
  ```

### Task 10: CSS for the new course card

**Files:**
- Modify: `css/styles.css` — append new `.cc-*` block; remove old `.cc2-*` block and `.course-card-v2`

- [ ] **Step 1: Append the new course-card CSS**:

  ```css
  /* === Course card (spec § 4.4) === */
  .cc-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 14px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    overflow: hidden;
  }
  .cc-dc-strip {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 16px;
    background: linear-gradient(90deg, var(--cmu-red), #7d0a1f);
    color: #fff; font-size: 12px; font-weight: 600;
  }
  .cc-dc-badge {
    background: rgba(255,255,255,0.22);
    padding: 3px 8px; border-radius: 999px;
    font-size: 11px; font-weight: 700;
  }
  .cc-dc-text { letter-spacing: 0.02em; }

  .cc-head { padding: 18px 20px 12px; border-bottom: 1px solid var(--border-light); }
  .cc-code { font-size: 28px; font-weight: 800; line-height: 1; color: var(--text-primary); letter-spacing: -0.01em; }
  .cc-name { font-size: 13px; color: var(--text-secondary); margin-top: 4px; line-height: 1.4; }

  .cc-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px 20px; }
  .cc-section { }
  .cc-section-cf { padding: 4px 20px 16px; }
  .cc-h4 {
    font-size: 11px; font-weight: 700;
    color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .cc-kv {
    display: flex; gap: 10px; padding: 7px 0; font-size: 12px;
    border-bottom: 1px solid var(--border-light);
  }
  .cc-kv:last-child { border-bottom: 0; }
  .cc-k { min-width: 60px; color: var(--text-tertiary); }
  .cc-v { color: var(--text-primary); flex: 1; }

  .cc-cf-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 0; font-size: 13px; cursor: pointer;
    border-bottom: 1px dashed var(--border-light);
  }
  .cc-cf-row:last-child { border-bottom: 0; }
  .cc-cf-row:hover .cc-cf-text { color: var(--cmu-red); }
  .cc-cf-badge {
    font-size: 10px; font-weight: 800;
    padding: 3px 7px; border-radius: 4px;
    color: #fff; min-width: 28px; text-align: center;
  }
  .cc-cf-cs { background: var(--major-cs); }
  .cc-cf-is { background: var(--major-is); }
  .cc-cf-ba { background: var(--major-ba); }
  .cc-cf-bs { background: var(--major-bs); }
  .cc-cf-text  { flex: 1; color: var(--text-primary); }
  .cc-cf-arrow { color: var(--text-tertiary); font-size: 14px; }

  .cc-desc { padding: 0 20px 18px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; }
  .cc-card > .cc-section:last-child .cc-desc { padding-left: 0; padding-right: 0; }

  .cc-empty { font-size: 12px; color: var(--text-tertiary); font-style: italic; }
  .cc-more { background: none; border: 0; color: var(--major-ba); font-size: 11px; cursor: pointer; padding: 4px 0; }

  .cc-dm-pill { display: inline-block; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 4px; font-weight: 700; }
  .cc-dm-remote   { background: #eef2ff; color: #4338ca; }
  .cc-dm-inperson { background: #ecfdf5; color: #047857; }
  .cc-dm-other    { background: var(--bg-secondary); color: var(--text-secondary); }

  @media (max-width: 700px) {
    .cc-cols { grid-template-columns: 1fr; gap: 16px; padding: 14px 16px; }
    .cc-head { padding: 14px 16px 10px; }
    .cc-section-cf { padding: 0 16px 14px; }
    .cc-desc { padding: 0 16px 14px; }
  }
  ```

- [ ] **Step 2: Remove old course-card CSS.** Search `grep -n "course-card-v2\|cc2-" css/styles.css` and remove matching blocks. Be careful not to nuke any shared selectors — preview each removal.

- [ ] **Step 3: Reload, search "15-122", "21-127", "70-122"**, visually verify all three render correctly. Test at 375 px width — 2-col grid should collapse to 1 col.

- [ ] **Step 4: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: course card spec-sheet CSS"
  ```

---

## Phase E — Requirement tree

Spec § 4.5.

### Task 11: Add `pickAccentColor` pure function with tests

**Files:**
- Modify: `js/data.js` (append near `MAJOR_ORDER` constant)
- Modify: `tests/data.test.js` (append new test block)

- [ ] **Step 1: In `tests/data.test.js`, add the failing tests first** (TDD):

  ```js
  // === pickAccentColor (spec § 4.5) ===

  test('pickAccentColor: math nodes get purple', () => {
    assertEqual(pickAccentColor('Math & Probability', 'CS'), '#6b21a8');
    assertEqual(pickAccentColor('Probability Theory', 'CS'), '#6b21a8');
  });

  test('pickAccentColor: humanities/arts/gened get amber', () => {
    assertEqual(pickAccentColor('Humanities & Arts', 'CS'), '#B45309');
    assertEqual(pickAccentColor('GenEd Distribution', 'CS'), '#B45309');
  });

  test('pickAccentColor: electives/technical get green', () => {
    assertEqual(pickAccentColor('Technical Electives', 'CS'), '#047857');
    assertEqual(pickAccentColor('Elective Pool', 'CS'), '#047857');
  });

  test('pickAccentColor: core/required falls back to major brand', () => {
    assertEqual(pickAccentColor('CS Core', 'CS'), '#C41230');
    assertEqual(pickAccentColor('Required Courses', 'BA'), '#2563EB');
  });

  test('pickAccentColor: unknown label uses major brand', () => {
    assertEqual(pickAccentColor('Something Random', 'IS'), '#D97706');
    assertEqual(pickAccentColor('Foo Bar', 'BS'), '#059669');
  });

  test('pickAccentColor: case-insensitive matching', () => {
    assertEqual(pickAccentColor('MATH & PROBABILITY', 'CS'), '#6b21a8');
    assertEqual(pickAccentColor('humanities & arts', 'CS'), '#B45309');
  });
  ```

- [ ] **Step 2: Open `tests/test.html` in the browser, verify the new tests FAIL** with "pickAccentColor is not defined".

- [ ] **Step 3: In `js/data.js`, near the top (next to `MAJOR_ORDER`), add the implementation**:

  ```js
  const MAJOR_BRAND = {
    CS: '#C41230',
    IS: '#D97706',
    BA: '#2563EB',
    BS: '#059669',
  };

  // spec § 4.5: pick a tree section accent color from the node label.
  // First match in this ordered list wins.
  const ACCENT_RULES = [
    { match: /math|probabil/i,           color: '#6b21a8' },
    { match: /elective|technical/i,      color: '#047857' },
    { match: /humanit|arts|gened/i,      color: '#B45309' },
    { match: /science|lab/i,             color: '#047857' },
    { match: /core|required/i,           color: null /* major brand */ },
  ];

  function pickAccentColor(label, activeMajor) {
    const brand = MAJOR_BRAND[activeMajor] || '#C41230';
    if (!label) return brand;
    for (const rule of ACCENT_RULES) {
      if (rule.match.test(label)) {
        return rule.color || brand;
      }
    }
    return brand;
  }
  ```

- [ ] **Step 4: Reload `tests/test.html`** — all six `pickAccentColor` tests should PASS, plus the existing 26 still pass (total: 32).

- [ ] **Step 5: Commit**

  ```bash
  git add js/data.js tests/data.test.js
  git commit -m "feat(data): pickAccentColor for tree section accent bars"
  ```

### Task 12: Rewrite `renderTreeNode` for card-grouped top-level nodes

**Files:**
- Modify: `js/app.js:1103-1236` (`renderTree` + `renderTreeNode`)

- [ ] **Step 1: Modify `renderTreeNode` to wrap depth-0 nodes in a card.** The simplest change is to special-case `depth === 0`. Replace `renderTreeNode` with the version below — note the new `cardOpen` branch:

  ```js
    renderTreeNode(node, major, depth) {
      const hasChildren = node.children && node.children.length > 0;
      const hasCourses = node.courses && node.courses.length > 0;
      const isExpandable = hasChildren || hasCourses;
      const expanded = this.isExpanded(major, node.path);
      const isHighlighted = this.highlightedPath === node.path;

      const matchesSearch = this.nodeMatchesSearch(node);
      if (this.treeSearchQuery && !matchesSearch) return '';

      const filteredCourses = (node.courses || []).filter(c => this.filterByLocation(c));
      const filteredTotalCourses = this.countFilteredCourses(node);

      const ruleHtml = node.rule ? `<span class="tr-rule">${esc(node.rule.label)}</span>` : '';
      const countHtml = (!expanded && filteredTotalCourses > 0 && isExpandable)
        ? `<span class="tr-count">${filteredTotalCourses} courses</span>`
        : '';
      const safePath = node.path.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      // ── Depth 0: render as a card ─────────────────────────────
      if (depth === 0) {
        const accent = pickAccentColor(node.label, major);
        const openCls = expanded ? 'open' : '';
        const cardHead = `
          <div class="tr-card-head ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}">
            <span class="tr-arrow ${expanded ? 'expanded' : ''}">▶</span>
            <span class="tr-accent" style="background:${accent}"></span>
            <span class="tr-card-title">${esc(node.label)}</span>
            <span class="tr-card-meta">${ruleHtml}${countHtml}</span>
          </div>`;
        let body = '';
        if (isExpandable && expanded) {
          let inner = '';
          if (hasChildren) {
            for (const child of node.children) inner += this.renderTreeNode(child, major, depth + 1);
          }
          if (hasCourses) {
            for (const c of filteredCourses) inner += this._renderLeafCourse(c, major);
          }
          body = `<div class="tr-card-body">${inner}</div>`;
        }
        return `<div class="tr-card ${openCls}" style="--tr-accent:${accent}">${cardHead}${body}</div>`;
      }

      // ── Depth ≥ 1: regular sub-node ──────────────────────────
      const indent = (depth - 1) * 14;
      let html = `<div class="tr-sub" style="padding-left:${indent}px">`;
      html += `<div class="tr-sub-row ${isHighlighted ? 'highlighted' : ''}" data-tree-major="${major}" data-tree-path="${safePath}">`;
      html += `<span class="tr-arrow ${expanded ? 'expanded' : ''} ${!isExpandable ? 'leaf' : ''}">▶</span>`;
      html += `<span class="tr-sub-label">${esc(node.label)}</span>`;
      html += ruleHtml;
      html += countHtml;
      html += `</div>`;
      if (isExpandable) {
        html += `<div class="tr-children ${expanded ? '' : 'collapsed'}">`;
        if (hasChildren) {
          for (const child of node.children) html += this.renderTreeNode(child, major, depth + 1);
        }
        if (hasCourses) {
          for (const c of filteredCourses) html += this._renderLeafCourse(c, major);
        }
        html += `</div>`;
      }
      html += `</div>`;
      return html;
    },

    _renderLeafCourse(c, major) {
      const fullCourse = this.courseIndex[c.code] || c;
      const isActive = this.selectedCourse && this.selectedCourse.course_code === c.code;
      const vm = computeViewMode(this.profile);

      let dcTag = '';
      if (vm === 'focused-dual' && fullCourse._doubleCounter) {
        const other = (this.profile.secondary === major) ? this.profile.primary : this.profile.secondary;
        if (other) dcTag = `<span class="tr-leaf-tag tr-leaf-tag-${other.toLowerCase()}">${other}</span>`;
      }
      let mpChip = '';
      if (vm === 'cross-program' && (fullCourse._programCount || 0) >= 3) {
        mpChip = `<span class="tr-mp-chip">${fullCourse._programCount} programs</span>`;
      }
      const alsoMajors = (vm !== 'focused-dual' && vm !== 'cross-program') ? getAlsoCountsFor(fullCourse, major) : [];
      const alsoHtml = alsoMajors.length
        ? `<span class="tr-also">${alsoMajors.map(m => `<span class="tr-leaf-tag tr-leaf-tag-${m.toLowerCase()}">${m}</span>`).join('')}</span>`
        : '';

      return `
        <div class="tr-leaf ${isActive ? 'active' : ''}" data-course-code="${esc(c.code)}">
          <span class="tr-leaf-code">${esc(c.code)}</span>
          <span class="tr-leaf-name">${esc(c.name)}</span>
          ${c.units ? `<span class="tr-leaf-units">${c.units}u</span>` : ''}
          ${alsoHtml}${dcTag}${mpChip}
        </div>`;
    },
  ```

- [ ] **Step 2: Update `renderTree`** (above `renderTreeNode`) to no longer add the old `tree-section-header` H2 between degree/gened groupings — the card heads now serve that role. Locate the function (around line 1103) and simplify it so it just iterates the top-level nodes:

  ```js
    renderTree() {
      const rightBody = document.getElementById('rightBody');
      if (!rightBody) return;
      const sections = this.treeSections[this.activeMajor];
      if (!sections) { rightBody.innerHTML = ''; return; }
      let html = '';
      // degree + gened both render as flat list of cards — no section headers
      for (const node of [...sections.degree, ...sections.gened]) {
        html += this.renderTreeNode(node, this.activeMajor, 0);
      }
      rightBody.innerHTML = html;
    },
  ```

  (If the existing `renderTree` had additional logic — like a "No requirements" empty state — preserve it.)

- [ ] **Step 3: Reload, click the right-panel Browse to open the tree.** Verify:
  - Top-level nodes (CS Core, Math, Tech Electives, etc.) render as cards with colored accent bars.
  - Math accent purple, electives green, humanities amber, others CS-red.
  - Expand a card → sub-nodes and leaf courses appear inside.
  - Leaf rows show monospace code, name, units, and the BA double-counter tag where applicable.

- [ ] **Step 4: Commit**

  ```bash
  git add js/app.js
  git commit -m "feat(tree): card-grouped sections with colored accent bars"
  ```

### Task 13: CSS for the card-grouped tree

**Files:**
- Modify: `css/styles.css` — append new `.tr-*` block; remove old `.tree-*` block

- [ ] **Step 1: Append the new tree CSS**:

  ```css
  /* === Requirement tree (spec § 4.5) === */
  .tr-card {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    transition: box-shadow 120ms;
  }
  .tr-card.open { box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
  .tr-card-head {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 16px;
    background: linear-gradient(180deg, var(--bg-card), var(--bg-secondary));
    cursor: pointer;
    border-bottom: 1px solid transparent;
  }
  .tr-card.open .tr-card-head { border-bottom-color: var(--border-light); }
  .tr-card-head:hover { background: var(--bg-secondary); }
  .tr-card-head.highlighted { background: var(--bg-highlight); }
  .tr-arrow { font-size: 9px; color: var(--text-tertiary); width: 12px; display: inline-block; transition: transform 150ms; }
  .tr-arrow.expanded { transform: rotate(90deg); }
  .tr-arrow.leaf { visibility: hidden; }
  .tr-accent { width: 4px; height: 22px; border-radius: 2px; flex-shrink: 0; }
  .tr-card-title { flex: 1; font-size: 15px; font-weight: 700; color: var(--text-primary); }
  .tr-card-meta  { display: flex; align-items: center; gap: 8px; }
  .tr-rule {
    font-size: 10px; font-weight: 700;
    padding: 3px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--tr-accent, var(--cmu-red)) 10%, transparent);
    color: var(--tr-accent, var(--cmu-red));
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .tr-count { font-size: 11px; color: var(--text-secondary); font-weight: 600; }

  .tr-card-body { padding: 6px 12px 10px; }

  .tr-sub { padding: 0 0 4px; }
  .tr-sub-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: 7px; cursor: pointer;
  }
  .tr-sub-row:hover { background: var(--bg-secondary); }
  .tr-sub-row.highlighted { background: var(--bg-highlight); }
  .tr-sub-label { flex: 1; font-size: 13px; font-weight: 600; color: var(--text-primary); }
  .tr-children { padding-left: 14px; border-left: 2px solid var(--border-light); margin-left: 8px; }
  .tr-children.collapsed { display: none; }

  .tr-leaf {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 7px; cursor: pointer;
    border-left: 2px solid var(--border-light);
    margin-left: 8px;
  }
  .tr-leaf:hover  { background: var(--bg-secondary); }
  .tr-leaf.active { background: var(--bg-highlight); border-left-color: var(--cmu-red); }
  .tr-leaf-code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px; font-weight: 700;
    color: var(--cmu-red); min-width: 56px;
  }
  .tr-leaf-name  { flex: 1; font-size: 12.5px; color: var(--text-primary); line-height: 1.3; }
  .tr-leaf-units { font-size: 11px; color: var(--text-secondary); }
  .tr-leaf-tag {
    font-size: 10px; font-weight: 800;
    padding: 2px 7px; border-radius: 4px; color: #fff;
  }
  .tr-leaf-tag-cs { background: var(--major-cs); }
  .tr-leaf-tag-is { background: var(--major-is); }
  .tr-leaf-tag-ba { background: var(--major-ba); }
  .tr-leaf-tag-bs { background: var(--major-bs); }
  .tr-mp-chip { font-size: 10px; padding: 2px 7px; border-radius: 999px; background: var(--bg-secondary); color: var(--text-secondary); font-weight: 600; }
  .tr-also { display: inline-flex; gap: 4px; }
  ```

- [ ] **Step 2: Remove old tree CSS.** Search `grep -n "tree-node\|tree-label\|tree-course\|tree-arrow\|tree-children\|tree-section-header\|rule-chip\|course-count\|dc-leaf-tag\|mp-chip\|also-tag" css/styles.css` and delete matching blocks (carefully — don't kill anything still referenced elsewhere).

- [ ] **Step 3: Reload and click around the tree.** Pay attention to:
  - Top-level cards have colored accent bars.
  - Expanding/collapsing animates the arrow.
  - Leaf rows show the monospace code in CMU red.
  - Active course (last clicked from the tree) gets a colored left border.
  - Hover states are visible but subtle.
  - At 375 px, the layout remains usable.

- [ ] **Step 4: Commit**

  ```bash
  git add css/styles.css
  git commit -m "style: card-grouped tree CSS with accent bars and leaf rails"
  ```

---

## Phase F — Verification & cleanup

### Task 14: Walk the 12-point acceptance criteria from spec § 7

**Files:** none (verification only)

- [ ] **Step 1: With `localStorage.clear(); location.reload();`** — complete onboarding as **CS + BA student**. From here, verify each criterion:

  1. **One "Find a course." headline.** Inspect the home — no "What does this course count for?" anywhere. ✓
  2. **Search placeholder reads `Try "15-122" or "Probability"`** and is fully readable. Resize the browser to 320 px and verify nothing clips.
  3. **No "Try a course" chips.** Search the DOM for `.es-try` — should return zero matches.
  4. **Browse-requirements button present**, full-width, dark, two-line label. Click it — should open the tree at CS.
  5. **Insight banner shows the count** as a 40 px numeral. Clicking opens the double-counter list view (verify by clicking).
  6. **Course card has spec-sheet layout.** Search "15-122". Verify the section order: header → About/Fall 2026 → Counts For → Description.
  7. **Tree top-level nodes render as cards** with colored accent bars. Open the tree, scroll to confirm CS Core has a red bar, Math has purple, etc.
  8. **Text contrast.** Open DevTools, run `getComputedStyle(document.body).color` — should return `rgb(26, 26, 26)`. Spot-check `.cc-k`, `.cc-h4` — each should resolve to `#6a6a6a` or darker.
  9. **No decorative emojis.** Visually scan onboarding, navbar, home, course card, tree. Only functional emojis allowed: 🔍 (search), 🇶🇦 / 🇺🇸 (location flags), 🌙 / ☀️ (theme), 🗂 (browse / map). No ⭐ ✨ ✦ ⚡ anywhere.
  10. **Onboarding splash single screen** — already verified in Task 5. Re-confirm: no "Step 1 of 2".
  11. **Mobile (375 px).** Use DevTools device emulation (iPhone SE / 375×667). Walk through: onboarding → home → click course → view card → click "Counts for" row → tree opens. Each step should remain usable.
  12. **All 26 existing tests pass + 6 new ones.** Open `http://localhost:8080/tests/test.html`. Should report `32 passed · 0 failed`.

- [ ] **Step 2: For any criterion that fails**, file a follow-up — either fix inline (small CSS tweaks) or note for a separate task.

- [ ] **Step 3: Run all four role flows to be sure** (`localStorage.clear()` between each):
  - `{role:'student', primary:'CS', secondary:'BA'}` → focused-dual home with insight banner.
  - `{role:'student', primary:'CS', secondary:null}` → focused-single home, no insight banner.
  - `{role:'professor', primary:'CS', secondary:null}` → focused-single, browse subtitle says "CS requirement tree", lead says "in the program you teach".
  - `{role:'area_head', primary:null, secondary:null}` → cross-program home, multi-program banner replaces the dc banner.

- [ ] **Step 4: Commit verification artifacts.** If any small fixes were made during the walk, commit them with a short message; otherwise skip the commit step:

  ```bash
  git status   # see if anything was changed
  # If yes:
  git add -A
  git commit -m "fix: address Phase F verification issues"
  ```

### Task 15: Remove dead code and orphan CSS

**Files:**
- Modify: `js/app.js`, `css/styles.css`

- [ ] **Step 1: Final dead-code sweep.** Run:

  ```bash
  grep -nE "_renderEmptyDual|_renderEmptySingle|_renderEmptyCross|_pickTryCourses|expandSemestersV2|_renderOnboardingStep|_renderOnboardingRole|_renderOnboardingStudentProgram|_renderOnboardingProfessorProgram|_pickStudentMajor|_pickStudentMinor|_pickProfProgram" js/app.js
  ```

  Expected: zero matches. If any survive, remove them.

- [ ] **Step 2: Orphan CSS sweep.** Run:

  ```bash
  grep -nE "empty-state-v2|es-hero|es-cards|es-card|es-try|cc2-|course-card-v2|tree-node|tree-label|tree-course|tree-arrow|tree-children|onboarding-option|onboarding-question|onboarding-step-label" css/styles.css
  ```

  Expected: zero matches.

- [ ] **Step 3: Run tests one more time** — `http://localhost:8080/tests/test.html` should still show `32 passed · 0 failed`.

- [ ] **Step 4: Commit if anything was removed:**

  ```bash
  git add js/app.js css/styles.css
  git commit -m "chore: remove dead code and orphan CSS from pre-overhaul"
  ```

---

## Done

The branch is ready for PR. Title suggestion: `feat: UI/UX overhaul — onboarding, home, card, tree, contrast pass`. Body should reference both the spec (`docs/superpowers/specs/2026-05-11-ui-ux-overhaul-design.md`) and this plan.
