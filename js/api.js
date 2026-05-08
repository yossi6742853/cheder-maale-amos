// LocalStorage-first data layer
// Reads from data/*.json (committed in repo), writes to localStorage
// Background sync (optional) pushes to Apps Script when online

const STORAGE_KEY = 'cheder_maale_data';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
const AGENT_TOKEN = 'BHT_AGENT_2026';
const INSTANCE = '';
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
  const [studentsJ, behaviorJ, usersJ, categoriesJ, classesJ] = await Promise.all([
    fetchJson('data/students.json'),
    fetchJson('data/behavior.json'),
    fetchJson('data/users.json'),
    fetchJson('data/categories.json'),
    fetchJson('data/classes.json'),
  ]);
  const useStored = (arr) => Array.isArray(arr) && arr.length > 0;
  _data = {
    students: useStored(stored.students) ? stored.students : ((studentsJ && studentsJ.students) || []),
    behavior: useStored(stored.behavior) ? stored.behavior : ((behaviorJ && behaviorJ.events) || []),
    users: useStored(stored.users) ? stored.users : ((usersJ && usersJ.users) || [{username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'}]),
    categories: (categoriesJ && categoriesJ.categories) || [],
    classes: useStored(stored.classes) ? stored.classes : ((classesJ && classesJ.classes) || []),
  };
  // Default status to פעיל for legacy students
  _data.students.forEach(s => { if (!s['סטטוס']) s['סטטוס'] = 'פעיל'; });
  // Always make sure at least one admin exists
  if (!_data.users.find(u => u.role === 'מנהל')) {
    _data.users.unshift({username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'});
    saveStored(_data);
  }
  // Backfill IDs for behavior events that don't have one (from old data)
  let needSave = false;
  let maxBehaviorId = _data.behavior.reduce((m, e) => Math.max(m, parseInt(e['מזהה']) || 0), 0);
  _data.behavior.forEach(e => {
    if (!e['מזהה']) {
      maxBehaviorId += 1;
      e['מזהה'] = maxBehaviorId;
      needSave = true;
    }
  });
  let maxStudentId = _data.students.reduce((m, s) => Math.max(m, parseInt(s['מזהה']) || 0), 0);
  _data.students.forEach(s => {
    if (!s['מזהה']) {
      maxStudentId += 1;
      s['מזהה'] = maxStudentId;
      needSave = true;
    }
  });
  if (needSave) saveStored(_data);
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
      if (!obj['סטטוס']) obj['סטטוס'] = 'פעיל';
      _data.students.push(obj);
      saveStored(_data);
      markLocalChange();
      syncRowToSheet('תלמידים', obj).then(updateSyncIndicator);
      return { ok: true, data: { rowCount: _data.students.length } };
    }
    case 'listClasses':
      return { ok: true, data: [..._data.classes].sort((a,b) => (parseInt(a['סדר'])||0) - (parseInt(b['סדר'])||0)) };
    case 'addClass': {
      const obj = args[0];
      if (!obj['שם']) return { ok: false, error: 'שם כיתה חובה' };
      if (_data.classes.find(c => c['שם'] === obj['שם'])) return { ok: false, error: 'כיתה כבר קיימת' };
      const maxOrder = _data.classes.reduce((m,c) => Math.max(m, parseInt(c['סדר'])||0), 0);
      if (!obj['סדר']) obj['סדר'] = maxOrder + 1;
      _data.classes.push(obj);
      saveStored(_data);
      markLocalChange();
      syncRowToSheet('כיתות', obj).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'updateClass': {
      const obj = args[0];
      const oldName = obj['שם קודם'] || obj['שם'];
      const idx = _data.classes.findIndex(c => c['שם'] === oldName);
      if (idx < 0) return { ok: false, error: 'not found' };
      const cleanObj = { 'שם': obj['שם'], 'סדר': obj['סדר'] };
      _data.classes[idx] = cleanObj;
      // If renamed, update all students with old class name
      if (oldName !== cleanObj['שם']) {
        _data.students.forEach(s => {
          if (s['מחזור'] === oldName) {
            s['מחזור'] = cleanObj['שם'];
            syncUpdateRow('תלמידים', s, 'מזהה', s['מזהה']);
          }
        });
      }
      saveStored(_data);
      markLocalChange();
      if (oldName !== cleanObj['שם']) {
        syncDeleteRow('כיתות', 'שם', oldName).then(() =>
          syncRowToSheet('כיתות', cleanObj).then(updateSyncIndicator));
      } else {
        syncUpdateRow('כיתות', cleanObj, 'שם', oldName).then(updateSyncIndicator);
      }
      return { ok: true };
    }
    case 'deleteClass': {
      const name = args[0];
      const inUse = _data.students.filter(s => s['מחזור'] === name && s['סטטוס'] !== 'סיים').length;
      if (inUse > 0) return { ok: false, error: `יש ${inUse} תלמידים פעילים בכיתה זו — אי אפשר למחוק` };
      const idx = _data.classes.findIndex(c => c['שם'] === name);
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.classes.splice(idx, 1);
      saveStored(_data);
      markLocalChange();
      syncDeleteRow('כיתות', 'שם', name).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'promoteStudent': {
      // Move single student to next class up
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      const stu = _data.students[idx];
      const sorted = [..._data.classes].sort((a,b) => parseInt(a['סדר']) - parseInt(b['סדר']));
      const curIdx = sorted.findIndex(c => c['שם'] === stu['מחזור']);
      if (curIdx < 0) return { ok: false, error: 'הכיתה הנוכחית לא מוגדרת ברשימה' };
      if (curIdx === sorted.length - 1) {
        // Last class — graduate
        stu['סטטוס'] = 'סיים';
      } else {
        stu['מחזור'] = sorted[curIdx + 1]['שם'];
      }
      saveStored(_data);
      markLocalChange();
      syncUpdateRow('תלמידים', stu, 'מזהה', stu['מזהה']).then(updateSyncIndicator);
      return { ok: true, data: { newClass: stu['מחזור'], status: stu['סטטוס'] } };
    }
    case 'demoteStudent': {
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      const stu = _data.students[idx];
      const sorted = [..._data.classes].sort((a,b) => parseInt(a['סדר']) - parseInt(b['סדר']));
      const curIdx = sorted.findIndex(c => c['שם'] === stu['מחזור']);
      if (curIdx <= 0) return { ok: false, error: 'אי אפשר להוריד מהכיתה הראשונה' };
      stu['מחזור'] = sorted[curIdx - 1]['שם'];
      stu['סטטוס'] = 'פעיל';
      saveStored(_data);
      markLocalChange();
      syncUpdateRow('תלמידים', stu, 'מזהה', stu['מזהה']).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deactivateStudent': {
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.students[idx]['סטטוס'] = 'סיים';
      saveStored(_data);
      markLocalChange();
      syncUpdateRow('תלמידים', _data.students[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'reactivateStudent': {
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.students[idx]['סטטוס'] = 'פעיל';
      saveStored(_data);
      markLocalChange();
      syncUpdateRow('תלמידים', _data.students[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'promoteAll': {
      // Bulk year promotion: every active student moves up; last class graduates
      const sorted = [..._data.classes].sort((a,b) => parseInt(a['סדר']) - parseInt(b['סדר']));
      if (!sorted.length) return { ok: false, error: 'אין כיתות מוגדרות' };
      let promoted = 0, graduated = 0, skipped = 0;
      const updates = [];
      _data.students.forEach(stu => {
        if (stu['סטטוס'] === 'סיים') { skipped++; return; }
        const curIdx = sorted.findIndex(c => c['שם'] === stu['מחזור']);
        if (curIdx < 0) { skipped++; return; }
        if (curIdx === sorted.length - 1) {
          stu['סטטוס'] = 'סיים';
          graduated++;
        } else {
          stu['מחזור'] = sorted[curIdx + 1]['שם'];
          promoted++;
        }
        updates.push(stu);
      });
      saveStored(_data);
      markLocalChange();
      // Sync each updated student in background
      updates.forEach(s => syncUpdateRow('תלמידים', s, 'מזהה', s['מזהה']));
      setTimeout(updateSyncIndicator, 1000);
      return { ok: true, data: { promoted, graduated, skipped } };
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
      markLocalChange();
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
      markLocalChange();
      syncUpdateRow('תלמידים', _data.students[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deleteStudent': {
      const id = args[0];
      const idx = _data.students.findIndex(s => String(s['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.students.splice(idx, 1);
      saveStored(_data);
      markLocalChange();
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
      markLocalChange();
      syncUpdateRow('מעקב_התנהגות', _data.behavior[idx], 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'deleteBehavior': {
      const id = args[0];
      const idx = _data.behavior.findIndex(e => String(e['מזהה']) === String(id));
      if (idx < 0) return { ok: false, error: 'not found' };
      _data.behavior.splice(idx, 1);
      saveStored(_data);
      markLocalChange();
      syncDeleteRow('מעקב_התנהגות', 'מזהה', id).then(updateSyncIndicator);
      return { ok: true };
    }
    case 'updateUser': {
      const obj = args[0];
      const newUsername = obj['שם משתמש'] || obj.username;
      const lookupUsername = obj['שם משתמש קודם'] || newUsername;
      const idx = _data.users.findIndex(u => u.username === lookupUsername);
      if (idx < 0) return { ok: false, error: 'not found' };
      const updated = {
        username: newUsername,
        password_hash: obj['סיסמה'] || obj.password_hash || _data.users[idx].password_hash,
        role: obj['תפקיד'] || obj.role,
        permissions: obj['הרשאות'] || obj.permissions,
        visible_students: obj['תלמידים_מורשים'] || obj.visible_students || 'all',
        visible_categories: obj['קטגוריות_מורשות'] || obj.visible_categories || 'all',
      };
      _data.users[idx] = updated;
      saveStored(_data);
      markLocalChange();
      // Build clean sheet payload (no internal-only field)
      const sheetObj = {
        'שם משתמש': newUsername,
        'סיסמה': updated.password_hash,
        'תפקיד': updated.role,
        'הרשאות': updated.permissions,
        'תלמידים_מורשים': updated.visible_students,
        'קטגוריות_מורשות': updated.visible_categories,
      };
      // If renamed, delete old + add new in sheet; otherwise update
      if (lookupUsername !== newUsername) {
        syncDeleteRow('משתמשים', 'שם משתמש', lookupUsername).then(() =>
          syncRowToSheet('משתמשים', sheetObj).then(updateSyncIndicator));
      } else {
        syncUpdateRow('משתמשים', sheetObj, 'שם משתמש', newUsername).then(updateSyncIndicator);
      }
      // If session belongs to renamed user, refresh session
      const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
      if (sess.username === lookupUsername) {
        sess.username = newUsername;
        sess.role = updated.role;
        sess.permissions = updated.permissions;
        sessionStorage.setItem('user', JSON.stringify(sess));
      }
      return { ok: true };
    }
    case 'deleteUser': {
      const username = args[0];
      const idx = _data.users.findIndex(u => u.username === username);
      if (idx < 0) return { ok: false, error: 'not found' };
      const target = _data.users[idx];
      const adminCount = _data.users.filter(u => u.role === 'מנהל').length;
      if (target.role === 'מנהל' && adminCount === 1) {
        return { ok: false, error: 'לא ניתן למחוק את המנהל היחיד' };
      }
      _data.users.splice(idx, 1);
      saveStored(_data);
      markLocalChange();
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
      markLocalChange();
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
    if (_online) ensureSchemaOnce();
  } catch {
    _online = false;
  }
  updateSyncIndicator();
}

let _schemaEnsured = false;
async function ensureSchemaOnce() {
  if (_schemaEnsured) return;
  _schemaEnsured = true;
  try {
    await fetch(APPS_SCRIPT_URL + '?action=cheder_ensureSchema&token=' + AGENT_TOKEN +
      '&instance=' + INSTANCE, { method: 'GET', mode: 'cors' });
  } catch {}
}

async function syncRowToSheet(tab, row) {
  try {
    const url = APPS_SCRIPT_URL + '?action=cheder_appendRow&token=' + AGENT_TOKEN +
      '&instance=' + INSTANCE +
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
      action: 'cheder_updateRow', token: AGENT_TOKEN, instance: INSTANCE,
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
      action: 'cheder_deleteRow', token: AGENT_TOKEN, instance: INSTANCE,
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
      action: 'cheder_listRows', token: AGENT_TOKEN, instance: INSTANCE, tab,
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString(), { method: 'GET', mode: 'cors' });
    if (!r.ok) return null;
    const d = await r.json();
    return d.ok ? d.rows : null;
  } catch { return null; }
}

// Track local changes — pause pull-from-sheet while user is making changes
let _lastLocalChange = 0;
function markLocalChange() {
  _lastLocalChange = Date.now();
}

// Bi-directional sync — pull latest from sheet on load
async function pullAllFromSheet() {
  // Skip if user changed something in last 30 seconds (let local writes propagate)
  if (Date.now() - _lastLocalChange < 30000) {
    console.log('[sync] skipping pull — recent local change');
    return;
  }
  const [students, behavior, users, classes] = await Promise.all([
    pullFromSheet('תלמידים'),
    pullFromSheet('מעקב_התנהגות'),
    pullFromSheet('משתמשים'),
    pullFromSheet('כיתות'),
  ]);
  // Don't overwrite local with empty if local has data (avoid silent wipe)
  const safeReplace = (cur, fresh) => {
    if (fresh === null) return cur;
    if (Array.isArray(fresh) && fresh.length === 0 && Array.isArray(cur) && cur.length > 0) return cur;
    return fresh;
  };
  _data.students = safeReplace(_data.students, students);
  // Default status for any student that lost it
  _data.students.forEach(s => { if (!s['סטטוס']) s['סטטוס'] = 'פעיל'; });
  _data.behavior = safeReplace(_data.behavior, behavior);
  if (users !== null) {
    // Only apply users with valid schema
    const valid = users.filter(u => u['שם משתמש'] && u['סיסמה'] !== undefined && u['סיסמה'] !== '');
    if (!(valid.length === 0 && _data.users.length > 0)) {
      _data.users = valid.map(u => ({
        username: u['שם משתמש'],
        password_hash: String(u['סיסמה']),
        role: u['תפקיד'],
        permissions: u['הרשאות'],
        visible_students: u['תלמידים_מורשים'] || 'all',
        visible_categories: u['קטגוריות_מורשות'] || 'all',
      }));
      if (!_data.users.find(u => u.role === 'מנהל')) {
        _data.users.unshift({username:'admin',password_hash:'6742',role:'מנהל',permissions:'all'});
      }
    }
  }
  _data.classes = safeReplace(_data.classes, classes);
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
