# CountsFor UI Redesign — Full-Width Focused Mode

## Problem
In focused mode (before opening the explorer), the course card is constrained to 720px max-width, leaving large empty gutters on both sides on typical 1280–1920px screens.

## Design Philosophy
Think of it like **Apple's product pages**: content fills the viewport gracefully, information is spatially organized rather than stacked linearly, and transitions between views feel intentional.

## Redesign Plan

### 1. Full-Width Course Card (Focused Mode)
- Remove `max-width: 720px` — card now stretches to fill available width with generous padding
- Use a **2-column grid layout** for the card body:
  - **Left column**: Course header (code, name, meta), Prerequisites, Description
  - **Right column**: "Counts For" cards (horizontal grid), Schedule

### 2. "Counts For" → Horizontal Major Cards
Instead of small stacked rows, each major gets a **prominent card**:
- Cards arranged in a **2×2 responsive grid** (or auto-fill)
- Each card has the major's accent color border/header
- Shows the major badge prominently, the requirement path, and Core/GenEd label
- Card is clickable → opens explorer at that requirement node
- If a course counts for only 1 major, the single card stretches wider

### 3. Schedule Section — Side-by-Side Locations
- If course is offered at both campuses, show **Qatar and Pittsburgh tables side-by-side** instead of stacked
- Each location gets its own mini-card with flag header

### 4. Progressive Disclosure Flow
- **Step 1 (Focused)**: Full-width course detail with everything visible
- **Step 2 (Click "Explore")**: Smooth transition to split view — content condenses to left panel, tree appears on right
- The split-mode course card reverts to the compact stacked layout (current design)

### 5. Size Increases
- Course code: 1.4rem → **1.8rem**
- Course name: 1rem → **1.15rem**
- Meta pills: larger padding
- Section titles: slightly larger
- Overall card padding: 20px → **28px**
