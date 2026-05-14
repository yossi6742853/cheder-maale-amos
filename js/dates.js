// Unified date formatting — always Gregorian + Hebrew
// Use these helpers everywhere instead of new Date().toLocaleDateString()

// Hebrew month names (full)
const HEB_MONTHS = ['ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר','אדר ב'];

// Parse anything into a JS Date. Returns null if invalid.
function parseAnyDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  // DD/MM/YYYY or MM/DD/YYYY (ambiguous — try DMY first, fall back to MDY)
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    let y = parseInt(m[3]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    // Heuristic: if first part > 12, it's DD/MM. If second part > 12, it's MM/DD.
    let day, mon;
    if (a > 12) { day = a; mon = b; }
    else if (b > 12) { day = b; mon = a; }
    else {
      // Both <= 12 — prefer DD/MM (Israeli)
      day = a; mon = b;
    }
    const d = new Date(y, mon - 1, day);
    if (!isNaN(d) && d.getDate() === day && d.getMonth() === mon - 1) return d;
  }
  // Last resort
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Format as DD/MM/YYYY (locale-independent, no UTC shift)
function formatGreg(v) {
  const d = parseAnyDate(v);
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Format as Hebrew date — "ה' אב ה'תשפ"ו"
function formatHebrew(v) {
  const d = parseAnyDate(v);
  if (!d || typeof hebcal === 'undefined' || !hebcal.HDate) return '';
  try {
    return new hebcal.HDate(d).renderGematriya('he');
  } catch { return ''; }
}

// Combined: "DD/MM/YYYY · ה' אב תשפ"ו"
function formatDateBoth(v) {
  const g = formatGreg(v);
  const h = formatHebrew(v);
  if (!g) return '';
  if (!h) return g;
  return `${g} · ${h}`;
}

// Short Hebrew date — for compact spots (e.g., "ה' אב")
function formatHebrewShort(v) {
  const d = parseAnyDate(v);
  if (!d || typeof hebcal === 'undefined' || !hebcal.HDate) return '';
  try {
    const hd = new hebcal.HDate(d);
    const dayGem = hebcal.gematriya(hd.getDate());
    const m = hd.getMonth();
    const isLeap = hebcal.HDate.isLeapYear ? hebcal.HDate.isLeapYear(hd.getFullYear()) : false;
    const NORMAL = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר'];
    const LEAP = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר א','אדר ב'];
    const monthName = (isLeap ? LEAP : NORMAL)[m] || '';
    return `${dayGem} ${monthName}`;
  } catch { return ''; }
}

// Get parsha for a given date — the parsha of the upcoming Shabbat
// (on Shabbat itself, returns that Shabbat's parsha)
function getParshaFor(v) {
  const d = parseAnyDate(v);
  if (!d || typeof hebcal === 'undefined' || !hebcal.HDate || !hebcal.Sedra) return '';
  try {
    const sat = new Date(d);
    // If it's Saturday, use this Saturday; otherwise advance to next Saturday
    if (sat.getDay() !== 6) sat.setDate(sat.getDate() + ((6 - sat.getDay()) % 7));
    const hd = new hebcal.HDate(sat);
    const sedra = new hebcal.Sedra(hd.getFullYear(), false);
    const p = sedra.lookup(hd);
    if (p && p.parsha && p.parsha.length) return p.parsha.join(' ');
  } catch {}
  return '';
}

// For pure Hebrew date object (e.g., birthday — Hebrew year of birth)
function hebrewBirthday(v) {
  const d = parseAnyDate(v);
  if (!d || typeof hebcal === 'undefined' || !hebcal.HDate) return '';
  try {
    const hd = new hebcal.HDate(d);
    const dayGem = hebcal.gematriya(hd.getDate());
    const m = hd.getMonth();
    const isLeap = hebcal.HDate.isLeapYear ? hebcal.HDate.isLeapYear(hd.getFullYear()) : false;
    const NORMAL = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר'];
    const LEAP = ['','ניסן','אייר','סיון','תמוז','אב','אלול','תשרי','חשון','כסלו','טבת','שבט','אדר א','אדר ב'];
    const monthName = (isLeap ? LEAP : NORMAL)[m] || '';
    const yearGem = hebcal.gematriya(hd.getFullYear() % 1000);
    return `${dayGem} ${monthName} ה'${yearGem}`;
  } catch { return ''; }
}

// Round-10 helper: safe date->ms (handles all formats, returns 0 if invalid)
function dateMs(v) {
  const d = parseAnyDate(v);
  return d ? d.getTime() : 0;
}
// Attach a live "Hebrew date" caption next to every <input type="date">
// inside a freshly-rendered modal. Idempotent — safe to call repeatedly.
function attachHebrewCaptions(rootEl) {
  const root = rootEl || document;
  root.querySelectorAll('input[type="date"]').forEach(inp => {
    if (inp.dataset.hebCap) return;
    inp.dataset.hebCap = '1';
    const cap = document.createElement('div');
    cap.className = 'small text-muted mt-1 heb-cap';
    cap.style.minHeight = '1em';
    const update = () => {
      const h = formatHebrew(inp.value);
      cap.textContent = h ? '— ' + h : '';
    };
    inp.addEventListener('input', update);
    inp.addEventListener('change', update);
    inp.parentNode.insertBefore(cap, inp.nextSibling);
    update();
  });
}
// Whenever a Bootstrap modal is shown, attach Hebrew captions automatically.
document.addEventListener('shown.bs.modal', e => {
  try { attachHebrewCaptions(e.target); } catch {}
});
window.attachHebrewCaptions = attachHebrewCaptions;

window.dateMs = dateMs;
window.parseAnyDate = parseAnyDate;
window.formatGreg = formatGreg;
window.formatHebrew = formatHebrew;
window.formatDateBoth = formatDateBoth;
window.formatHebrewShort = formatHebrewShort;
window.getParshaFor = getParshaFor;
window.hebrewBirthday = hebrewBirthday;
