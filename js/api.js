// LocalStorage-first data layer
// Reads from data/*.json (committed in repo), writes to localStorage
// Background sync (optional) pushes to Apps Script when online

const STORAGE_KEY = 'cheder_data';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzK7LWmXwF1zaOs76wH7JncB19eXr_mfYQol5_k7uZBxq45hOHVIz_FDJPVhOTvF7DksA/exec';

let _data = null;
let _online = false;

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveStored(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
  catch {}
}

async function fetchJson(path) {
  try {
    const r = await fetch(path + '?t=' + Date.now());
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } catch { return null; }
}

async function loadData() {
  const stored = loadStored();
  // Try fetching latest JSON files
  const [studentsJ, behaviorJ, usersJ, categoriesJ] = await Promise.all([
    fetchJson('data/students.json'),
    fetchJson('data/behavior.json'),
    fetchJson('data/users.json'),
    fetchJson('data/categories.json'),
  ]);
  _data = {
    students: stored.students || (studentsJ && studentsJ.students) || [],
    behavior: stored.behavior || (behaviorJ && behaviorJ.events) || [],
    users: (usersJ && usersJ.users) || [{username:'admin',password_hash:'6742',role:'מנהל'}],
    categories: (categoriesJ && categoriesJ.categories) || [],
  };
  return _data;
}

function getData() {
  return _data || { students: [], behavior: [], users: [], categories: [] };
}

function saveData(part, value) {
  if (!_data) _data = { students:[], behavior:[], users:[], categories:[] };
  _data[part] = value;
  saveStored(_data);
}

// Compatibility shim: old api() function maps to local operations
async function api(fn, args) {
  await ensureLoaded();
  args = args || [];
  switch (fn) {
    case 'authenticate': {
      const [u, p] = args;
      const user = _data.users.find(x => x.username === u && x.password_hash === p);
      if (!user) return { ok: true, data: { ok: false, error: 'משתמש או סיסמה שגויים' } };
      return { ok: true, data: { ok: true, user: { username: u, role: user.role } } };
    }
    case 'listStudents':
      return { ok: true, data: _data.students };
    case 'listBehavior':
      return { ok: true, data: _data.behavior };
    case 'listCategories':
      return { ok: true, data: _data.categories.map(c => ({ 'קטגוריה': c.name })) };
    case 'listUsers':
      return { ok: true, data: _data.users.map(u => ({ 'שם משתמש': u.username, 'תפקיד': u.role, 'הרשאות': u.permissions || '' })) };
    case 'addStudent': {
      const obj = args[0];
      const max = _data.students.reduce((m, s) => Math.max(m, parseInt(s['מזהה']) || 0), 0);
      obj['מזהה'] = max + 1;
      _data.students.push(obj);
      saveStored(_data);
      queueSync();
      return { ok: true, data: { rowCount: _data.students.length } };
    }
    case 'addBehavior': {
      const obj = args[0];
      if (!obj['תאריך']) obj['תאריך'] = new Date().toISOString();
      _data.behavior.push(obj);
      saveStored(_data);
      queueSync();
      return { ok: true, data: { rowCount: _data.behavior.length } };
    }
    case 'addUser': {
      const obj = args[0];
      _data.users.push({
        username: obj['שם משתמש'],
        password_hash: obj['סיסמה'],
        role: obj['תפקיד'],
        permissions: obj['הרשאות'],
      });
      saveStored(_data);
      queueSync();
      return { ok: true };
    }
    case 'exportPDF':
      // generate PDF in browser using jsPDF or similar
      return { ok: false, error: 'ייצוא PDF טרם נתמך, יוטמע בקרוב' };
    default:
      return { ok: false, error: 'unknown ' + fn };
  }
}

let _loaded = false;
async function ensureLoaded() {
  if (_loaded) return;
  _loaded = true;
  await loadData();
}

// Background sync to Apps Script (best-effort)
let _syncTimer = null;
function queueSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(syncToBackend, 5000);
}

async function syncToBackend() {
  try {
    const r = await fetch(APPS_SCRIPT_URL + '?action=ping', { method: 'GET', mode: 'cors' });
    _online = r.ok;
  } catch {
    _online = false;
  }
  updateSyncIndicator();
}

function updateSyncIndicator() {
  let el = document.getElementById('sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-indicator';
    el.className = 'sync-indicator';
    document.body.appendChild(el);
  }
  if (_online) {
    el.innerHTML = '<i class="bi bi-cloud-check-fill sync-online"></i> מסונכרן';
  } else {
    el.innerHTML = '<i class="bi bi-cloud-slash sync-offline"></i> מצב מקומי';
  }
}

// Run sync check on load
window.addEventListener('load', () => setTimeout(syncToBackend, 1000));
