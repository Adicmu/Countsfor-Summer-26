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

// ============================================================
// CountsFor Backend client — auth, flags, wishlist
// ============================================================
// The Python backend lives in /backend (see docs/BACKEND_API_CONTRACT.md).
// Dev: http://localhost:5000 ; production: a Render URL set below once
// deployed. Override at runtime by setting window.CF_BACKEND_URL before
// app.js loads.

// Backend URL resolution, in priority order:
//   1. localStorage 'cf_backend_override' — manual escape hatch for odd setups
//      (e.g. localhost frontend against the production backend)
//   2. window.CF_BACKEND_URL — set before this script loads
//   3. localhost/127.0.0.1 hostname — local Flask dev server on :5000, so the
//      committed production meta never needs hand-editing for local dev
//   4. <meta name="cf-backend-url"> — the deployed production URL
//   5. hardcoded fallback
function getBackendUrl() {
  try {
    const override = (localStorage.getItem('cf_backend_override') || '').trim();
    if (override) return override.replace(/\/$/, '');
  } catch (e) { /* storage blocked — fall through */ }
  if (typeof window !== 'undefined' && window.CF_BACKEND_URL) {
    return String(window.CF_BACKEND_URL).replace(/\/$/, '');
  }
  const host = (typeof location !== 'undefined' ? location.hostname : '');
  if (host === 'localhost' || host === '127.0.0.1' || host === '') {
    return 'http://localhost:5000';
  }
  const meta = typeof document !== 'undefined'
    ? document.querySelector('meta[name="cf-backend-url"]')
    : null;
  const fromMeta = (meta && meta.getAttribute('content') || '').trim();
  if (fromMeta) return fromMeta.replace(/\/$/, '');
  return 'https://countsfor-backend.onrender.com';
}

/** True when index.html sets a production backend URL (not demo-only GH Pages). */
function isBackendConfigured() {
  const meta = typeof document !== 'undefined'
    ? document.querySelector('meta[name="cf-backend-url"]')
    : null;
  return !!(meta && (meta.getAttribute('content') || '').trim());
}

const CF_BACKEND_URL = getBackendUrl();

// Public Google OAuth client ID. Set this in index.html via
// `<meta name="cf-google-client-id" content="…">` so it can ship to the
// browser without a build step. Falls back to the empty string (which
// triggers a clear UI error rather than silently breaking).
function getGoogleClientId() {
  const meta = typeof document !== 'undefined'
    ? document.querySelector('meta[name="cf-google-client-id"]')
    : null;
  return (meta && meta.getAttribute('content')) || '';
}

// Generic fetch wrapper:
//   - Always sends credentials so the session cookie is included.
//   - JSON in, JSON out (where applicable).
//   - Returns { ok, status, data, error } — never throws on HTTP errors so
//     callers can branch on status.
async function apiFetch(path, opts = {}) {
  const url = CF_BACKEND_URL.replace(/\/$/, '') + path;
  const init = {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  };
  if (opts.body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  }
  let res;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { ok: false, status: 0, error: 'network', message: e.message, data: null };
  }
  let data = null;
  if (res.status !== 204) {
    try { data = await res.json(); } catch { data = null; }
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    error: (!res.ok && data && data.error) || (res.ok ? null : 'http_' + res.status),
    message: (data && data.message) || null,
  };
}

// ── Auth ─────────────────────────────────────────────────────
async function apiSignInWithGoogle(credential) {
  return apiFetch('/api/auth/google', { method: 'POST', body: { credential } });
}
async function apiRegister(body) {
  return apiFetch('/api/auth/register', { method: 'POST', body });
}
async function apiLogin(body) {
  return apiFetch('/api/auth/login', { method: 'POST', body });
}
async function apiForgotPassword(email) {
  return apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email } });
}
async function apiResetPassword(body) {
  return apiFetch('/api/auth/reset-password', { method: 'POST', body });
}
/** @deprecated use apiLogin */
async function apiSignInWithEmail(email, name) {
  return apiFetch('/api/auth/email', { method: 'POST', body: { email, name: name || undefined } });
}
async function apiLogout()  { return apiFetch('/api/auth/logout', { method: 'POST' }); }
async function apiGetMe()   { return apiFetch('/api/me'); }
async function apiPatchMe(patch) {
  return apiFetch('/api/me', { method: 'PATCH', body: patch });
}

// ── Users (admin / area head) ────────────────────────────────
async function apiListUsers(query = '') {
  return apiFetch('/api/users' + (query ? '?' + query : ''));
}
async function apiPatchUser(id, patch) {
  return apiFetch('/api/users/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
}

async function fetchMinorCourses() {
  try {
    const res = await fetch('data/minor_courses.json');
    if (!res.ok) throw new Error('minor courses missing');
    return await res.json();
  } catch {
    return {};
  }
}

// ── Flags ────────────────────────────────────────────────────
async function apiCreateFlag(flag)        { return apiFetch('/api/flags', { method: 'POST', body: flag }); }
async function apiListFlags(query = '')   { return apiFetch('/api/flags' + (query ? '?' + query : '')); }
// Same endpoint as apiListFlags, named for intent: the server auto-scopes
// GET /api/flags to the caller's own submissions for non-admin faculty.
async function apiGetMyFlags(query = '')  { return apiFetch('/api/flags' + (query ? '?' + query : '')); }
async function apiUpdateFlag(id, patch)   { return apiFetch('/api/flags/' + encodeURIComponent(id), { method: 'PATCH', body: patch }); }

// ── Wishlist ─────────────────────────────────────────────────
async function apiGetWishlist()                 { return apiFetch('/api/wishlist'); }
async function apiAddWishlist(course_code)      { return apiFetch('/api/wishlist', { method: 'POST', body: { course_code } }); }
async function apiRemoveWishlist(course_code)   { return apiFetch('/api/wishlist/' + encodeURIComponent(course_code), { method: 'DELETE' }); }
