# Home screen redesign — "Refined collegiate" (approved 2026-07-17)

**Goal.** The dark home screen reads as unfinished: hazard-tape strip, stuck "Loading…" card, forced-equal-height cards with voids, ragged single-column chips, no focal hierarchy. Redesign the home screen in a refined-collegiate direction and fix the dark-theme debt from the July 17 UX review. User approved scope ("home screen + dark bugs") and direction ("refined collegiate").

## Design tokens
- **Canvas**: existing theme tokens (dark `#0B0F19` etc.) — unchanged.
- **Accent**: `--cmu-red #C41230` for fills only in dark; new `--cmu-red-text` (light `#C41230`, dark `#F87171`) wherever red is *text* on dark surfaces.
- **Gold thread**: existing `--gold` as the single decorative accent (hero rule, section label ticks).
- **Type**: display = Fraunces 600 (hero title only — restraint); body/UI = Inter (existing); data/codes = JetBrains Mono (existing).
- **Signature**: the tartan, done quietly — a large-scale, low-opacity woven sett as the page background texture; the 6px dashed `.home-plaid` strip is removed.

## Changes
1. **Hero**: Fraunces title, tightened vertical rhythm (spacer flex 1/0.55 → 0.6/0.42, head margin 28→20), softer focus ring (4px/0.30 → 3px/0.15; dark uses light-red ring), primary CTA filled red ("Browse … requirement tree"), secondary ghost ("Compare majors").
2. **Quick start**: GenEd categories become a full-width wrapping chip band under a small-caps label; Popular + Recently-updated sit below as two natural-height cards (`align-items:start`). Section labels get a short gold tick.
3. **Popular card**: initial render shows the local/static list immediately (no "Loading…" state exists anymore); server peer data upgrades the list in place when it arrives.
4. **`js/api.js`**: `apiFetch` gets `AbortSignal.timeout` (default 75s to survive cold starts; popular-courses call passes 8s since it has a local fallback).
5. **Dark parity fixes** (from UX review): `--cf-parchment` dark value + `.wl-note-input` surface tokens; `.cc-dm-*` pills get dark variants mirroring `.dm-*`; REQUIRED chip inverts in dark; `.cc-more` uses `--major-ba-text`; `.tr-rule` chips lighten their accent in dark; red-as-text (navbar wordmark, explore button, flag badges) moves to `--cmu-red-text`.
6. **Micro-fixes**: home typeahead left-aligned; `.navbar-brand .subtitle` nowrap.

## Out of scope
Course card layout (done earlier), explorer/tree redesign, landing page, copy changes from the review.

## Verification
Playwright screenshots: home light+dark at 1440/820/390; popular list renders instantly with backend down; course card + explorer unchanged except dark fixes; unit tests pass.
