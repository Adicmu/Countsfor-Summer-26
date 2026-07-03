// ============================================================
// CountsFor — Utilities
// ============================================================

/** Match backend normalize_cmu_email — always send @andrew.cmu.edu to the API. */
function normalizeCmuEmail(raw) {
  const e = (raw || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) return null;
  const parts = e.split('@');
  const local = parts[0];
  const domain = parts[1];
  if (domain === 'cmu.edu' || domain === 'qatar.cmu.edu') {
    return local + '@andrew.cmu.edu';
  }
  if (domain === 'andrew.cmu.edu') return e;
  return null;
}

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

function _xmlCell(value) {
  const s = String(value ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _xmlRow(cells) {
  return '<Row>' + cells.map(c => `<Cell><Data ss:Type="String">${_xmlCell(c)}</Data></Cell>`).join('') + '</Row>';
}

/** Download rows as an Excel-compatible .xls (SpreadsheetML) file. */
function downloadExcelSheet(filename, sheetName, headers, rows, metaRows) {
  const safeName = (sheetName || 'Courses').replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Courses';
  let xml = '<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
  xml += `<Worksheet ss:Name="${_xmlCell(safeName)}"><Table>`;
  if (metaRows && metaRows.length) {
    for (const row of metaRows) xml += _xmlRow(row);
    xml += _xmlRow(['']);
  }
  xml += _xmlRow(headers);
  for (const row of rows) xml += _xmlRow(row);
  xml += '</Table></Worksheet></Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xls') ? filename : filename + '.xls';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function slugifyFilename(text) {
  return String(text || '')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 72) || 'export';
}
