# Role-Aware Onboarding & UI Density Redesign

**Date:** 2026-05-10
**Status:** Approved for implementation planning
**Scope:** Single combined spec — onboarding flow, role-based filtering, double-counter discovery, course-card and tree redesign all ship together.

---

## 1. Problem

CountsFor today shows all four CMU-Q programs (CS / IS / BA / BS) to every visitor. In practice, students and program-tied professors only care about the one or two programs that affect their degree, so the other tabs are noise. Area heads and Arts & Sciences professors *do* want the cross-program view because their job is to make sure courses serve multiple majors.

Layered on top: the current visual treatment is small (10–11px body, decorative whitespace) and treats the data as a directory rather than a decision aid. Students struggle to spot courses that fill multiple buckets at once — the most actionable insight in the data.

This spec adds a one-time onboarding flow that asks "who are you?", then renders one of three view modes against a redesigned, denser UI that highlights the user's actual decision: *which course should I take next?*

---

## 2. Goals

1. **Personalize what's shown** — students and program-tied professors see only the programs that affect them; area heads and Arts & Sciences professors see the cross-program view.
2. **Surface double-counters** — for students with a major + minor, courses that fill requirements in both programs are highlighted in search, the requirement tree, and the course card.
3. **Make the UI denser and easier to read** — bigger primary type, less wasted whitespace, single-column course card, larger touch targets in the tree.
4. **Stay zero-dependency** — vanilla JS, no build step, no new packages.

## 3. Non-goals

- Personalized planner (track completed courses, recommend next). Future spec.
- Real CMU-Q minor catalog data. Minors map to the existing 4 programs.
- Server-side profile persistence. localStorage only.
- Deep links (`?role=student&primary=CS&minor=BA`). Defer.
- Per-program color theming beyond existing `--major-cs/is/ba/bs` palette.

---

## 4. User model

### Roles
- **Student** — picks a major (CS / IS / BA / BS) and an *optional* minor from the same four.
- **Professor** — picks one of CS / IS / BA / BS / **AS** (Arts & Sciences / Cross-program). The AS option is for faculty in English (76-xxx), History (79-xxx), Philosophy (80-xxx), Languages (82-xxx) and other departments whose courses count across all four majors.
- **Area Head** — no follow-up. Direct to cross-program view.

### View modes (derived from role + program selections)
| Mode | Triggered by | What renders |
|------|--------------|--------------|
| `focused-dual` | Student with both major and minor | Two program tabs (major + minor); double-counter highlights everywhere |
| `focused-single` | Student with no minor, or program-tied professor (CS/IS/BA/BS) | One program tab; no double-counter logic |
| `cross-program` | Area head, or Arts & Sciences professor | All four program tabs; optional "multi-program" badges on courses appearing in 3+ programs |

### A "double-counter" course
For a focused-dual user with primary `P` and secondary `S`, a course is a double-counter if both `course.requirements[P]` and `course.requirements[S]` exist and are non-empty. Computed once after data load, attached to each course as `course._doubleCounter = true`.

---

## 5. Architecture

### State extension (`js/app.js`)
```js
App.profile = {
  role: null,           // 'student' | 'professor' | 'area_head'
  primary: null,        // 'CS' | 'IS' | 'BA' | 'BS' | 'AS'
  secondary: null,      // 'CS' | 'IS' | 'BA' | 'BS' | null
  viewMode: null,       // 'focused-dual' | 'focused-single' | 'cross-program' (derived)
};
```

### New file: `js/profile.js`
Loaded after `data.js`, before `api.js`. Exports:
- `loadProfile()` — reads `cf_role`, `cf_primary`, `cf_secondary` from localStorage; returns `null` if missing or invalid.
- `saveProfile(profile)` — writes the three keys.
- `clearProfile()` — used only for the role-edit cancel path.
- `computeViewMode(profile)` — pure function: returns one of the three modes from role + primary + secondary.
- `validateProfile(profile)` — defensive checks (Section 11).

Keeps `app.js` from growing further. Existing 4-file load order becomes 5: `utils.js → data.js → profile.js → api.js → app.js`.

### `js/data.js` additions
- `annotateDoubleCounters(courses, profile)` — walks all courses and sets `course._doubleCounter = true` when applicable. Called from `App.loadData()` after `buildCourseIndex`, AND re-called from the role-edit `finish()` path whenever the profile changes (since the set of double-counters is profile-dependent). No-op for `focused-single` and `cross-program` modes — clears any stale annotations from a previous profile.
- `annotateMultiProgram(courses)` — walks all courses, sets `course._programCount = N` (count of `requirements` keys with non-empty arrays). Profile-independent; called once after data load and never again. Used only by `cross-program` view's optional badge.

### `AS` code handling
`'AS'` is a marker for "this profile views cross-program," not a key in `course.requirements`. The data file only contains `CS / IS / BA / BS` keys. Anywhere code looks up `course.requirements[primary]`, it must short-circuit when `primary === 'AS'` and treat the user as cross-program. Practically, this is handled by routing `viewMode` decisions through `computeViewMode()` so individual renderers never need to special-case `AS`.

### View mode dispatch
`App.init()` flow:
1. Apply theme.
2. `App.profile = loadProfile()`.
3. If profile is `null` → `renderOnboarding()`. Done. Course data load happens after onboarding completes.
4. If profile exists → `renderShell()` (existing path), then `loadData()`.

`App.renderShell()` becomes role-aware:
- Major tabs: filtered to `[primary, secondary]` (focused-dual), `[primary]` (focused-single), or all four (cross-program).
- Empty state: dispatched by mode.
- Navbar: includes the new role badge.

---

## 6. Onboarding flow

### Trigger
Rendered into `#app` on first visit, or when the navbar role badge is clicked. Full-viewport overlay with linear-gradient background `#C41230 → #7a0a1d`.

### State machine
```
step: 'role'
  ↓ pick Student → step: 'student-program'
  ↓ pick Professor → step: 'professor-program'
  ↓ pick Area Head → finish() (skip step 2)

step: 'student-program'
  ↓ Continue → finish()

step: 'professor-program'
  ↓ Continue → finish()
```

`finish()`:
1. Computes `viewMode`.
2. Calls `saveProfile()`.
3. Sets `App.profile`.
4. Calls `App.renderShell()` then `App.loadData()` (first-time) or just re-renders the shell (edit flow).

### Step 1 — Role
Three large rounded cards, vertical stack on mobile, horizontal row on desktop:
- Student
- Professor
- Area Head

No emojis. Plain typography, weight 700, white text on the gradient. Hover: white-fill, role-color text.

### Step 2 — Student program picker (single screen)
Two stacked sections in one viewport:
- **MAJOR** label + 4 buttons (CS / IS / BA / BS)
- **MINOR — optional** label + 5 buttons (None / CS / IS / BA / BS)
- The button matching the selected major is auto-disabled in the minor row (prevents self-selection).
- "Continue" button is disabled until a major is selected. Defaults to "None" minor if not picked.

### Step 2 — Professor program picker
Single row of 5 buttons: CS / IS / BA / BS / **Arts & Sciences (Cross-program)**. The fifth option is wider with subtext: "I teach courses that apply across all programs." Picking it sets `primary='AS'` → `viewMode='cross-program'`.

### Step 2 — Area Head
Skipped. `finish()` called directly from step 1.

### Edit flow (navbar role badge clicked later)
- Same splash renders.
- Pre-selects the user's current answers.
- Adds a small "Cancel" link in the bottom-right corner. Clicking it returns to the app without writing.
- "Continue" updates localStorage and re-renders.
- The only difference from first-time onboarding is the Cancel link's presence.

---

## 7. Three view modes

After onboarding, `App.profile.viewMode` controls the rest of the UI.

### `focused-dual`
- Major tabs: only `[primary, secondary]`. Default active tab = primary. Secondary tab shows "(minor)" in muted weight 500 next to its code.
- Empty state of the left panel: hero header + search + two role cards (major / minor) + double-counter banner (Section 8).
- Course card: shows the **double-counter banner** at the top when the displayed course satisfies both programs (Section 9).
- Tree leaf rows: append a small `[secondary]` color tag at the end of any row whose course is a double-counter.
- Search typeahead: same `[secondary]` color tag appended to double-counter results.

### `focused-single`
- Major tabs: only `[primary]`.
- Empty state: hero + search + one full-width "Your program" card (no minor card, no banner).
- Course card: no double-counter banner anywhere (nothing to compare against).
- Tree and typeahead: identical to `cross-program` minus the multi-program badge.

### `cross-program`
- Major tabs: all four (CS / IS / BA / BS). Identical structure to today.
- Empty state: hero + search + a single "All programs" summary card.
- Optional addition: courses with `_programCount >= 3` get a neutral chip reading `3 programs` or `4 programs` in tree leaf rows and typeahead. No special character.

### Switching modes
Only via the role-edit flow. View mode is otherwise stable for the session.

---

## 8. Empty-state home view

The "left panel before any course is searched" page they land on after onboarding (and after clicking the brand to reset).

### Focused-dual layout (CS major + BA minor example)
```
┌─────────────────────────────────────────┐
│  What does this course count for?       │  hero header, 24px weight 800
│  Search any of 1,727 CMU-Q courses      │  subtitle, 12px muted
│  ┌────────────────────────────────────┐ │
│  │  🔍   e.g. 15-122, calculus…       │ │  search box, 2.5px CMU red border
│  └────────────────────────────────────┘ │
│                                         │
│  ┌────────────┐  ┌────────────┐         │
│  │ YOUR MAJOR │  │ YOUR MINOR │         │  two role cards, side by side
│  │   CS       │  │   BA       │         │  CS card: red border + faint tint
│  │   Computer │  │   Business │         │  BA card: blue border + faint tint
│  │   Science  │  │   Admin    │         │
│  │   62 / 5b  │  │   38 / 4b  │         │  course count / bucket count
│  └────────────┘  └────────────┘         │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ ▌ [CS] [BA]  14 courses count   │    │  banner: gradient red→blue, 3px
│  │   for BOTH your CS and BA       │    │  left accent bar, no emoji,
│  └─────────────────────────────────┘    │  inline color badges
│                                         │
│  Try a course                           │  small "starter" chips
│  [15-122] [21-259] [73-102] [70-311]    │  populated from double-counter set
└─────────────────────────────────────────┘
```

### Focused-single layout
Same hero + search. Single full-width "Your program" card replaces the two halves. No banner. Try-a-course chips: 5 course codes selected as the first 5 courses appearing in the primary program's tree under the first "Core" / "Required" bucket, in tree order.

### Cross-program layout
Hero + search. Compact "All programs" summary card. Course count is dynamic: `${App.courses.length} courses across CS · IS · BA · BS` — read from the loaded data, not hardcoded. No role cards. Try-a-course chips: 5 codes pulled from courses with `_programCount >= 3` (cross-cutting GenEds, the most useful entry points for an area head).

### Click handlers
- "Your major" card → `enterExplorer(primary)`.
- "Your minor" card → `enterExplorer(secondary)`.
- Banner → renders the **double-counter list view** (described below) into the left panel body.
- Try-a-course chip → loads that course into the card.

### Try-a-course chip fallback
If the primary computation yields fewer than 5 courses (e.g., a focused-dual user whose major + minor combination has no double-counters at all, or a cross-program view with no `_programCount >= 3` courses), backfill from the existing hardcoded examples (`15-122`, `21-259`, `73-102`, `67-262`, `70-311`) used in the current empty state. Never show fewer than 3 chips.

### Double-counter list view
When the banner is clicked, the left panel body is replaced with a filtered list of all double-counter courses for the user's profile. Each row:
- Course code (monospace bold) + course name
- Both color badges (CS, BA) inline
- Units pill
- Two small grey chips listing the requirement names this course fills in primary and secondary
- Click → loads the course's full card (replacing the list)

Header of the list view: a back link reading "← Back to home" + the count ("14 courses").

---

## 9. Course card redesign

Replaces the current 2-column split (`cc-grid`) with a vertically-flowing layout.

### Vertical order
1. **Double-counter banner** — focused-dual mode only, when the displayed course is a double-counter.
2. **Header block** — course code (32px JetBrains Mono weight 800, CMU red, letter-spacing -1px), units pill inline-baseline, course name (18px weight 700), department/location/semester pills row.
3. **Counts For section** — section title, then one row per requirement.
4. **2-column block** — Prerequisites (left) and Fall 2026 schedule (right) side-by-side.
5. **Description** — full text, 12px line-height 1.5.

### Double-counter banner (Section 5 revised)
- 3px-wide vertical accent bar on the left, gradient `--major-cs → --major-ba` (or whichever primary/secondary).
- Inline: two small color-filled badges (`[CS]` red, `[BA]` blue), 11px bold.
- Body text: 12px weight 700, "Counts for both your `<primary>` major and `<secondary>` minor".
- Subtle gradient background (~1% red → 1% blue), 1.5px solid neutral border, 8px radius.
- No emoji.

### Counts For row
- 2px solid colored border (program color), light tint background, 9×11px padding, 8px radius.
- Inside: large color badge (11px bold) + small `CORE` / `GEN ED` tag + requirement text (13px) + arrow `→` on the right pulling the click target.
- Click enters explorer mode and navigates to that requirement (existing behavior).

### Prereq + Schedule block
- 2-column grid, equal widths, 14px gap.
- Section titles 11px bold (no all-caps letterspacing).
- Schedule shows the *first* section prominently with a delivery-mode pill: `IN-PERSON` (green chip), `REMOTE` (blue chip), `HYBRID` (purple chip). "+N more sections" link below if more exist; expands inline.
- If no sections in active location, italic muted "Not offered at [location] for Fall 2026".

### What's removed
- The 2-column outer grid (`cc-grid`). Single column flow with one nested 2-col for prereq/schedule only.
- The `sched-container` side-by-side Qatar/Pittsburgh tables. Replaced by a single section block driven by `App.locationFilter`. If filter = "all" and the course has both locations, render two compact subgroups stacked.
- The "+N" semester pill click-to-expand. Replaced by inline expansion on a single "Offered F25 · M25 · S25 · +7" pill.

### Sizing rules applied throughout the card
- Body text: 13px (up from ~10–11px).
- Section titles: 11px bold (down from 9–10px all-caps + letterspacing — denser visual weight).
- Padding *inside* cards: increases. Padding *between* sections: decreases. Net: bigger and denser.

---

## 10. Requirement tree redesign

### Major tab bar
- 13px bold, 10×16px padding (up from current ~10×12px).
- Active tab: 3px bottom border in major color + tinted background.
- Focused-dual: only `[primary, secondary]` tabs render; secondary gets `(minor)` muted suffix.
- Focused-single: only `[primary]`.
- Cross-program: all four.
- The `×` close button on the far right gets a hover background and is 4px larger.

### Tree node row
- Height: 28px → 36px.
- Indent: 18px per depth → 24px.
- Label: 14px weight 700 at depth 0; 13px weight 600 deeper.
- Rule chip ("take all", "≥19 units", "pick 1"): 11px bold, 4×10px padding, more saturated background. Sits to the right of the label.
- Course count ("12 courses"): 12px weight 600, muted, right-aligned.
- Expand arrow: 9–10px → 12px, rotates 90° when expanded.

### Tree section dividers
- "Degree Requirements" / "General Education": 11px all-caps weight 800, letter-spacing 1px. Add a 1px horizontal rule below it (30% opacity neutral) for structural separation.

### Leaf course row
- 36px height. 14px monospace bold for code; 13px for name; 12px weight 600 for units.
- Active course (currently displayed in left card): 2px solid border in major color + tinted bg.
- Hover: subtle bg tint + 3px left-edge color stripe.
- Focused-dual: small `[secondary]` color tag at end of row when course is a double-counter.
- Cross-program (optional): small neutral chip `3 programs` / `4 programs` when `_programCount >= 3`.

### Tree filter input
- 14px font, 12×14px padding, 8px radius.

### What's removed
- Tiny 9–10px arrows.
- Leaf placeholder arrows (no arrow at all for non-expandable rows; row starts at indent).

---

## 11. Navbar & role-edit flow

### Layout left → right
1. **Brand** — `CountsFor` (red, 18px bold) + `CMU-Q` subtitle pill. Click → home empty state.
2. **Role badge** (NEW) — sits after the brand. Examples:
   - Focused-dual: `CS · BA minor` — left half tinted red, right half tinted blue, hairline divider.
   - Focused-single (student): `CS major` — solid red-tinted chip.
   - Focused-single (faculty): `CS · Faculty` — same chip with `Faculty` muted weight 500.
   - Cross-program (area head): `Area Head · All programs` — neutral grey-blue chip.
   - Cross-program (A&S faculty): `Arts & Sciences · Faculty` — neutral chip.
   - Click → re-enter onboarding splash with previous answers pre-selected.
   - Hover: subtle outline + small "Edit" text appears on the right.
3. **Location toggle** (existing) — `All / 🇶🇦 Qatar / 🇺🇸 Pittsburgh`. Bigger: 12px font, 8×14px padding.
4. **Theme toggle** (existing) — bigger hit area.

### Sizing
Navbar height: 52px → 64px. Mobile breakpoint (<860px): role badge wraps to a second line below the brand.

### Role-edit flow
- Same splash, gradient and all.
- Step 1 loads with current role pre-highlighted.
- Step 2 loads with current major/minor pre-selected.
- "Continue" updates localStorage and re-renders the shell.
- Bottom-right "Cancel" link returns to the app without writing. Only present in edit flow, not first-run.
- Same component, conditional render based on whether `cf_role` already exists.

---

## 12. Edge cases

### localStorage compatibility
- Existing key `cf_theme` is untouched.
- New keys: `cf_role`, `cf_primary`, `cf_secondary`. Independent of theme. Clearing them does not clear theme.

### Profile validation (in `validateProfile()`)
- If `cf_primary` is not in `['CS','IS','BA','BS','AS']` → treat profile as missing, re-onboard.
- If `cf_role === 'student'` and `cf_secondary === cf_primary` → drop secondary (defensive; UI prevents this but localStorage is editable).
- If `cf_role === 'professor'` and `cf_primary === 'AS'` → force `viewMode = 'cross-program'`.
- If `cf_role` is not in `['student','professor','area_head']` → treat as missing, re-onboard.

### Data fetch ordering
- Onboarding splash renders synchronously; no need to wait for course data.
- `annotateDoubleCounters()` runs after course data loads. Result attached to the in-memory `App.courses` array.
- If onboarding finishes before data loads, the home view shows the existing spinner pattern with "Loading 1,727 courses…" inside the redesigned shell.

### Mobile (≤860px)
- Onboarding splash: same gradient, single column, full-width stacked program buttons.
- Role badge: wraps to its own line below the brand.
- Empty-state role cards: stack vertically (1 column).
- Banner stays horizontal (truncates text gracefully).
- Course card single-column flow already works for mobile.
- Lens toggle (existing) unchanged.

### Accessibility
- Onboarding splash: focus first option on render. Tab navigates between role buttons. Enter activates. Escape on edit flow only acts as Cancel.
- Role badge: `role="button"`, `aria-label="Edit role: CS major, BA minor"`.
- Color contrast: white text on `#C41230` gradient = 5.5:1 (passes WCAG AA normal text).
- Disabled minor button (matching the selected major): `aria-disabled="true"`.

---

## 13. CSS plan

### New CSS variables in `:root`
```css
--major-as: #6b7280;       /* Arts & Sciences = neutral grey */
--major-as-bg: #f4f4f5;
--major-as-border: #d4d4d8;
--major-as-text: #374151;
```

### New top-level classes
- `.onboarding-splash` — full-viewport gradient overlay.
- `.onboarding-step` — centered card, 90vw max 600px.
- `.role-card`, `.role-card.selected`.
- `.program-button-row`, `.program-button`, `.program-button.selected`, `.program-button.disabled`.
- `.role-badge`, `.role-badge--dual`, `.role-badge--single`, `.role-badge--cross`.
- `.empty-state-v2` (replaces current `.empty-state` for the home view; old empty-state stays for "no courses found" cases).
- `.role-cards-row`, `.role-card--major`, `.role-card--minor`.
- `.dc-banner` (double-counter banner).
- `.dc-list-view` (double-counter list page).
- `.cc-card-v2`, `.cc-header-v2`, `.cc-counts-for-v2`, `.cc-prereq-sched`, `.cc-description-v2`.
- `.tree-node-row-v2`, `.tree-course-row-v2`.

### Variable adjustments
- `--text-body`: 11px → 13px.
- `--text-section-title`: 9px all-caps → 11px bold.
- Spacing tokens defined for the new density: `--card-pad-x`, `--card-pad-y`, `--row-pad-y`.

### Backwards compatibility
The redesign replaces the visual shell entirely; the `-v2` suffix exists only during implementation to keep the diff reviewable. After PR merges, old class names that became unused can be removed.

---

## 14. Risk register

1. **Existing users re-onboard** — Anyone who's used the site already lands on the onboarding splash on next visit. One-time cost, accepted.
2. **Course card regression risk** — `renderCourseCard()` is rewritten significantly. Mitigation: `data.js` data shape into the renderer is unchanged; only the renderer changes. SOC schedule rendering, semester pills, and prereq display must be manually verified after implementation.
3. **Tree row height impact** — Bigger rows mean more scrolling on a CS tree (~62 courses across 5+ buckets). Manual check on a low-end phone after build.
4. **Decorative emoji creep** — Per user feedback, no `⭐ ✨ ✦` etc. as ornamental indicators. Functional emojis (`🔍`, `🇶🇦`, `🇺🇸`, `🌙`, `☀️`) remain.

---

## 15. Out of scope (deferred to future specs)

- Personalized course planner (track completed courses → recommend next).
- Real CMU-Q minor catalog data (separate from major requirements).
- Server-side profile persistence.
- Deep-link / shareable role URLs.
- A "compare two programs" cross-program view for area heads beyond the multi-program badge.

---

## 16. Acceptance criteria

- First visit shows the onboarding splash. Picking Student → CS + BA loads the focused-dual home view with two role cards and the double-counter banner.
- Picking Professor → CS loads the focused-single home view with one program card.
- Picking Professor → Arts & Sciences (Cross-program) loads the cross-program view with all four tabs.
- Picking Area Head loads the cross-program view directly (no step 2).
- Searching `15-122` for a CS+BA student loads the redesigned course card with a double-counter banner at the top.
- Searching the same course as an Area Head loads the redesigned card with no banner.
- The tree's leaf rows are larger and clearly tappable; a CS+BA student sees `[BA]` tags on courses that double-count.
- Clicking the role badge in the navbar re-opens onboarding pre-filled; Continue updates the view; Cancel returns without changes.
- Theme toggle, location filter, mobile lens toggle continue to function unchanged.
- No `⭐` or other ornamental emojis appear anywhere in the new UI.
