# UI/UX Overhaul — Design Spec

**Date:** 2026-05-11
**Status:** Draft — pending user review
**Supersedes (visual layer only):** `2026-05-10-role-aware-onboarding-design.md`
**Out of scope:** data layer, profile model, view-mode dispatch, double-counter / multi-program annotation logic. The role-aware spec from 2026-05-10 still governs *what* the app shows; this spec governs *how it looks*.

---

## 1. Problem

The role-aware onboarding redesign shipped in PR #1 (merged 2026-05-11). It works, but in real use several UI/UX problems surfaced:

1. **Duplicated headline.** The phrase "What does this course count for?" appears twice on the home screen — once in the panel header (alongside the cramped search bar) and once in the empty-state hero below it. Users don't understand which is "the" question.
2. **Cramped search placeholder.** `Search by code, name, requirement, or category…` is too long for the input width; the tail gets clipped after "name". Users can't read the full hint.
3. **Unexplained "Try a course" chips.** Three course codes appear as buttons with no context. Users don't know whether they're examples, recommendations, recently-viewed, or something else.
4. **Wasted whitespace.** Vertical air between the hero, role cards, double-counter banner, and chips makes the home screen feel sparse rather than confident.
5. **Flat hierarchy on the course card.** The "Counts For" answer — literally the app's namesake — gets the same visual weight as the department pill row.
6. **Low text contrast.** Multiple spots use ≥`#888` gray on white, which is hard to read.

This spec fixes all six across five surfaces: onboarding, navbar, home, course card, and requirement tree.

---

## 2. Design principles

These principles drove every layout choice below. Implementation should refer back to them when edge cases come up.

- **One answer per screen.** Never repeat the same headline. If a question appears in the panel header, the body doesn't repeat it.
- **Hierarchy follows value.** "Counts For" is the app's reason to exist; it should be visually heaviest. Department, location, and offered-semester pills are utility metadata; they shrink.
- **Density is fine; clutter is not.** No empty hero blocks. Tight, intentional spacing. Don't add a "feature" (chips, banners) without explaining what it is.
- **High contrast always.** Body text ≥ `#1a1a1a` on white; secondary ≤ `#4a4a4a`; tertiary ≤ `#6a6a6a`. Disabled / placeholder may go lighter but only for genuinely inactive elements. (See `feedback_text_contrast.md`.)
- **No decorative emojis.** Functional emojis (🔍 search, 🇶🇦/🇺🇸 flags, 🌙 theme) stay. Decorative emojis (⭐ ✨ ✦) never. (See `feedback_no_decorative_emojis.md`.)
- **Mobile is first-class, not a fallback.** Every screen below has an explicit mobile layout, not just "the desktop layout but narrower."
- **Zero new dependencies.** No npm, no build step, no framework. Vanilla JS + a single `styles.css` file, same as today.

---

## 3. Color & typography system

### Palette

| Token | Value | Use |
|-------|-------|-----|
| `--text` | `#1a1a1a` | Body text on white |
| `--text-2` | `#4a4a4a` | Secondary text on white |
| `--text-3` | `#6a6a6a` | Tertiary labels, captions |
| `--bg` | `#f6f6f7` | App background |
| `--panel` | `#ffffff` | Panel / card background |
| `--border` | `#e3e3e5` | All standard borders |
| `--major-cs` (existing) | `#C41230` | Computer Science (CMU red) — unchanged |
| `--major-ba` (existing) | `#2563EB` | Business Administration — unchanged |
| `--major-is` (existing) | `#D97706` | Information Systems — unchanged |
| `--major-bs` (existing) | `#059669` | Biological Sciences — unchanged |
| `--accent-math` (new) | `#6b21a8` | Math accent (tree sections) |
| `--accent-humanities` (new) | `#B45309` | Humanities accent (tree sections) — darker amber, distinct from `--major-is` |
| `--accent-science` (new) | `#047857` | Science / electives accent (tree sections) — darker green, distinct from `--major-bs` |

Dark-mode equivalents will be derived in the implementation plan; this spec defines the light-mode contract. Dark mode must respect the inverse contrast rule (body text ≥ `#dddddd` on dark backgrounds).

### Type scale

| Role | Size / weight |
|------|---------------|
| Hero title (home, onboarding) | 26–30 px / 800 |
| Page title (course code in spec card) | 28 px / 800 |
| Section title (h4 in card sections, l1 in tree) | 14 px / 700 |
| Body | 13 px / 500–600 |
| Body small / leaf rows | 12.5 px / 500 |
| Label (uppercase) | 10–11 px / 700, letter-spacing 0.08em |
| Caption / tertiary | 11 px / 500 |
| Monospace (course codes in tree) | 12 px `'JetBrains Mono'`, `'SF Mono'`, `Menlo`, monospace (JetBrains Mono is already loaded via `@import` at the top of `styles.css`) |

---

## 4. Surface specs

Each surface below was selected from a multi-option brainstorm (mockups archived in `.superpowers/brainstorm/`). The chosen direction is documented; rejected directions are listed at the end of the section so implementers know not to re-litigate.

---

### 4.1 Onboarding splash — "Single-screen progressive disclosure"

**Chosen direction:** Option A (single screen, sections enable progressively).

**Replaces:** Current two-step splash (`renderOnboarding` → `_renderOnboardingRole` → `_renderOnboardingStudentProgram` / `_renderOnboardingProfessorProgram`).

#### Layout (desktop & mobile)

A single full-viewport CMU-red gradient panel. Centered card, max-width ~520 px. All three pickers visible at once, but only the active section is interactive. The "Step 1 of 2" indicator is removed.

```
┌─────────────────────────────────────────┐
│  CountsFor                              │  ← brand
│  CMU-Q Curriculum Explorer              │  ← brand-sub
│                                         │
│  Tell us who you are.                   │  ← heading 24/800
│  We'll tailor the curriculum view to    │  ← sub 13, opacity 0.8
│  your role. Takes 5 seconds.            │
│                                         │
│  I AM A                                 │  ← section label
│  [ Student ] [ Professor ] [ Area Head] │  ← row3
│                                         │
│  MAJORING IN                            │  ← appears when role=student/professor
│  [ CS ] [ IS ] [ BA ] [ BS ]            │
│                                         │
│  WITH A MINOR IN  (optional)            │  ← students only, after major picked
│  [ None ] [CS] [IS] [BA] [BS]           │  ← current major is dimmed/disabled
│                                         │
│  [        Continue →         ]          │  ← disabled until valid
└─────────────────────────────────────────┘
```

#### Behaviour

- **Initial state.** Only "I am a…" row is enabled. Other rows are visible but rendered with `opacity: 0.4` and `pointer-events: none`.
- **After role picked:**
  - `student` → "Majoring in" row enables.
  - `professor` → "Majoring in" row enables (no minor row; replaced with the existing Arts & Sciences cross-program option *inline* in the program row).
  - `area_head` → no further picker; Continue button enables immediately.
- **After major picked (students only).** "With a minor in" row enables; the matching major button in the minor row is disabled (can't minor in your own major).
- **Continue.** Only enabled when the current role's required picks are all filled. Persists via `saveProfile` and routes to the main shell.
- **Edit mode.** When opened from the navbar role pill, a "Cancel" link appears at the bottom-right of the card; clicking it returns to the previous main view without writing.
- **No "Step X of 2" indicator.** The progressive disclosure makes the step model obsolete.

#### Mobile

Same single-screen layout. Section buttons wrap from `repeat(4, 1fr)` to `repeat(2, 1fr)` below 380 px. Vertical padding tightens but the contrast and hierarchy are identical.

#### Rejected

- **Option B (card-based 2-step).** Same flow as today but with role descriptions. Rejected — kept the two-step friction.
- **Option C (sentence-builder).** "I'm a Student majoring in CS with a minor in BA." Rejected — distinctive but harder to scan and edit.

---

### 4.2 Navbar — "Keep loud, prominent role badge"

**Chosen direction:** Keep the gradient role pill exactly as today, visually loud.

**Reasoning:** User considered hiding it but decided that maximum discoverability beats the modest UI cost. Edge cases that justify a prominent role-switch entry point:
- User picked the wrong program on first run.
- A sophomore declares a minor mid-year and needs to update their profile.
- A professor demos the app to a student during advising.

#### Layout (no changes from current)

```
[ CountsFor CMU-Q ]    [ Student · CS+BA ] [ All ][🇶🇦 Qatar][🇺🇸 Pittsburgh ]  [ 🌙 ]
```

- Role pill background: `linear-gradient(90deg, #C41230, #7d0a1f)`, white text, 5×12 px padding, font-weight 600.
- Click → opens onboarding splash in edit mode (`renderOnboarding(true)`).
- On mobile (<860 px), pill wraps onto its own line below the brand; location and theme stay on the right.

No layout changes needed in implementation — the current navbar matches this spec.

---

### 4.3 Home screen — "Stacked, search-first"

**Chosen direction:** Home variant 1 — Stacked, search primary, browse secondary, double-counter insight banner at the bottom.

**Replaces:** Current `_renderEmptyDual` / `_renderEmptySingle` / `_renderEmptyCross` plus the duplicated panel header.

#### Critical change: remove the duplicate panel header

The current `renderShell()` puts a `panel-header` containing the tag "Course Lookup", the title "What does this course count for?", and the search input *above* the body. The empty-state body then renders its own hero with the same title.

**New behaviour:**
- The panel header **on the home screen** is removed entirely. The search bar lives inside the body, as part of the empty-state hero.
- When a course is selected (course card visible), the panel header **is** shown — it carries the search bar so the user can search again without going back. The tag "Course Lookup" and the duplicate title remain removed.
- Result: the search bar appears in exactly one place at any given time. No duplication.

#### Layout — focused-dual mode (student with major + minor)

```
┌──────────────────────────────────────────────────────────────┐
│  Find a course.                                              │  hero 26/800
│  See what it counts for in your CS major and BA minor.       │  lead 13/500 #4a4a4a
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🔍   Try "15-122" or "Probability"                    │  │  primary search
│  └────────────────────────────────────────────────────────┘  │  red 2px border, 14×16 padding
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  🗂  Browse requirements                          →    │  │  big button, dark bg
│  │      CS + BA requirement tree — find courses by slot   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  23   CS MAJOR + BA MINOR                              │  │
│  │       courses count for both — pick these first   →    │  │  red gradient banner
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **Hero title.** "Find a course." Period included. 26 px / 800.
- **Lead sentence.** Tailored to profile:
  - `focused-dual`: "See what it counts for in your {primary} major and {secondary} minor."
  - `focused-single` (student): "See what it counts for in your {primary} program."
  - `focused-single` (professor): "See what it counts for in the program you teach."
  - `cross-program`: "See what it counts for across CS, IS, BA, and BS."
- **Search bar.** Placeholder `Try "15-122" or "Probability"` (shorter, action-oriented, won't clip). 2 px red border, 12 px radius, soft red shadow. Icon on the left. Typeahead behavior unchanged from today.
- **Browse button.** Full-width, dark background (`#1a1a1a`), white text. Two-line label: primary "Browse requirements" + a smaller (`11 px / 400 / opacity 0.7`) subtitle explaining what opens. Right-aligned `→`. Clicking enters the explorer (`enterExplorer()`).
  - In `focused-single` mode the subtitle changes to "{primary} requirement tree".
  - In `cross-program` mode the subtitle changes to "CS · IS · BA · BS requirement tree" and clicking opens whichever major was last active (or CS by default).
- **Double-counter insight banner.** Same gradient as today but rebuilt for hierarchy:
  - Left: a big numeral (`40 px / 800`) — the double-counter count.
  - Middle: stacked label "CS MAJOR + BA MINOR" (11 px label) + "courses count for both — pick these first" (13 px body).
  - Right: a pill-shaped "See all →" CTA on white background.
  - Clicking anywhere on the banner opens the existing double-counter list view (`showDoubleCounterList()`).
- **Only shown in `focused-dual` mode.** In `focused-single` mode this banner is hidden (no double-counter context). In `cross-program` mode it's replaced with a "View multi-program courses" lane (3+ programs).

#### What's removed

- "Course Lookup" panel-header tag.
- Duplicate "What does this course count for?" panel-header title.
- The "Try a course" chip row (`.es-try-row`, `.es-try-chips`, `_pickTryCourses`). The chips were never explained and confused users.
- The two role cards on the empty state (the CS card and the BA card in `_renderEmptyDual`). The course counts they communicated ("412 courses", "178 courses") are absorbed into the new browse-button subtitle.

#### Mobile

Same stacked order. Padding tightens from 22 px to 16 px. Hero shrinks to 22 px. Search font-size stays 14 px (don't trigger iOS zoom). Browse button stays full-width. Insight banner stacks its three parts vertically below 480 px (numeral on top, label middle, CTA full-width at bottom).

#### Rejected

- **Variant 2 (two browse buttons per program).** Splits browse into CS and BA buttons. Rejected — too many primary CTAs.
- **Variant 3 (insight banner on top).** Leads with the double-counter count, demotes search. Rejected — search is the dominant entry point.
- **Original "Try a course" chips.** Rejected — unexplained, confusing.

---

### 4.4 Course card — "Spec sheet"

**Chosen direction:** Option C — spec sheet layout with tight key/value rows and a two-column upper grid.

**Replaces:** Current `renderCourseCard` body (`.course-card-v2` block).

#### Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [CS][BA]  Double-counter                                       │  ← thin DC banner (only when applicable)
├─────────────────────────────────────────────────────────────────┤
│  15-122                                                         │  ← code 28/800
│  Principles of Imperative Computation · 10 units                │  ← name 13 / #4a4a4a
│  ───────────────────────────────────────────────────            │  ← 1px border
│  ┌──────────────────────────┬──────────────────────────┐        │
│  │ ABOUT                    │ FALL 2026                │        │  ← h4 11/700 uppercase
│  │ Dept   Computer Science  │ Sec A  MWF 10:30–11:50   │        │  ← key 12 #6a6a6a, val 12 #1a1a1a
│  │ Offered F25 · S26 · F26  │ Sec B  MWF 13:00–14:20   │        │
│  │ Where  Qatar & Pittsburgh│ Sec C  TR  09:00–10:50   │        │
│  │ Prereq 15-112            │                          │        │
│  └──────────────────────────┴──────────────────────────┘        │
│                                                                 │
│  COUNTS FOR                                                     │
│  ─────────────────────────                                      │
│  [CS]  Intro Programming Sequence — Required           →        │
│  [CS]  CS Core — Required                              →        │
│  [BA]  Math & Comp Foundations — GenEd                 →        │
│                                                                 │
│  DESCRIPTION                                                    │
│  For students with experience writing programs. Introduces      │
│  imperative programming using arrays, pointers, recursion,      │
│  and analysis of algorithms…                                    │
└─────────────────────────────────────────────────────────────────┘
```

#### Sections

1. **Double-counter banner** (conditional). Slimmer than today: 8 px vertical padding, 12 px font, just "[CS][BA] Double-counter". Rationale: the card itself already shows the BA mapping under "Counts for", so the banner just needs to be a flag, not an essay.
2. **Header block.** Course code (28 px / 800). Course name + units inline below it (13 px). 1 px bottom border, 12 px below.
3. **Two-column grid.**
   - **About:** Dept, Offered semesters, Where (Qatar / Pittsburgh / both), Prereq. Each row is a 60-px label column + value column. Rows separated by `#f3f3f3` 1 px lines.
   - **Fall 2026:** Sections matching the location filter, key/value style (e.g. `Sec A   MWF 10:30–11:50`). Show up to 4 sections inline; if more exist, render a "+N more sections" button below the last row that reveals the remaining sections (re-uses today's `expandScheduleV2` logic). Delivery-mode pills (remote / in-person) appear next to the time when present. If no sections, a single italic line "Not offered at {campus} for Fall 2026".
4. **Counts for.** Section heading 11 / 700 uppercase. Each mapping is a row with: a colored badge `[CS]` / `[IS]` / `[BA]` / `[BS]` (10 px / 800, 4 px radius, colored fill), the requirement label, "— Required" or "— GenEd", and a right-aligned `→`. Clicking a row enters the explorer at that path (existing `data-nav-major` / `data-nav-path` behavior preserved).
5. **Description.** Section heading, then plain text in `#444` with `line-height: 1.55`. No background tint, no border — the surrounding card frame is enough.

#### What changes from today

- "Counts For" stops being the headline. The header (code + name) is the headline.
- The 2-column block at the top groups **About** (static facts) and **Fall 2026** (schedule). Today these are separate rows with redundant labels — the spec-sheet style is tighter.
- The pill row of dept + location + offered is **gone**. That info now lives inside the About column.
- The clickable "show more" semesters expander is gone — the About column lists all offered semesters separated by `·` (truncates with ellipsis only on very narrow viewports).
- The clickable "+N more sections" schedule expander is preserved when more than 4 sections match the current location filter.

#### Mobile

The two-column grid collapses to single column below 700 px. About appears first, then Fall 2026, then Counts For, then Description. Section labels still uppercase. Total card padding tightens from 20 px to 14 px.

#### Rejected

- **Option A (editorial).** Big code, big name, "Counts for" as the hero. Rejected — overshadows the rest of the data.
- **Option B (stacked card blocks).** Each section in its own card block. Rejected — too much visual repetition.

---

### 4.5 Requirement tree — "Card-grouped sections"

**Chosen direction:** Option B — each top-level requirement is its own card with a colored accent bar.

**Replaces:** Current flat outliner in `renderTreeNode`.

#### Layout — desktop

Each **top-level** node (depth 0) renders as a card. Sub-nodes (depth ≥ 1) and leaf courses live inside the card body.

```
┌──[ ▶ CS ] [ BA minor ]──────────────────────────┐  ← tabs
├─[ 🔍 Filter requirements…              ]────────┤  ← search filter
│
│  ┌────────────────────────────────────────────┐
│  │ ▶ ▎ CS Core                    [take all]  │  ← card head (gradient bg, 4px accent bar)
│  ├────────────────────────────────────────────┤
│  │   ▶ Intro Programming Sequence  [≥ 12u]   │  ← sub-node (no card)
│  │       15-122  Imperative Computation  10u [BA]
│  │       15-150  Functional Programming  10u
│  │       15-210  Data Structures         12u
│  │   ▶ Computer Systems   [pick 1]   4 courses
│  │   ▶ Theoretical Foundations  [take all]  3
│  └────────────────────────────────────────────┘
│
│  ┌────────────────────────────────────────────┐
│  │ ▶ ▎ Math & Probability         [≥ 19u]    │  ← accent purple #6b21a8
│  ├────────────────────────────────────────────┤
│  │     21-127  Concepts of Math      10u [BA]
│  │     21-241  Matrices & Linear     10u [BA]
│  │     36-218  Probability Theory     9u
│  └────────────────────────────────────────────┘
│
│  ┌────────────────────────────────────────────┐
│  │ ▶ ▎ Technical Electives    [≥ 36u]   52    │  ← collapsed; accent green #047857
│  └────────────────────────────────────────────┘
│
│  ┌────────────────────────────────────────────┐
│  │ ▶ ▎ Humanities & Arts      [≥ 63u]   84    │  ← collapsed; accent amber #B45309
│  └────────────────────────────────────────────┘
```

#### Card head

- 14×16 px padding.
- Gradient background `linear-gradient(180deg, #fafafb, #f4f4f6)`.
- Bottom border `#e3e3e5` when the card is open.
- Box-shadow on the whole card when open: `0 2px 12px rgba(0,0,0,0.04)`.
- Components, left to right:
  - Arrow ▶ — 9 px chevron, rotates 90° on expand, color `#6a6a6a`.
  - **Accent bar** — 4 px wide × 22 px tall, rounded. Color picked from a small lookup table keyed by case-insensitive substrings in `node.label`. First match wins; default falls back to the active major's brand color (`--cs` / `--is` / `--ba` / `--bs`):
    - contains "core" or "required" → active major's brand color
    - contains "math" or "probabil" → `--math` (purple `#6b21a8`)
    - contains "elective" or "technical" → `--bs` (green `#047857`)
    - contains "humanit" or "arts" or "gened" → `--humanities` (amber `#B45309`)
    - contains "science" or "lab" → `--bs` (green) — keeps biology lab modules color-aligned
    - everything else → active major's brand color
    - The lookup table lives in `data.js` next to the existing `MAJOR_ORDER` constant so future requirement areas can be added in one place.
  - **Title** — 15 px / 700 / `--text`.
  - **Rule chip** — tinted background using the accent color at 10% opacity, foreground at full color, 700 weight, uppercase.
  - **Count chip** (collapsed cards only) — "52 courses" in `--text-2`.

#### Card body — sub-nodes

Sub-nodes are rows (no nested cards). Layout:
- 12-px left padding inside the card body.
- Row: `▶ {label}  [{rule}]  {count}`
- Hover background `#f3f3f5`.
- Expand state preserved per major via existing `this.expanded` map.

#### Card body — leaf courses

Leaves render as a list under their parent sub-node (or directly under the card body if the top-level node has direct courses).

- Left guide rail: 2 px `#eef0f3` border-left.
- Active course (`selectedCourse.course_code === c.code`): rail switches to `--cs`, background tint `rgba(196,18,48,0.07)`.
- Row contents:
  - Course code — monospace 12 / 700 / `--cs`, min-width 56 px.
  - Course name — 12.5 / 500 / `--text`, flex-1.
  - Units — 11 / `--text-2`.
  - **Double-counter tag** (focused-dual): solid colored chip with the *other* major's code (so a CS leaf showing `[BA]` means it also counts for BA). Reuses `dc-leaf-tag` class behavior from today.
  - **Multi-program chip** (cross-program, ≥ 3 programs): `mp-chip` class — neutral chip "3 programs".
- Hover background `#f3f3f5`.

#### Tabs and filter

- Tabs: pill-style. Active tab gets tinted background `rgba(196,18,48,0.08)` and red text. Minor tab keeps the "minor" suffix exactly as today.
- Filter input: tightened to 8 px / 12 px padding, light gray background `#f3f3f5`, no border, focus state inherits browser default but with a subtle red ring (`box-shadow: 0 0 0 2px rgba(196,18,48,0.2)` on focus).

#### Mobile

Same card structure. Card padding tightens. Inside card body, leaf code min-width drops to 50 px. The lens toggle ("Course Lookup" / "Requirement Map") stays as today's mobile chrome.

#### What changes from today

- Flat outliner becomes section cards at depth 0.
- Indent is reduced (children are inside cards, not 18 px-deeper rows).
- Color accent per requirement area added.
- Rule chips become color-tinted per accent (already partially today, but consistent now).
- Leaf rows get a guide rail instead of just padding.

#### Rejected

- **Option A (refined outliner).** Same as today but denser. Rejected — lacks scrolling anchors.
- **Two-pane requirements + courses.** Categories left, courses right. Rejected — too far from today's mental model.

---

## 5. What gets deleted

- `_renderEmptyDual`, `_renderEmptySingle`, `_renderEmptyCross` — replaced by a single new `_renderHome` with branches for view mode.
- `_pickTryCourses` and the `.es-try-row` / `.es-try-chips` CSS.
- The `.es-card` role-card components (replaced by the browse button's subtitle line).
- The "Step 1 of 2" / "Step 2 of 2" indicator strings in `_renderOnboarding*`.
- `.cc2-pills`, `.cc2-pill-offered`, `expandSemestersV2` — pill row is gone from the new spec card.
- `.cc2-grid-2` flow stays in concept but is rebuilt as `.cc-spec-cols` with a different visual style.

## 6. What stays exactly the same

- `App.profile` shape and `localStorage` keys.
- `computeViewMode`, `validateProfile`, `saveProfile`, `loadProfile`.
- `annotateDoubleCounters`, `annotateMultiProgram`.
- 3-tier data fetcher in `api.js`.
- Mobile lens toggle (`setMobileLens`).
- Location filter behavior (`setLocation`).
- Tree expand state (`isExpanded`).
- Theme toggle and `applyTheme`.
- Search typeahead behavior.
- Existing tests in `tests/` continue to pass — all are pure-function tests, not DOM tests.

## 7. Acceptance criteria

A change is complete when:

1. The home screen shows **one** "Find a course." headline. No "What does this course count for?" anywhere on the home screen.
2. The home search bar placeholder reads `Try "15-122" or "Probability"` and is fully readable at all breakpoints down to 320 px.
3. The "Try a course" chip row is gone.
4. The browse-requirements button is present, full-width, dark, with a two-line label.
5. The double-counter insight banner shows the count as a 40 px numeral; tapping it opens the existing double-counter list view.
6. The course card has the spec-sheet layout: header + two-column About/Fall block + Counts For + Description, in that order.
7. The requirement tree top-level nodes render as cards with colored accent bars and gradient headers.
8. Every text color on white backgrounds is `#1a1a1a`, `#4a4a4a`, or `#6a6a6a` — no `#888` or lighter.
9. No decorative emojis appear in the new UI; functional emojis (🔍 🇶🇦 🇺🇸 🌙) remain.
10. Onboarding splash shows all three pickers on one screen, with inactive ones dimmed. No "Step 1 of 2" indicator.
11. Mobile layouts (375 px viewport) for every screen above are verified end-to-end.
12. All 26 existing tests pass.

---

## 8. Implementation hand-off

After user approval, the next step is to invoke `superpowers:writing-plans` to create a phased implementation plan covering:

1. CSS system (color tokens, type scale, dark-mode tokens).
2. Onboarding rewrite.
3. Home screen rewrite (search-first + browse button + insight banner).
4. Course card rewrite (spec sheet).
5. Tree rewrite (card-grouped sections).
6. Mobile verification matrix.
7. Test additions for any new pure functions introduced.

Each phase ships as its own commit chain with a working app at every step.
