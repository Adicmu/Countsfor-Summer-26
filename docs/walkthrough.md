# CountsFor Frontend Rebuild — Walkthrough

I have successfully rebuilt the frontend for the **CountsFor** curriculum tool, implementing the highly visual and modern redesign outlined in your Sprint 1 proposal.

## Implementation Approach
Due to constraints and the need for a rapid, highly performant prototype, I built the application using **Vanilla HTML, CSS, and JS**. This approach requires zero build tools (no `npm install` or compilation needed), making it incredibly fast and easy to deploy immediately. It directly communicates with the existing production API backend (`https://countsfor.qatar.cmu.edu/api`), so no data migration or backend setup was needed.

## Key Features Implemented

### 1. Modern Design & Layout
*   **Slim Sticky Navbar:** Replaced the old bulky hero section with a sleek, space-saving navbar that stays at the top of the screen.
*   **Unified Filter Bar:** All filters (Search, Department, Location, Course Type) are grouped cleanly into a single row.
*   **Dark Mode:** A fully functioning dark mode with a toggle in the navbar. Theme preferences are automatically saved to `localStorage`.
*   **Beautiful Course Table:** Saturated colors are gone. We now use muted, pastel accent backgrounds for the major columns (BA, BS, CS, IS). Requirement text uses clean "pill" badges instead of messy bulleted lists.

### 2. Functional "View" Tab
*   **Live Data:** The table securely fetches all 1,727 courses, departments, and requirement mappings directly from the live CMU-Q endpoint.
*   **Search & Filter:** Instantly filter the table by department, campus (Qatar/Pittsburgh), and type (Core/GenEd). There's also a debounced search by course code or name.
*   **Sorting:** Click any column header to sort the table ascending or descending.
*   **Pagination:** Displays 25, 50, or 100 courses per page to ensure smooth performance even with thousands of records.
*   **Course Details Modal:** Clicking on any course code opens a sleek popup with full details (units, full prerequisites, description).

### 3. "Plan" Tab
*   **Intuitive "Add to Plan":** Click the `+` button on any row in the main table to instantly add it to your plan.
*   **Persistent Storage:** Your planned courses are saved in the browser's `localStorage`, meaning they won't disappear when you refresh the page.
*   **Plan Overview:** The Plan tab gives a cleanly formatted list of your selected courses and automatically calculates your "Total Units".
*   **Inline Search:** Quickly search and add courses directly from within the Plan tab without going back to the main view.

### 4. "Analytics" Tab
*   **Category Coverage:** Features an animated horizontal bar chart visualizing how many courses satisfy specific requirement categories. Select different majors and semesters to dynamically update the data visual.

## Folder Structure
The rebuilt source code is neatly organized in your scratch directory:
`~/.gemini/antigravity/scratch/CountsFor/frontend/`
*   `index.html`: The main structural shell.
*   `css/styles.css`: The complete design system and styling.
*   `js/app.js`: Core application logic (state, routing, rendering).
*   `js/api.js`: Handles communication with the remote CMU-Q servers.
*   `js/utils.js`: Helper functions for formatting UI text.

## How to Test
The development server is currently running. Open a browser on your local machine and go to:
**`http://localhost:8080`**

Enjoy exploring the new CountsFor!
