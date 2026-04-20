# CountsFor — CMU-Q Curriculum Explorer

A smart curriculum explorer for Carnegie Mellon University in Qatar. Students can instantly see **what each course counts for** across all four majors (CS, IS, BA, BS) — and optionally explore the full requirement tree on demand.

![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

---

## Features

### 🔍 Search-First Experience (Progressive Disclosure)
The app opens in a clean, focused single-panel view — just a search bar. No information overload.

1. **Search any course** by code (e.g. `15-122`) or name
2. See the full **course card** — name, units, semesters, location, prerequisites, what it counts for, and course description — all full-width
3. Click **"🗂 Explore Requirement Map →"** to optionally open the side-by-side requirement tree
4. Close the tree panel with the **✕ button** in the CS/IS/BA/BS tab row to return to the clean view

### 📋 Course Card
- Course code, name, units, semester offerings, campus location (Qatar / Pittsburgh / both)
- Prerequisites listed clearly
- **Counts For** — every requirement bucket it satisfies across all 4 majors, with CORE / GEN ED labels
- **Course Description** — full text sourced and scraped from the CMU-Q catalog (1,725 / 1,727 courses populated)

### 🗂 Requirement Map (On Demand)
- Browse the full collapsible requirement tree for CS, IS, BA, or BS
- Fulfillment rule chips on every node: `pick 1`, `take all`, `≥19 units`, `optional`, etc.
- Course count per node
- Click any **Counts For badge** in the course card → automatically opens the tree and jumps to that node
- Click any course in the tree → loads its full card on the left

### 🌍 Location Filter
Filter all results by **Qatar 🇶🇦**, **Pittsburgh 🇺🇸**, or show **All**

### 🌙 Dark / Light Mode
Persistent theme toggle. Defaults to dark mode.

### 📱 Responsive
- Desktop: progressive disclosure to split-panel
- Mobile: tabbed lens toggle (Course Lookup / Requirement Map) — only visible in split mode

### ⚡ Zero Dependencies
Pure HTML + CSS + Vanilla JavaScript. No npm, no build step, no framework.

---

## Quick Start

### Prerequisites

You only need a way to serve static files. Any of these work:

| Tool | Install | Command |
|------|---------|---------|
| **Python 3** ✅ recommended | Pre-installed on macOS/Linux | `python3 -m http.server 8080` |
| Python (Windows) | Pre-installed on Windows | `py -m http.server 8080` |
| **Node.js** | [nodejs.org](https://nodejs.org) | `npx serve -p 8080` |
| **VS Code** | [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) | Right-click `index.html` → "Open with Live Server" |

### Setup (< 1 minute)

**1. Clone the repo**
```bash
git clone https://github.com/Adicmu/Countsfor-Summer-26.git
cd Countsfor-Summer-26
```

**2. Start a local server**

Mac / Linux:
```bash
python3 -m http.server 8080 --directory frontend
```

Windows:
```bash
py -m http.server 8080 --directory frontend
```

Or if you're already inside the `frontend/` folder:
```bash
python3 -m http.server 8080
```

**3. Open in your browser**
```
http://localhost:8080
```

That's it. The app loads all 1,700+ courses from the bundled `data/courses.json` automatically. When run on the CMU-Q network, it will use the live API instead.

---

## How to Use

1. **Type a course code or name** in the search box (e.g. `15-122`, `machine learning`, `calculus`)
2. **Click a result** from the dropdown — the full course card appears
3. **Read what it counts for** — color-coded badges for each major (CS = red, IS = amber, BA = blue, BS = green)
4. **Click a badge** (e.g. "CS · Computer Science Core") to open the requirement tree and jump straight to that node
5. **Or click "Explore Requirement Map →"** at the bottom of the card to browse the full tree
6. **Click ✕** in the tab bar (next to CS IS BA BS) to close the tree and return to the focused view
7. **Click the course code** in the navbar to reset back to the search

---

## Project Structure

```
frontend/
├── index.html              # Entry point (single HTML shell)
├── css/
│   └── styles.css          # Full design system — layout modes, themes, major colors, all components
├── js/
│   ├── utils.js            # Debounce, HTML escaping, localStorage, toast notifications
│   ├── data.js             # Tree builder, requirement parser, fulfillment rule annotator
│   ├── api.js              # 3-tier data fetcher: Live API → GitHub Raw → Local JSON
│   └── app.js              # State machine, rendering, progressive disclosure logic, cross-linking
└── data/
    └── courses.json        # Bundled data: 1,727 courses with descriptions + requirement mappings
```

---

## Architecture

### Progressive Disclosure Layout

The app has two layout modes managed by a `layoutMode` state (`'focused'` | `'split'`):

| Mode | CSS class | What's visible |
|------|-----------|----------------|
| **Focused** (default) | `.layout-focused` | Single centered panel — search + full-width course card |
| **Split** (on demand) | `.layout-split` | Left panel (course card) + Right panel (requirement tree) |

Transitions between modes are animated via CSS Grid (`grid-template-columns`).

### Data Sources (Priority Order)

1. **Live API** — `https://countsfor.qatar.cmu.edu/api` (used when on CMU-Q network)
2. **GitHub Raw** — `open-cmuq/CountsFor` raw JSON (fallback)
3. **Local JSON** — `data/courses.json` bundled in this repo (always works offline)

### Major Color System

| Major | Full Name | Color |
|-------|-----------|-------|
| **CS** | Computer Science | 🔴 `#C41230` |
| **IS** | Information Systems | 🟡 `#D97706` |
| **BA** | Business Administration | 🔵 `#2563EB` |
| **BS** | Biological Sciences | 🟢 `#059669` |

---

## Tech Stack

- **HTML5** — Semantic shell, dynamic content rendered by JS
- **CSS3** — Custom properties, CSS Grid layout transitions, Flexbox, no preprocessor
- **Vanilla JS (ES6+)** — No framework, no bundler, no dependencies
- **Fonts** — [Inter](https://fonts.google.com/specimen/Inter) (UI) + [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) (course numbers) via Google Fonts

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes in `frontend/`
4. Test locally: `python3 -m http.server 8080 --directory frontend`
5. Push and open a Pull Request

---

## Credits

- Course and requirement data sourced from [open-cmuq/CountsFor](https://github.com/open-cmuq/CountsFor)
- Course descriptions scraped from [countsfor.qatar.cmu.edu](https://countsfor.qatar.cmu.edu)
- Built for CMU-Q students by Aditya Vivek

---

## License

MIT
