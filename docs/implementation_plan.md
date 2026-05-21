# CountsFor — Progressive Disclosure Layout Redesign

## Problem

The current dual-panel layout shows **too much information on first load**. A new student opening the site sees a search panel, a requirement tree, major tabs, rule chips, and course counts — all at once. This violates the principle of progressive disclosure and creates cognitive overload before the user has even searched for anything.

## Design Philosophy: "Search First, Explore on Demand"

The redesign follows a **two-stage reveal pattern**, inspired by how Google works:

> **Stage 1** → You see a clean search bar. That's it. You type. You get a result.
> **Stage 2** → Only *after* you find something interesting, you can choose to go deeper.

---

## Proposed UX Flow

### Stage 1: Full-Width Course Lookup (Default)

When the user first opens the site, they see:

```
┌─────────────────────────────────────────────────────────────┐
│  CountsFor  CMU-Q               All | Qatar | Pitts  🌙    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           What does this course count for?                  │
│     ┌───────────────────────────────────────────┐           │
│     │ 🔍 Search by code or name…                │           │
│     └───────────────────────────────────────────┘           │
│                                                             │
│           📚 Try 15-122 · 21-259 · 73-102                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

After searching and selecting a course, the **full-width course card** fills the screen:

```
┌─────────────────────────────────────────────────────────────┐
│  CountsFor  CMU-Q               All | Qatar | Pitts  🌙    │
├─────────────────────────────────────────────────────────────┤
│  🔍 15-122                                                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  15-122                                                     │
│  Principles of Imperative Computation                       │
│  [Computer Science] [12 units] [🇶🇦 Qatar] [🇺🇸 Pittsburgh] │
│  F25  M25  S25  F24  M24  S24  S23  S22  +2                │
│                                                             │
│  PREREQUISITES                                              │
│  15-112 [] at least C                                       │
│                                                             │
│  COUNTS FOR                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ CS │ Computer Science Core                    CORE  │    │
│  │ CS │ SCS Electives                            CORE  │    │
│  │ IS │ Technical Core → CS Req                  CORE  │    │
│  │ BA │ Scientific Reasoning                   GEN ED  │    │
│  │ BS │ Math, Stats, and CS                    GEN ED  │    │
│  │ BS │ STEM Course                            GEN ED  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  DESCRIPTION                                                │
│  ┃ For students with a basic understanding of programming   │
│  ┃ variables, expressions, loops, arrays, functions…        │
│                                                             │
│          ┌──────────────────────────────┐                   │
│          │ 🗂 Explore Requirement Map → │                   │
│          └──────────────────────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> The course card now has the **full width of the screen** — more breathing room, less cramped. The search bar moves into the navbar area after a course is selected so it's always accessible. An "Explore Requirement Map" button appears at the bottom of the card, inviting deeper exploration.

### Stage 2: Split-Panel Explorer (On Demand)

The user enters the explorer mode via **any** of these triggers:
- Clicking **"Explore Requirement Map →"** button on the course card
- Clicking any **Counts For** badge row (e.g., the "CS | Computer Science Core" row)
- A keyboard shortcut (`E` key)

The layout **smoothly transitions** to the split-panel view:

```
┌─────────────────────────────────────────────────────────────┐
│  CountsFor  CMU-Q     ← Back to Search    Qatar | Pitts 🌙 │
├────────────────────────┬────────────────────────────────────┤
│  🔍 15-122             │  CS   IS   BA   BS                │
│  ──────────────────    │  Filter requirements…              │
│  15-122                │  ──────────────────────────────    │
│  Principles of         │  DEGREE REQUIREMENTS               │
│  Imperative Comp.      │  ▼ CS Degree Requirements          │
│  [CS] [12u]            │    ▶ SCS Electives    ≥19u │ 94   │
│                        │    ▶ CS Core       take all │ 40   │
│  COUNTS FOR            │    ▶ First-year Immigration        │
│  CS | CS Core    CORE  │    ...                             │
│  CS | SCS Elect  CORE  │  GENERAL EDUCATION                 │
│  IS | Tech Core  CORE  │    ▶ Science & Engineering         │
│  BA | Sci Reason GEN   │    ...                             │
│  BS | Math/CS    GEN   │                                    │
│  BS | STEM       GEN   │                                    │
│                        │                                    │
│  DESCRIPTION           │                                    │
│  ┃ For students with…  │                                    │
└────────────────────────┴────────────────────────────────────┘
```

A **"← Back to Search"** button in the navbar returns to Stage 1.

---

## Proposed Changes

### CSS (`css/styles.css`)

#### [MODIFY] [styles.css](file:///Users/adityavivek/.gemini/antigravity/scratch/CountsFor/frontend/css/styles.css)

- Add a `.layout-focused` state where `.main-layout` uses `grid-template-columns: 1fr` (single column) and the right panel is hidden
- Add a `.layout-split` state that restores the current `minmax(340px,42%) 1fr` grid
- Add transition animation for the panel slide-in (a smooth `grid-template-columns` transition)
- Style the "Explore Requirement Map" CTA button
- Style the "← Back to Search" navbar link
- In focused mode, increase max-width of course card content to ~720px and center it for readability
- Make the search in navbar mode more compact (in split view)

---

### JavaScript (`js/app.js`)

#### [MODIFY] [app.js](file:///Users/adityavivek/.gemini/antigravity/scratch/CountsFor/frontend/js/app.js)

- Add `layoutMode: 'focused'` state (`'focused'` | `'split'`)
- Modify `renderShell()` to use `layout-focused` class by default
- Add `enterExplorer()` method: transitions to split layout, optionally auto-navigates to a requirement
- Add `exitExplorer()` method: transitions back to focused layout
- The "Counts For" badge clicks now call `enterExplorer(major, path)` — opens split mode AND highlights the node
- Add "Explore Requirement Map →" button at the bottom of the course card
- Add "← Back to Search" button in the navbar (visible only in split mode)
- Modify the mobile lens toggle to only show in split mode

---

### HTML (`index.html`)

#### [MODIFY] [index.html](file:///Users/adityavivek/.gemini/antigravity/scratch/CountsFor/frontend/index.html)

No structural changes needed — the layout is rendered dynamically by `app.js`.

---

## User Review Required

> [!IMPORTANT]
> **Design Decision: What happens to the search bar in focused mode?**
> In focused mode (Stage 1), the search bar is part of the main content area with the large "What does this course count for?" heading. Once a course is selected, the search remains at the top of the panel so the user can quickly search again. This keeps the interface feeling like a clean "lookup tool" rather than an app dashboard.

> [!IMPORTANT]
> **Design Decision: "Explore" button placement**
> The "Explore Requirement Map →" button appears at the bottom of every course card, after the description. This means the user sees ALL the important course info first, and the deeper exploration is always just one click away — but never forced.

## Verification Plan

### Automated Tests
- Syntax check all JS files with Node.js
- Verify server starts and serves all assets

### Manual Verification
- Browser test: load page → confirm single-panel focused view
- Search for course → confirm full-width card with description
- Click "Explore" → confirm smooth transition to split view
- Click "← Back" → confirm return to focused view
- Click a "Counts For" badge → confirm it enters split view AND highlights the right node
- Test on mobile viewport → confirm tabbed layout still works
- Test dark mode in both layout modes
