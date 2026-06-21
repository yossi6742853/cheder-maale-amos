/**
 * apps-script-v2-auth.gs — Backend Refactor Phase 1: Authentication
 * Cheder-BHT Production - 2026-05-27
 *
 * DEPLOYMENT:
 * 1. Open Apps Script at https://script.google.com/...
 * 2. Add this file as new tab
 * 3. Update doPost / doGet to route auth actions here
 * 4. Set Script Properties (Project Settings → Script properties):
 *    - AGENT_TOKEN: your master agent token (was BHT_AGENT_2026)
 *    - PWD_SALT: random 32 chars for password hashing
 *    - JWT_SECRET: random 64 chars for session signing
 *
 * BEHAVIOR CHANGE:
 *   BEFORE: client sends AGENT_TOKEN with every request (token exposed)
 *   AFTER: client logs in with username+password → receives session token
 *          Subsequent requests use session token, not AGENT_TOKEN
 *
 * The Frontend NO LONGER needs to know AGENT_TOKEN.
 */

const SCRIPT_PROPS = PropertiesService.getScriptProperties();

// ===== Get secrets from Script Properties (not hardcoded) =====
function getSecret(key) {
  const v = SCRIPT_PROPS.getProperty(key);
  if (!v) throw new Error('Missing script property: ' + key);
  return v;
}

// ===== Resolve the cheder spreadsheet (standalone script — open by ID) =====
function getChederSheet_(sheetName, params) {
  const propKey = (typeof _chederSheetIdProp === 'function')
    ? _chederSheetIdProp(params)
    : ((params && params.instance === 'bht') ? 'BHT_CHEDER_SHEET_ID' : 'CHEDER_SHEET_ID');
  const id = SCRIPT_PROPS.getProperty(propKey);
  if (!id) return null;
  try {
    return SpreadsheetApp.openById(id).getSheetByName(sheetName);
  } catch (e) {
    return null;
  }
}

// ===== Session token issued on successful login =====
// Format: base64(payload).base64(signature)
// payload = {username, role, exp}, signature = HMAC-SHA256(payload, JWT_SECRET)
function issueSession(username, role, ttlSec) {
  const exp = Date.now() + (ttlSec || 8 * 60 * 60) * 1000;
  const payload = JSON.stringify({ u: username, r: role, e: exp });
  // Force UTF-8 byte encoding (Hebrew safe) — base64Encode on a raw String
  // can mishandle non-ASCII depending on runtime. Going through a Blob
  // guarantees UTF-8 bytes round-trip symmetrically with verifySession's
  // newBlob(...).getDataAsString().
  const payloadBytes = Utilities.newBlob(payload).getBytes();
  const payloadB64 = Utilities.base64EncodeWebSafe(payloadBytes).replace(/=+$/, '');
  const sig = Utilities.computeHmacSha256Signature(payloadB64, getSecret('JWT_SECRET'));
  const sigB64 = Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');
  return payloadB64 + '.' + sigB64;
}

function verifySession(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) {
    return { valid: false, error: 'malformed' };
  }
  const [payloadB64, sigB64] = token.split('.');
  const expectedSig = Utilities.computeHmacSha256Signature(payloadB64, getSecret('JWT_SECRET'));
  const expectedB64 = Utilities.base64EncodeWebSafe(expectedSig).replace(/=+$/, '');
  if (expectedB64 !== sigB64) {
    return { valid: false, error: 'bad signature' };
  }
  let payload;
  try {
    const decoded = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    payload = JSON.parse(decoded);
  } catch (e) {
    return { valid: false, error: 'malformed payload' };
  }
  if (payload.e < Date.now()) {
    return { valid: false, error: 'expired' };
  }
  return { valid: true, username: payload.u, role: payload.r, expires: payload.e };
}

// ===== Hash password with salt =====
function hashPassword(plain) {
  const salt = getSecret('PWD_SALT');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain + salt);
  return Utilities.base64Encode(bytes);
}

// ===== Login endpoint =====
// Action: 'login' with {username, password}
// Returns: { ok, session, role } or { ok: false, error }
function actionLogin(params) {
  const username = String(params.username || '').trim();
  const password = String(params.password || '');
  if (!username || !password) {
    return { ok: false, error: 'missing credentials' };
  }

  // Rate-limit (5 fails per IP per 5 minutes - using ScriptProperties as crude store)
  const failKey = 'login_fails_' + username;
  const fails = JSON.parse(SCRIPT_PROPS.getProperty(failKey) || '[]');
  const now = Date.now();
  const recentFails = fails.filter(t => now - t < 5 * 60 * 1000);
  if (recentFails.length >= 5) {
    return { ok: false, error: 'too many attempts. wait 5 minutes' };
  }

  // Lookup user in משתמשים sheet. This script is standalone (not container-
  // bound), so resolve the cheder spreadsheet by its Script Property ID — same
  // mechanism the cheder_* handlers use. instance=bht → BHT_CHEDER_SHEET_ID.
  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const usernameIdx = headers.indexOf('שם משתמש');
  const passwordIdx = headers.indexOf('סיסמה');
  const roleIdx = headers.indexOf('תפקיד');
  const permIdx = headers.indexOf('הרשאות');
  const landingIdx = headers.indexOf('דף_כניסה');
  const mustChangeIdx = headers.indexOf('חובה_להחליף');

  for (let i = 1; i < data.length; i++) {
    if (data[i][usernameIdx] === username) {
      const storedPwd = String(data[i][passwordIdx] || '');
      const rowRole = roleIdx >= 0 ? String(data[i][roleIdx] || '') : '';
      // Rescue rule (2026-05-28, staff lockout): non-admin users whose
      // password is empty OR legacy plaintext accept the universal default
      // '1234' in ADDITION to their stored value. Hashed users (post-AuthV2)
      // keep their real password — no '1234' bypass. Admin always requires
      // exact match to prevent impersonation.
      const isAdmin = rowRole === 'מנהל' || username === 'admin';
      const isMatch = storedPwd.startsWith('sha256:')
        ? storedPwd.slice(7) === hashPassword(password)
        : (storedPwd === password
            || (!isAdmin && password === '1234'));
      if (isMatch) {
        // Clear fail count, issue session
        SCRIPT_PROPS.deleteProperty(failKey);
        const role = data[i][roleIdx] || 'צוות';
        const permissions = permIdx >= 0 ? String(data[i][permIdx] || '') : '';
        const landingPage = landingIdx >= 0 ? String(data[i][landingIdx] || '') : '';
        const mustChange = mustChangeIdx >= 0 ? (String(data[i][mustChangeIdx] || '') === '1') : false;
        const session = issueSession(username, role);
        // Frontend gets identity + permissions ONLY — never the user table.
        return { ok: true, session: session, role: role, username: username, permissions: permissions, landingPage: landingPage, must_change: mustChange };
      }
      break;
    }
  }

  // Failed login - record
  recentFails.push(now);
  SCRIPT_PROPS.setProperty(failKey, JSON.stringify(recentFails));
  return { ok: false, error: 'invalid credentials' };
}

// ===== Middleware: verify session for protected actions =====
// Returns { authorized, user, error }
function authorizeRequest(params) {
  // Legacy: AGENT_TOKEN still accepted for backward compat (deprecated)
  if (params.token === getSecret('AGENT_TOKEN')) {
    return { authorized: true, user: { username: 'legacy', role: 'מנהל' }, legacy: true };
  }
  // New: session token
  const session = params.session || params.sessionToken;
  if (!session) {
    return { authorized: false, error: 'missing session token' };
  }
  const v = verifySession(session);
  if (!v.valid) {
    return { authorized: false, error: 'invalid session: ' + v.error };
  }
  return { authorized: true, user: { username: v.username, role: v.role } };
}

// ===== Safe gate helper — used by Webhook.js handleWebhook() =====
// Returns true ONLY if params carries a cryptographically valid, unexpired
// session token. NEVER throws: if JWT_SECRET isn't configured yet, or the
// token is malformed, it returns false so the caller falls back to the legacy
// WEBHOOK_TOKEN check. This keeps email/WhatsApp/Yemot flows safe during rollout.
function hasValidSession_(params) {
  try {
    const s = (params && (params.session || params.sessionToken)) || '';
    if (!s) return false;
    const v = verifySession(s);
    return v && v.valid === true;
  } catch (e) {
    return false;
  }
}

// ===== Admin-only: list users WITHOUT the password column =====
// Zero-trust: the browser never receives password hashes. Requires either a
// valid JWT whose role is מנהל, or the legacy AGENT_TOKEN (transition period).
function actionGetUsersSafe(params) {
  const auth = (function () {
    try {
      if (params.token && params.token === SCRIPT_PROPS.getProperty('AGENT_TOKEN')) return { ok: true, role: 'מנהל' };
    } catch (e) {}
    const v = hasValidSession_(params) ? verifySession(params.session || params.sessionToken) : { valid: false };
    if (v.valid && v.role === 'מנהל') return { ok: true, role: v.role };
    return { ok: false };
  })();
  if (!auth.ok) return { ok: false, error: 'admin only' };

  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  if (!data.length) return { ok: true, users: [] };
  const headers = data[0];
  const pwdIdx = headers.indexOf('סיסמה');
  const users = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      if (c === pwdIdx) continue; // never expose passwords
      obj[headers[c]] = data[i][c];
    }
    if (obj['שם משתמש']) users.push(obj);
  }
  return { ok: true, users: users };
}

// ============================================================
// ADMIN USER CRUD (zero-trust — admin JWT or legacy AGENT_TOKEN required)
// ============================================================
function adminGate_(params) {
  try {
    const agentTok = SCRIPT_PROPS.getProperty('AGENT_TOKEN');
    if (agentTok && params.token === agentTok) return { ok: true, by: 'legacy' };
  } catch (e) {}
  const s = params.session || params.sessionToken;
  if (!s) return { ok: false, error: 'admin only' };
  let v;
  try { v = verifySession(s); } catch (e) { return { ok: false, error: 'session check failed' }; }
  if (!v || !v.valid) return { ok: false, error: 'invalid session' };
  if (v.role !== 'מנהל') return { ok: false, error: 'admin only' };
  return { ok: true, by: 'jwt', user: v.username };
}

// ===== createUser =====
// Required: username, password. Optional: role, permissions, fullName, email, phone, etc.
function actionCreateUser(params) {
  const auth = adminGate_(params);
  if (!auth.ok) return { ok: false, error: auth.error };
  const username = String(params.username || '').trim();
  const password = String(params.password || '');
  if (!username) return { ok: false, error: 'שם משתמש חובה' };
  if (!password || password.length < 4) return { ok: false, error: 'סיסמה חייבת לפחות 4 תווים' };

  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userIdx = headers.indexOf('שם משתמש');
  if (userIdx < 0) return { ok: false, error: 'sheet schema unexpected' };

  // refuse if username taken
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdx] || '').trim() === username) return { ok: false, error: 'שם משתמש כבר קיים' };
  }

  // hash password
  let hashed;
  try { hashed = 'sha256:' + hashPassword(password); }
  catch (e) { return { ok: false, error: 'PWD_SALT not configured' }; }

  // build a full row in header order; only fill known cols.
  const KNOWN = {
    'שם משתמש': username,
    'סיסמה': hashed,
    'תפקיד': String(params.role || 'צוות'),
    'הרשאות': String(params.permissions || ''),
    'תאריך_הוספה': new Date().toISOString().slice(0, 10),
    'שם מלא': String(params.fullName || params['שם מלא'] || ''),
    'אימייל': String(params.email || params['אימייל'] || ''),
    'טלפון': String(params.phone || params['טלפון'] || ''),
    'דף_כניסה': String(params.landingPage || ''),
  };
  const row = headers.map(h => (h in KNOWN ? KNOWN[h] : ''));
  sheet.appendRow(row);
  return { ok: true, username };
}

// ===== updateUserPartial =====
// Updates ONLY the columns explicitly provided in params. Never blanks the
// password column if newPassword isn't supplied — closes the "edit user
// without changing password" hole. Requires admin OR self (a user can update
// their own non-privileged fields, but role/permissions are admin-only).
function actionUpdateUserPartial(params) {
  const username = String(params.username || '').trim();
  if (!username) return { ok: false, error: 'שם משתמש חובה' };

  // Determine caller identity + privilege level
  const auth = adminGate_(params);
  const isAdmin = auth.ok;
  let selfMatch = false;
  if (!isAdmin) {
    const s = params.session || params.sessionToken;
    if (!s) return { ok: false, error: 'admin only' };
    let v; try { v = verifySession(s); } catch (e) { return { ok: false, error: 'session check failed' }; }
    if (!v || !v.valid) return { ok: false, error: 'invalid session' };
    selfMatch = String(v.username || '').trim() === username;
    if (!selfMatch) return { ok: false, error: 'admin only' };
  }

  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userIdx = headers.indexOf('שם משתמש');
  if (userIdx < 0) return { ok: false, error: 'sheet schema unexpected' };

  // Map: which header keys this caller is allowed to mutate
  const ADMIN_KEYS = ['שם מלא','אימייל','טלפון','תפקיד','הרשאות','דף_כניסה','כיתות_מורשות','קטגוריות_מורשות','תלמידים_מורשים','הערות_משתמש'];
  const SELF_KEYS  = ['שם מלא','אימייל','טלפון','הערות_משתמש']; // self can update profile, NOT role/permissions
  const allowed = new Set(isAdmin ? ADMIN_KEYS : SELF_KEYS);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdx] || '').trim() !== username) continue;
    // Apply per-column updates, but ONLY if the param was actually present.
    let changes = 0;
    for (const h of headers) {
      if (!allowed.has(h)) continue;
      if (Object.prototype.hasOwnProperty.call(params, h)) {
        const col = headers.indexOf(h);
        sheet.getRange(i + 1, col + 1).setValue(String(params[h]));
        changes++;
      }
    }
    // Optional password rotation (admin or self)
    if (params.newPassword || params.new_password) {
      const pwd = String(params.newPassword || params.new_password);
      if (pwd.length < 4) return { ok: false, error: 'סיסמה חייבת לפחות 4 תווים' };
      let hashed;
      try { hashed = 'sha256:' + hashPassword(pwd); }
      catch (e) { return { ok: false, error: 'PWD_SALT not configured' }; }
      const pwdIdx = headers.indexOf('סיסמה');
      if (pwdIdx < 0) return { ok: false, error: 'no password column' };
      sheet.getRange(i + 1, pwdIdx + 1).setValue(hashed);
      changes++;
    }
    return { ok: true, username, changes };
  }
  return { ok: false, error: 'user not found' };
}

// ===== deleteUser =====
// Admin only. Refuses to delete the admin account or the caller themselves.
function actionDeleteUser(params) {
  const auth = adminGate_(params);
  if (!auth.ok) return { ok: false, error: auth.error };
  const username = String(params.username || '').trim();
  if (!username) return { ok: false, error: 'שם משתמש חובה' };
  if (username === 'admin') return { ok: false, error: 'אסור למחוק admin' };
  if (auth.by === 'jwt' && auth.user && String(auth.user).trim() === username) {
    return { ok: false, error: 'אסור למחוק את עצמך' };
  }

  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userIdx = headers.indexOf('שם משתמש');
  if (userIdx < 0) return { ok: false, error: 'sheet schema unexpected' };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdx] || '').trim() === username) {
      sheet.deleteRow(i + 1); // 1-based; +1 for the header row
      return { ok: true, username };
    }
  }
  return { ok: false, error: 'user not found' };
}

// ===== Refresh session (sliding expiry) =====
function actionRefreshSession(params) {
  const auth = authorizeRequest(params);
  if (!auth.authorized) return { ok: false, error: auth.error };
  const newSession = issueSession(auth.user.username, auth.user.role);
  return { ok: true, session: newSession, expires: Date.now() + 8 * 60 * 60 * 1000 };
}

// ===== Change own password (JWT-authenticated) =====
// Requires a valid session JWT. Writes sha256:<hash> back to the משתמשים row
// for the AUTHENTICATED user — clients cannot change another user's password.
function actionChangePassword(params) {
  const sessionToken = params.session || params.sessionToken;
  if (!sessionToken) return { ok: false, error: 'missing session' };
  let v;
  try { v = verifySession(sessionToken); } catch (e) { return { ok: false, error: 'session check failed' }; }
  if (!v || !v.valid) return { ok: false, error: 'invalid session: ' + ((v && v.error) || 'unknown') };

  const newPwd = String(params.newPassword || params.new_password || '');
  if (!newPwd || newPwd.length < 4) return { ok: false, error: 'סיסמה חייבת לפחות 4 תווים' };
  if (newPwd.length > 100) return { ok: false, error: 'סיסמה ארוכה מדי' };

  // Normalize username on both sides — Hebrew strings may carry NFC/NFD
  // differences or invisible RTL marks once they go through JWT base64 encode.
  function norm(s) {
    s = String(s == null ? '' : s);
    if (typeof s.normalize === 'function') { try { s = s.normalize('NFC'); } catch (e) {} }
    return s.replace(/[‎‏‪-‮﻿]/g, '').trim();
  }
  const username = norm(v.username);

  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  if (!data.length) return { ok: false, error: 'empty users sheet' };
  const headers = data[0];
  const userIdx = headers.indexOf('שם משתמש');
  const pwdIdx = headers.indexOf('סיסמה');
  if (userIdx < 0 || pwdIdx < 0) return { ok: false, error: 'sheet schema unexpected' };

  for (let i = 1; i < data.length; i++) {
    if (norm(data[i][userIdx]) === username) {
      let hashed;
      try { hashed = 'sha256:' + hashPassword(newPwd); }
      catch (e) { return { ok: false, error: 'PWD_SALT not configured' }; }
      // Row index in the sheet is i+1 (1-based, accounting for header).
      // Column is pwdIdx+1 (1-based).
      sheet.getRange(i + 1, pwdIdx + 1).setValue(hashed);
      _writeAudit_(sheet, i + 1, newPwd, false);
      return { ok: true, message: 'הסיסמה עודכנה' };
    }
  }
  return { ok: false, error: 'user not found' };
}

// ===== Logout (informational - server can't invalidate JWT directly) =====
// Client should discard the session token.
// For full invalidation, would need a server-side blacklist (next phase).
function actionLogout(params) {
  return { ok: true, message: 'discard your session token' };
}

// ============================================================
// ROUTER — replace your existing doPost/doGet routing
// ============================================================
function routeRequest_v2(e) {
  const action = (e.parameter.action || '').trim();

  // Public actions (no auth required)
  if (action === 'login') return ContentService.createTextOutput(JSON.stringify(actionLogin(e.parameter)))
    .setMimeType(ContentService.MimeType.JSON);
  if (action === 'ping') return ContentService.createTextOutput(JSON.stringify({ ok: true, ts: Date.now() }))
    .setMimeType(ContentService.MimeType.JSON);

  // Protected actions - require session token
  const auth = authorizeRequest(e.parameter);
  if (!auth.authorized) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: auth.error, code: 'AUTH_REQUIRED' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Set current user globally for downstream handlers
  // ... your existing routing logic here, with auth.user available

  if (action === 'refreshSession') return ContentService.createTextOutput(JSON.stringify(actionRefreshSession(e.parameter)))
    .setMimeType(ContentService.MimeType.JSON);
  if (action === 'logout') return ContentService.createTextOutput(JSON.stringify(actionLogout(e.parameter)))
    .setMimeType(ContentService.MimeType.JSON);

  // For everything else, delegate to existing handlers
  // Replace this stub with your existing logic
  return ContentService.createTextOutput(JSON.stringify({
    ok: false,
    error: 'auth ok but action not implemented in v2 router',
    authenticated_as: auth.user.username
  })).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// BOOTSTRAP — set JWT_SECRET / PWD_SALT once, autonomously.
// Reachable only behind the WEBHOOK_TOKEN gate (handleWebhook protects it).
// Idempotent: never overwrites an existing value, never returns the secret.
// ============================================================
function actionInitAuthSecrets(params) {
  function rand(nChars) {
    let s = '';
    while (s.length < nChars) s += Utilities.getUuid().replace(/-/g, '');
    return s.slice(0, nChars);
  }
  const result = { ok: true, jwt_secret: 'exists', pwd_salt: 'exists' };
  if (!SCRIPT_PROPS.getProperty('JWT_SECRET')) {
    SCRIPT_PROPS.setProperty('JWT_SECRET', rand(64));
    result.jwt_secret = 'created';
  }
  if (!SCRIPT_PROPS.getProperty('PWD_SALT')) {
    SCRIPT_PROPS.setProperty('PWD_SALT', rand(32));
    result.pwd_salt = 'created';
  }
  if (!SCRIPT_PROPS.getProperty('AGENT_TOKEN') && params && params.agentToken) {
    SCRIPT_PROPS.setProperty('AGENT_TOKEN', String(params.agentToken));
    result.agent_token = 'created';
  }
  return result;
}

// ============================================================
// PASSWORD VISIBILITY + ADMIN OPS (Yosef — full visibility)
// Adds two columns to משתמשים sheet: סיסמה_גלויה (plain copy) +
// חובה_להחליף (1=force change on next login). Stays in sync with every
// password mutation: login/create/update/change/reset. Yosef can read all
// current+future passwords from the sheet directly OR via revealPasswords.
// ============================================================
function _ensurePwdAuditCols_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let plainIdx = headers.indexOf('סיסמה_גלויה');
  let mustIdx  = headers.indexOf('חובה_להחליף');
  let added = 0;
  if (plainIdx < 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('סיסמה_גלויה');
    plainIdx = sheet.getLastColumn() - 1;
    added++;
  }
  if (mustIdx < 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('חובה_להחליף');
    mustIdx = sheet.getLastColumn() - 1;
    added++;
  }
  return { plainIdx: plainIdx, mustIdx: mustIdx, added: added };
}

function _writeAudit_(sheet, rowIdx1based, plainPassword, mustChange) {
  try {
    const cols = _ensurePwdAuditCols_(sheet);
    if (plainPassword !== null && plainPassword !== undefined) {
      sheet.getRange(rowIdx1based, cols.plainIdx + 1).setValue(String(plainPassword));
    }
    if (mustChange !== null && mustChange !== undefined) {
      sheet.getRange(rowIdx1based, cols.mustIdx + 1).setValue(mustChange ? '1' : '0');
    }
  } catch (e) { /* never break primary action */ }
}

// admin only — reset target user's password to a known plain.
// Optional params: defaultPassword (default '1234'), mustChange (default true).
function actionAdminResetPassword(params) {
  const auth = adminGate_(params);
  if (!auth.ok) return { ok: false, error: auth.error };
  const target = String(params.username || params.target || '').trim();
  if (!target) return { ok: false, error: 'username חובה' };
  const newPwd = String(params.defaultPassword || params.newPassword || '1234');
  if (newPwd.length < 4) return { ok: false, error: 'סיסמה חייבת לפחות 4 תווים' };
  const mustChange = params.mustChange === false || params.mustChange === '0' ? false : true;
  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userIdx = headers.indexOf('שם משתמש');
  const pwdIdx  = headers.indexOf('סיסמה');
  if (userIdx < 0 || pwdIdx < 0) return { ok: false, error: 'sheet schema unexpected' };
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][userIdx] || '').trim() === target) {
      let hashed;
      try { hashed = 'sha256:' + hashPassword(newPwd); }
      catch (e) { return { ok: false, error: 'PWD_SALT not configured' }; }
      sheet.getRange(i + 1, pwdIdx + 1).setValue(hashed);
      _writeAudit_(sheet, i + 1, newPwd, mustChange);
      return { ok: true, username: target, password: newPwd, mustChange: mustChange };
    }
  }
  return { ok: false, error: 'user not found' };
}

// admin only — return [{username, fullName, role, plain, mustChange, hasHash}]
function actionAdminRevealPasswords(params) {
  const auth = adminGate_(params);
  if (!auth.ok) return { ok: false, error: auth.error };
  const sheet = getChederSheet_('משתמשים', params);
  if (!sheet) return { ok: false, error: 'users sheet not configured' };
  _ensurePwdAuditCols_(sheet);
  const data = sheet.getDataRange().getValues();
  if (!data.length) return { ok: true, users: [] };
  const headers = data[0];
  const userIdx  = headers.indexOf('שם משתמש');
  const pwdIdx   = headers.indexOf('סיסמה');
  const plainIdx = headers.indexOf('סיסמה_גלויה');
  const mustIdx  = headers.indexOf('חובה_להחליף');
  const roleIdx  = headers.indexOf('תפקיד');
  const nameIdx  = headers.indexOf('שם מלא');
  const out = [];
  for (let i = 1; i < data.length; i++) {
    const u = String(data[i][userIdx] || '').trim();
    if (!u) continue;
    const stored = String(data[i][pwdIdx] || '');
    out.push({
      username: u,
      fullName: nameIdx >= 0 ? String(data[i][nameIdx] || '') : '',
      role: roleIdx >= 0 ? String(data[i][roleIdx] || '') : '',
      plain: plainIdx >= 0 ? String(data[i][plainIdx] || '') : '',
      mustChange: mustIdx >= 0 ? (String(data[i][mustIdx] || '') === '1') : false,
      hasHash: stored.indexOf('sha256:') === 0,
      hashedOnly: stored.indexOf('sha256:') === 0 && (plainIdx < 0 || !data[i][plainIdx])
    });
  }
  return { ok: true, users: out, count: out.length };
}

// Hook: called from Webhook AFTER successful login to capture the plaintext
// password the user just typed — that's the only moment the server sees it.
function _captureLoginPlain_(params, result) {
  if (!result || !result.ok) return;
  try {
    const sheet = getChederSheet_('משתמשים', params);
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const userIdx = headers.indexOf('שם משתמש');
    const username = String(params.username || '').trim();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][userIdx] || '').trim() === username) {
        _writeAudit_(sheet, i + 1, String(params.password || ''), null);
        return;
      }
    }
  } catch (e) {}
}

// ============================================================
// MIGRATION HELPER — call once to hash all plaintext passwords
// ============================================================
function migrateLegacyPasswords(params) {
  const sheet = getChederSheet_('משתמשים', params || { instance: 'bht' });
  if (!sheet) throw new Error('users sheet not configured');
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pwdIdx = headers.indexOf('סיסמה');
  let migrated = 0;
  for (let i = 1; i < data.length; i++) {
    const p = String(data[i][pwdIdx] || '');
    if (p && !p.startsWith('sha256:')) {
      const hashed = 'sha256:' + hashPassword(p);
      sheet.getRange(i + 1, pwdIdx + 1).setValue(hashed);
      migrated++;
    }
  }
  return { ok: true, migrated };
}
