/**
 * Monitoring.gs — Daily server-side backup + health snapshot to Drive.
 * 2026-05-28
 *
 * Two time-based triggers (registered once via action=bhtSetupMonitoring):
 *   1. dailyBhtSnapshot()      — 03:00 daily — exports all cheder tabs to JSON
 *   2. dailyBhtHealthSnapshot()— 03:05 daily — writes a 1-page health JSON
 *
 * Storage:
 *   /cheder-bht-backups/cheder-bht-YYYY-MM-DD.json   (14-day retention)
 *   /cheder-bht-health/health-YYYY-MM-DD.json        (30-day retention)
 *
 * Passwords are NEVER included in backups (zero-trust — backups are still
 * sensitive but at least don't expose auth material).
 *
 * All functions are admin-only when triggered via webhook (use adminGate_).
 */

const _BHT_BACKUP_FOLDER  = 'cheder-bht-backups';
const _BHT_HEALTH_FOLDER  = 'cheder-bht-health';
const _BHT_BACKUP_RETAIN_DAYS = 14;
const _BHT_HEALTH_RETAIN_DAYS = 30;
const _BHT_TABS = [
  'תלמידים', 'מעקב_התנהגות', 'משתמשים', 'כיתות', 'תפקוד',
  'מבחנים', 'כדורים', 'אסיפות', 'נוכחות', 'קטגוריות',
  'שיחות', 'חתימות', 'משימות', 'פרויקטים', 'דוח_אישי', 'יומן_פעולות',
];

function _bhtGetOrCreateFolder(name) {
  const it = DriveApp.getFoldersByName(name);
  return it.hasNext() ? it.next() : DriveApp.createFolder(name);
}

function _bhtSheet() {
  const id = PropertiesService.getScriptProperties().getProperty('BHT_CHEDER_SHEET_ID');
  if (!id) throw new Error('BHT_CHEDER_SHEET_ID not set');
  return SpreadsheetApp.openById(id);
}

function _bhtRowsAsObjects(sheet) {
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (!data.length) return [];
  const headers = data[0].map(String);
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // skip fully-empty rows
    const nonEmpty = row.some(c => c !== '' && c != null);
    if (!nonEmpty) continue;
    const obj = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    out.push(obj);
  }
  return out;
}

function _bhtPurgeOlderThan(folder, days) {
  if (!folder || !days) return 0;
  const cutoff = Date.now() - days * 86400000;
  let removed = 0;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (f.getLastUpdated().getTime() < cutoff) {
      try { folder.removeFile(f); f.setTrashed(true); removed++; } catch (e) {}
    }
  }
  return removed;
}

/**
 * Full backup of all cheder tabs to a single dated JSON in Drive.
 * Excludes the password column from משתמשים.
 */
function dailyBhtSnapshot() {
  const ss = _bhtSheet();
  const date = new Date().toISOString().slice(0, 10);
  const payload = { ts: new Date().toISOString(), instance: 'bht', tabs: {} };
  let totalRows = 0;

  for (const tab of _BHT_TABS) {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) { payload.tabs[tab] = { rows: 0, missing: true }; continue; }
    let rows = _bhtRowsAsObjects(sheet) || [];
    // Zero-trust: drop the password column from משתמשים
    if (tab === 'משתמשים') rows = rows.map(r => { const o = Object.assign({}, r); delete o['סיסמה']; return o; });
    payload.tabs[tab] = { rows: rows.length, data: rows };
    totalRows += rows.length;
  }
  payload.totalRows = totalRows;

  const folder = _bhtGetOrCreateFolder(_BHT_BACKUP_FOLDER);
  const name = 'cheder-bht-' + date + '.json';
  // overwrite same-day backup if exists
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) { try { folder.removeFile(existing.next()); } catch (e) {} }
  const file = folder.createFile(name, JSON.stringify(payload), 'application/json');

  const purged = _bhtPurgeOlderThan(folder, _BHT_BACKUP_RETAIN_DAYS);
  return { ok: true, file: file.getName(), folder: folder.getName(), totalRows, purged };
}

/**
 * Lightweight health snapshot: row counts per tab + password-storage health.
 * Marks anomalies (e.g., student count dropped >20%, empty tab).
 */
function dailyBhtHealthSnapshot() {
  const ss = _bhtSheet();
  const date = new Date().toISOString().slice(0, 10);
  const health = { ts: new Date().toISOString(), instance: 'bht', tabs: {}, anomalies: [] };

  for (const tab of _BHT_TABS) {
    const sheet = ss.getSheetByName(tab);
    if (!sheet) { health.tabs[tab] = { rows: 0, missing: true }; health.anomalies.push('missing-tab:' + tab); continue; }
    const data = sheet.getDataRange().getValues();
    const rows = Math.max(0, data.length - 1);
    health.tabs[tab] = { rows };
    // Extra: for משתמשים, breakdown password storage
    if (tab === 'משתמשים' && data.length > 1) {
      const headers = data[0];
      const pwdIdx = headers.indexOf('סיסמה');
      let hashed = 0, plain = 0, empty = 0;
      for (let i = 1; i < data.length; i++) {
        const p = String((pwdIdx >= 0 ? data[i][pwdIdx] : '') || '');
        if (!p) empty++;
        else if (p.startsWith('sha256:')) hashed++;
        else plain++;
      }
      health.tabs[tab].pwd = { hashed, plain, empty };
      if (plain > 0) health.anomalies.push('plain-passwords:' + plain);
    }
    if (rows === 0 && tab !== 'דוח_אישי' && tab !== 'יומן_פעולות') {
      health.anomalies.push('empty-tab:' + tab);
    }
  }

  // Compare to yesterday's row counts if we have a prior file (drop detection)
  const folder = _bhtGetOrCreateFolder(_BHT_HEALTH_FOLDER);
  const yesterdayName = 'health-' + new Date(Date.now() - 86400000).toISOString().slice(0, 10) + '.json';
  const yesterday = folder.getFilesByName(yesterdayName);
  if (yesterday.hasNext()) {
    try {
      const prev = JSON.parse(yesterday.next().getBlob().getDataAsString());
      for (const tab of Object.keys(health.tabs)) {
        const prevRows = (prev.tabs && prev.tabs[tab] && prev.tabs[tab].rows) || 0;
        const curRows = health.tabs[tab].rows;
        if (prevRows >= 10 && curRows < prevRows * 0.8) {
          health.anomalies.push('row-drop:' + tab + ':' + prevRows + '→' + curRows);
        }
      }
    } catch (e) {}
  }

  health.summary = health.anomalies.length === 0 ? 'OK' : 'ATTENTION:' + health.anomalies.length;

  const name = 'health-' + date + '.json';
  const existing = folder.getFilesByName(name);
  if (existing.hasNext()) { try { folder.removeFile(existing.next()); } catch (e) {} }
  const file = folder.createFile(name, JSON.stringify(health, null, 2), 'application/json');

  const purged = _bhtPurgeOlderThan(folder, _BHT_HEALTH_RETAIN_DAYS);
  return { ok: true, file: file.getName(), summary: health.summary, anomalies: health.anomalies, purged };
}

/**
 * One-time setup: register the two daily triggers.
 * Safe to call multiple times — removes existing 'dailyBht*' triggers first.
 */
function setupBhtMonitoring() {
  const triggers = ScriptApp.getProjectTriggers();
  let removed = 0;
  for (const t of triggers) {
    const fn = t.getHandlerFunction();
    if (fn === 'dailyBhtSnapshot' || fn === 'dailyBhtHealthSnapshot') {
      try { ScriptApp.deleteTrigger(t); removed++; } catch (e) {}
    }
  }
  ScriptApp.newTrigger('dailyBhtSnapshot').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('dailyBhtHealthSnapshot').timeBased().everyDays(1).atHour(3).nearMinute(5).create();
  return { ok: true, removed, registered: ['dailyBhtSnapshot @03:00', 'dailyBhtHealthSnapshot @03:05'] };
}

// ============================================================
// WEBHOOK ACTIONS — admin-gated (rely on adminGate_ in AuthV2.js)
// ============================================================
function actionBhtSnapshot(params) {
  const a = adminGate_(params);
  if (!a.ok) return { ok: false, error: a.error };
  try { return dailyBhtSnapshot(); } catch (e) { return { ok: false, error: e.message }; }
}
function actionBhtHealth(params) {
  const a = adminGate_(params);
  if (!a.ok) return { ok: false, error: a.error };
  try { return dailyBhtHealthSnapshot(); } catch (e) { return { ok: false, error: e.message }; }
}
function actionBhtSetupMonitoring(params) {
  const a = adminGate_(params);
  if (!a.ok) return { ok: false, error: a.error };
  try { return setupBhtMonitoring(); } catch (e) { return { ok: false, error: e.message }; }
}

/**
 * Return the JSON content of the latest health snapshot (admin only).
 * Used by pack-147 to surface nightly anomalies in the admin's browser.
 */
function actionGetLatestHealth(params) {
  const a = adminGate_(params);
  if (!a.ok) return { ok: false, error: a.error };
  try {
    const folder = _bhtGetOrCreateFolder(_BHT_HEALTH_FOLDER);
    const files = folder.getFiles();
    let latest = null;
    while (files.hasNext()) {
      const f = files.next();
      if (!latest || f.getLastUpdated() > latest.getLastUpdated()) latest = f;
    }
    if (!latest) return { ok: true, health: null };
    return { ok: true, name: latest.getName(), health: JSON.parse(latest.getBlob().getDataAsString()) };
  } catch (e) { return { ok: false, error: e.message }; }
}
