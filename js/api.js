// ============================================================
// CountsFor — API Client
// Priority order:
//   1. Live CMU-Q API (when deployed / connected)
//   2. GitHub raw data (open-cmuq/CountsFor)
//   3. Bundled local JSON (always available in dev)
// ============================================================

const API_BASE = 'https://countsfor.qatar.cmu.edu/api';
const GITHUB_RAW = 'https://raw.githubusercontent.com/open-cmuq/CountsFor/main/backend/data';
const LOCAL_DATA = 'data/courses.json';

const _cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 min

async function _get(url) {
  if (_cache.has(url)) {
    const c = _cache.get(url);
    if (Date.now() - c.ts < CACHE_TTL) return c.data;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  const data = await res.json();
  _cache.set(url, { data, ts: Date.now() });
  return data;
}

// ── Merge courses from multiple JSON files from GitHub ───────
// The GitHub repo stores data as separate JSON files per major
// (courses.json, requirements.json, etc.). We try to fetch
// courses.json at the repo root first, then fall back to
// a known pattern.
async function _fetchFromGitHub() {
  // Try known GitHub paths
  const candidates = [
    `${GITHUB_RAW}/courses.json`,
    `${GITHUB_RAW}/all_courses.json`,
    `https://raw.githubusercontent.com/open-cmuq/CountsFor/main/data/courses.json`,
    `https://raw.githubusercontent.com/open-cmuq/CountsFor/main/courses.json`,
  ];
  for (const url of candidates) {
    try {
      const data = await _get(url);
      const courses = data.courses || data;
      if (Array.isArray(courses) && courses.length > 0) {
        console.log(`[API] Loaded ${courses.length} courses from GitHub: ${url}`);
        return courses;
      }
    } catch { /* try next */ }
  }
  throw new Error('No valid course data found on GitHub');
}

// ── Main exported function ───────────────────────────────────
async function fetchAllCourses() {
  // 1. Try live API
  try {
    const data = await _get(`${API_BASE}/courses/search?searchQuery=`);
    const courses = data.courses || [];
    if (courses.length > 0) {
      console.log(`[API] ✓ Live API — ${courses.length} courses`);
      return courses;
    }
  } catch (e) {
    console.warn('[API] Live API failed:', e.message);
  }

  // 2. Try GitHub
  try {
    return await _fetchFromGitHub();
  } catch (e) {
    console.warn('[API] GitHub failed:', e.message);
  }

  // 3. Fall back to bundled local data
  try {
    const data = await _get(LOCAL_DATA);
    const courses = data.courses || [];
    if (courses.length > 0) {
      console.log(`[API] ✓ Local data — ${courses.length} courses`);
      return courses;
    }
  } catch (e) {
    console.error('[API] Local data failed:', e.message);
  }

  throw new Error('Could not load course data from any source (API, GitHub, or local file).');
}
