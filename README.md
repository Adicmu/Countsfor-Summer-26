# CountsFor — CMU-Q Curriculum Explorer

A dual-lens curriculum requirements explorer for Carnegie Mellon University in Qatar. Helps students instantly understand **what each course counts for** across all four majors (CS, IS, BA, BS) and **what courses satisfy** any requirement bucket.

![CountsFor Screenshot](https://img.shields.io/badge/Status-Active_Development-brightgreen) ![License](https://img.shields.io/badge/License-MIT-blue)

## Features

- **Course Lookup** — Search any course by code or name, see every requirement it satisfies across all majors with CORE/GEN ED labels
- **Requirement Map** — Browse the full requirement tree for CS, IS, BA, or BS with collapsible hierarchy and fulfillment rule chips (`pick 1`, `take all`, `≥19 units`, etc.)
- **Cross-linking** — Click a requirement in the course card to jump to it in the tree; click a course in the tree to see its full card
- **Location Filter** — Filter courses by Qatar 🇶🇦, Pittsburgh 🇺🇸, or show all
- **Dark Mode** — Persistent light/dark theme toggle
- **Responsive** — Works on desktop (split panel) and mobile (tabbed)
- **Zero Dependencies** — Pure HTML, CSS, and JavaScript. No build step, no framework, no npm.

## Quick Start

### Prerequisites

You only need a way to serve static files locally. Any of these work:

| Tool | Install | Command |
|------|---------|---------|
| **Python 3** (recommended) | Pre-installed on macOS/Linux | `python3 -m http.server 8080` |
| **Node.js** | [nodejs.org](https://nodejs.org) | `npx serve -p 8080` |
| **VS Code** | [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) | Right-click `index.html` → "Open with Live Server" |

### Setup (< 1 minute)

1. **Clone this repo**
   ```bash
   git clone https://github.com/Adicmu/Countsfor-Summer-26.git
   cd Countsfor-Summer-26
   ```

2. **Start a local server** from the project root
   ```bash
   python3 -m http.server 8080
   ```

3. **Open in your browser**
   ```
   http://localhost:8080
   ```

That's it. The app loads 1,700+ courses from the bundled `data/courses.json` file automatically. When deployed on the CMU-Q network, it will use the live API instead.

## Project Structure

```
.
├── index.html          # Entry point
├── css/
│   └── styles.css      # Complete design system (light/dark, major colors, all components)
├── js/
│   ├── utils.js        # Debounce, escaping, localStorage, toast notifications
│   ├── data.js         # Data transformation: tree builder, requirement parser, fulfillment rules
│   ├── api.js          # API client with 3-tier fallback (Live API → GitHub → Local JSON)
│   └── app.js          # Main app: state management, rendering, cross-linking, search
├── data/
│   └── courses.json    # Bundled course data (1,727 courses with requirement mappings)
└── README.md
```

## How It Works

### Data Flow

```
API / Local JSON
      ↓
  Parse 1,727 courses
      ↓
  Build requirement tree per major (CS, IS, BA, BS)
      ↓
  Split into Degree Requirements + General Education
      ↓
  Annotate fulfillment rules from audit specs
      ↓
  Render dual-lens interface
```

### Data Sources (Priority Order)

1. **Live API** — `https://countsfor.qatar.cmu.edu/api` (used when deployed on CMU-Q network)
2. **GitHub** — `open-cmuq/CountsFor` raw data (fallback)
3. **Local JSON** — `data/courses.json` bundled with the repo (always works offline)

### Major Colors

| Major | Color | Hex |
|-------|-------|-----|
| CS (Computer Science) | 🔴 Red | `#C41230` |
| IS (Information Systems) | 🟡 Amber | `#D97706` |
| BA (Business Administration) | 🔵 Blue | `#2563EB` |
| BS (Biological Sciences) | 🟢 Green | `#059669` |

## Tech Stack

- **HTML5** — Semantic markup
- **CSS3** — Custom properties, Grid, Flexbox, no preprocessor
- **Vanilla JavaScript (ES6+)** — No framework, no build step
- **Fonts** — Inter (UI) + JetBrains Mono (code/course numbers) via Google Fonts

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally with `python3 -m http.server 8080`
5. Push and open a PR

## Credits

- Course data sourced from [open-cmuq/CountsFor](https://github.com/open-cmuq/CountsFor)
- Built for Carnegie Mellon University in Qatar students

## License

MIT
