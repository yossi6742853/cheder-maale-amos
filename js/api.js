// LocalStorage-first data layer
// Reads from data/*.json (committed in repo), writes to localStorage
// Background sync (optional) pushes to Apps Script when online

const STORAGE_KEY = 'cheder_data';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
const AGENT_TOKEN = 'BHT_AGENT_2026';
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/16rmLPnUyRPpJZ5YF_l74eRUSbRMrlwJXa1ND0drLNjM/edit';

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
    users: stored.users || (usersJ && usersJ.users) || [{username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'}],
    categories: (categoriesJ && categoriesJ.categories) || [],
  };
  // Always make sure admin exists
  if (!_data.users.find(u => u.username === 'admin')) {
    _data.users.unshift({username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'});
    saveStored(_data);
  }
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
    case 'listStudents': {
      const u = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (u.username === 'admin' || u.role === 'מנהל') return { ok: true, data: _data.students };
      const full = _data.users.find(x => x.username === u.username);
      if (!full || !full.visible_students || full.visible_students === 'all') return { ok: true, data: _data.students };
      const allowed = full.visible_students.split(',').map(s => s.trim()).filter(Boolean);
      return { ok: true, data: _data.students.filter(s => allowed.includes(String(s['מזהה']))) };
    }
    case 'listBehavior': {
      const u = JSON.parse(sessionStorage.getItem('user') || '{}');
      let events = _data.behavior;
      if (u.username !== 'admin' && u.role !== 'מנהל') {
        const full = _data.users.find(x => x.username === u.username);
        if (full) {
          if (full.visible_students && full.visible_students !== 'all') {
            const allowed = full.visible_students.split(',').map(s => s.trim()).filter(Boolean);
            events = events.filter(e => allowed.includes(String(e['תלמיד_מזהה'])));
          }
          if (full.visible_categories && full.visible_categories !== 'all') {
            const allowedC = full.visible_categories.split(',').map(s => s.trim()).filter(Boolean);
            events = events.filter(e => allowedC.includes(e['קטגוריה']));
          }
        }
      }
      return { ok: true, data: events };
    }
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
      syncRowToSheet('תלמידים', obj).then(updateSyncIndicator);
      return { ok: true, data: { rowCount: _data.students.length } };
    }
    case 'addBehavior': {
      const obj = args[0];
      if (!obj['תאריך']) obj['תאריך'] = new Date().toISOString();
      // Auto-generate ID if missing
      if (!obj['מזהה']) {
        const max = _data.behavior.reduce((m, e) => Math.max(m, parseInt(e['מזהה']) || 0), 0);
        obj['מזהה'] = max + 1;
      }
      _data.behavior.push(obj);
      saveStored(_data);
      syncRowToSheet('מעקב_התנהגות', obj).then(updateSyncIndicator);
      return { ok: true, data: { rowCount: _data.behavior.length } };
    }
    case 'updateStudent': {
      const obj = args[0];
      const id = obj['מזהה'];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.students[idx] = Object.assign({}, _data.students[idx], obj);
      saveStored(_data);
      syncUpdateRow('תלמידים', _data.students[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deleteStudent': {
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.students.splice(idx, 1);
      saveStored(_data);
      syncDeleteRow('תלמידים', 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'updateBehavior': {
      const obj = args[0];
      const id = obj['מזהה'];
      const idx = _data.behavior.findIndex(e => String(e['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.behavior[idx] = Object.assign({}, _data.behavior[idx], obj);
      saveStored(_data);
      syncUpdateRow('מעקב_התנהגות', _data.behavior[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deleteBehavior': {
      const id = args[0];
      const idx = _data.behavior.findIndex(e => String(e['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.behavior.splice(idx, 1);
      saveStored(_data);
      syncDeleteRow('מעקב_התנהגות', 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'updateUser': {
      const obj = args[0];
      const username = obj['שם משתמש'] || obj.username;
      const idx = _data.users.findIndex(u => u.username === username);
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.users[idx] = {
        username,
        password_hash: obj['סיסמה'] || obj.password_hash || _data.users[idx].password_hash,
        role: obj['תפקיד'] || obj.role,
        permissions: obj['הרשאות'] || obj.permissions,
        visible_students: obj['תלמידים_מורשים'] || obj.visible_students || 'all',
        visible_categories: obj['קטגוריות_מורשות'] || obj.visible_categories || 'all',
      };
      saveStored(_data);
      syncUpdateRow('משתמשים', obj, 'שם משתמש', username).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deleteUser': {
      const username = args[0];
      if (username === 'admin') return { ok: false, error: 'אסור למחוק admin' };
      const idx = _data.users.findIndex(u => u.username === username);
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.users.splice(idx, 1);
      saveStored(_data);
      syncDeleteRow('משתמשים', 'שם משתמש', username).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'addUser': {
      const obj = args[0];
      const newUser = {
        username: obj['שם משתמש'],
        password_hash: obj['סיסמה'],
        role: obj['תפקיד'],
        permissions: obj['הרשאות'],
        visible_students: obj['תלמידים_מורשים'] || 'all',
        visible_categories: obj['קטגוריות_מורשות'] || 'all',
      };
      const idx = _data.users.findIndex(u => u.username === newUser.username);
      if (idx >= 0) {
        _data.users[idx] = newUser;
      } else {
        _data.users.push(newUser);
      }
      saveStored(_data);
      syncRowToSheet('משתמשים', obj).then(updateSyncIndicator);
      return { ok: true, data: { rowCount: _data.users.length } };
    }
    case 'currentUserVisibleStudents': {
      // Returns student IDs current user can see (or null = all)
      const u = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (u.username === 'admin' || u.role === 'מנהל') return { ok: true, data: null };
      const fullUser = _data.users.find(x => x.username === u.username);
      if (!fullUser || !fullUser.visible_students || fullUser.visible_students === 'all') return { ok: true, data: null };
      return { ok: true, data: fullUser.visible_students.split(',').map(s => s.trim()).filter(Boolean) };
    }
    case 'currentUserVisibleCategories': {
      const u = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (u.username === 'admin' || u.role === 'מנהל') return { ok: true, data: null };
      const fullUser = _data.users.find(x => x.username === u.username);
      if (!fullUser || !fullUser.visible_categories || fullUser.visible_categories === 'all') return { ok: true, data: null };
      return { ok: true, data: fullUser.visible_categories.split(',').map(s => s.trim()).filter(Boolean) };
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
    const r = await fetch(APPS_SCRIPT_URL + '?action=ping&token=' + AGENT_TOKEN, { method: 'GET', mode: 'cors' });
    _online = r.ok;
  } catch {
    _online = false;
  }
  updateSyncIndicator();
}

async function syncRowToSheet(tab, row) {
  try {
    const url = APPS_SCRIPT_URL + '?action=cheder_appendRow&token=' + AGENT_TOKEN +
      '&tab=' + encodeURIComponent(tab) + '&row=' + encodeURIComponent(JSON.stringify(row));
    const r = await fetch(url, { method: 'GET', mode: 'cors' });
    if (!r.ok) return false;
    const d = await r.json();
    return d.ok;
  } catch { return false; }
}

async function syncUpdateRow(tab, row, matchKey, matchValue) {
  try {
    const params = new URLSearchParams({
      action: 'cheder_updateRow', token: AGENT_TOKEN,
      tab, row: JSON.stringify(row), matchKey, matchValue: String(matchValue),
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString(), { method: 'GET', mode: 'cors' });
    if (!r.ok) return false;
    const d = await r.json();
    return d.ok;
  } catch { return false; }
}

async function syncDeleteRow(tab, matchKey, matchValue) {
  try {
    const params = new URLSearchParams({
      action: 'cheder_deleteRow', token: AGENT_TOKEN,
      tab, matchKey, matchValue: String(matchValue),
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString(), { method: 'GET', mode: 'cors' });
    if (!r.ok) return false;
    const d = await r.json();
    return d.ok;
  } catch { return false; }
}

async function pullFromSheet(tab) {
  try {
    const params = new URLSearchParams({
      action: 'cheder_listRows', token: AGENT_TOKEN, tab,
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString(), { method: 'GET', mode: 'cors' });
    if (!r.ok) return null;
    const d = await r.json();
    return d.ok ? d.rows : null;
  } catch { return null; }
}

// Bi-directional sync — pull latest from sheet on load
async function pullAllFromSheet() {
  const [students, behavior, users] = await Promise.all([
    pullFromSheet('תלמידים'),
    pullFromSheet('מעקב_התנהגות'),
    pullFromSheet('משתמשים'),
  ]);
  if (students && students.length) _data.students = students;
  if (behavior && behavior.length) _data.behavior = behavior;
  if (users && users.length) {
    _data.users = users.map(u => ({
      username: u['שם משתמש'],
      password_hash: u['סיסמה'],
      role: u['תפקיד'],
      permissions: u['הרשאות'],
      visible_students: u['תלמידים_מורשים'] || 'all',
      visible_categories: u['קטגוריות_מורשות'] || 'all',
    }));
    if (!_data.users.find(u => u.username === 'admin')) {
      _data.users.unshift({username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'});
    }
  }
  saveStored(_data);
  _online = true;
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

// Run sync check on load + pull latest from sheet
window.addEventListener('load', () => {
  setTimeout(async () => {
    await syncToBackend();
    if (_online && _data) {
      await pullAllFromSheet();
      // Refresh current view
      try {
        if (typeof loadStats === 'function') loadStats();
        const hash = location.hash.replace('#','');
        if (hash && typeof showPage === 'function') showPage(hash);
      } catch (e) {}
    }
  }, 1500);
});

// Periodic pull every 60 seconds for true bi-directional sync
setInterval(async () => {
  if (_online && _data) {
    await pullAllFromSheet();
  }
}, 60000);
