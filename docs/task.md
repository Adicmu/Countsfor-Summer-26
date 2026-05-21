# CountsFor — Progressive Disclosure Redesign Tasks

- `[x]` **CSS: Layout states**
  - `[x]` Add `.layout-focused` (single column, centered content)
  - `[x]` Add `.layout-split` (current dual-panel grid)
  - `[x]` Right panel hidden by default
  - `[x]` Smooth transition animation
  - `[x]` "Explore" CTA button styles
  - `[x]` "Back to Search" link styles
  - `[x]` Focused-mode course card (full-width, max-width ~720px, centered)

- `[x]` **JS: State & shell**
  - `[x]` Add `layoutMode: 'focused'` state
  - `[x]` Rewrite `renderShell()` for focused-first layout
  - `[x]` `enterExplorer(major?, path?)` method
  - `[x]` `exitExplorer()` method
  - `[x]` "Explore Requirement Map →" button in course card
  - `[x]` "← Back to Search" in navbar (split mode only)
  - `[x]` Counts-for badge clicks → `enterExplorer()`
  - `[x]` Mobile lens toggle only in split mode

- `[x]` **Verify**
  - `[x]` Syntax check — all 4 JS files pass
  - `[x]` Browser test: focused mode — centered search, clean landing
  - `[x]` Browser test: full-width course card with Explore button
  - `[x]` Browser test: explore transition — smooth split with tree
  - `[x]` Browser test: back to search — returns to focused
  - `[x]` Push to GitHub ✓
