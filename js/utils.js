// ============================================================
// CountsFor — Utilities
// ============================================================

function debounce(fn, ms = 250) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

function esc(s) {
  if (!s) return '';
  const m = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
  return String(s).replace(/[&<>"']/g, c => m[c]);
}

function loadStore(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
}

function saveStore(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

let _toastTimer;
function showToast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('visible'), 2200);
}

function formatPrereq(text) {
  if (!text || text === 'None' || text === 'none') return null;
  return text;
}
