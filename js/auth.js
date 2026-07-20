// auth.js — חלק 2: אימות (Supabase Auth) + הרשאות.
// אמת: OTP/Magic-Link במייל דרך Supabase (צד-שרת). במצב DEMO — כניסת צפייה לבחירת תפקיד.
// ההגנה האמיתית על הנתונים היא ה-RLS בצד-שרת; כאן זו רק חוויית משתמש.
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const DEMO = !window.sb;
  const A = { currentUser: null };

  function buildLoginPage() {
    if ($('#page-login')) return;
    const sec = document.createElement('section');
    sec.className = 'page';
    sec.id = 'page-login';
    sec.innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
        '<div class="login-logo"><i class="bi bi-mortarboard-fill"></i></div>' +
        '<h2>כניסה למערכת</h2>' +
        '<p class="login-sub">מערכת מעקב — תלמוד תורה</p>' +
        '<label class="lbl">תעודת זהות</label>' +
        '<input type="text" id="loginTz" class="inp" inputmode="numeric" placeholder="מספר ת״ז" autocomplete="username">' +
        '<label class="lbl">סיסמה</label>' +
        '<input type="password" id="loginPw" class="inp" placeholder="סיסמה" autocomplete="current-password">' +
        '<button class="btn-primary" id="loginBtn"><i class="bi bi-box-arrow-in-left"></i> כניסה</button>' +
        '<div id="loginMsg" class="login-msg"></div>' +
        (DEMO
          ? '<div class="demo-note" style="margin-top:14px"><i class="bi bi-info-circle"></i> הדגמה — מנהל: ת״ז <b>000000000</b> סיסמה <b>1234</b> · מורה: <b>111111111</b> / <b>1234</b></div>'
          : '<p class="login-hint">אין גישה? פנה למנהל המערכת.</p>') +
      '</div></div>';
    $('#pages').appendChild(sec);
    $('#loginBtn').addEventListener('click', doLogin);
    $('#loginPw').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  }

  async function doLogin() {
    const tz = ($('#loginTz').value || '').trim();
    const pw = $('#loginPw').value || '';
    const msg = $('#loginMsg');
    if (!tz || !pw) { msg.textContent = 'נא להזין ת״ז וסיסמה.'; return; }
    msg.textContent = 'מתחבר…';
    if (DEMO) {
      const users = await window.store.list('users');
      const u = users.find(x => x.tz === tz && x.password === pw && x.active !== false);
      if (!u) { msg.textContent = 'ת״ז או סיסמה שגויים.'; return; }
      msg.textContent = '';
      await setUser({ id: u.id, name: u.name, role: u.role, tz: u.tz, perms: u.perms });
    } else {
      // Supabase: ת״ז ממופה למייל סינתטי; הסיסמה מאומתת בצד-שרת (hashed)
      const { error } = await window.sb.auth.signInWithPassword({ email: tz + '@bht.co.il', password: pw });
      if (error) { msg.textContent = 'ת״ז או סיסמה שגויים.'; return; }
      msg.textContent = '';   // onAuthStateChange יטען את הפרופיל
    }
  }

  async function setUser(u) {
    A.currentUser = u; window.currentUser = u;
    A.perms = (u.role === 'מנהל') ? null : (u.perms && u.perms.length ? u.perms : null); // null = כל המסכים המותרים
    A.scope = null;                    // null = מנהל (הכל); מערך = כיתות מורשות למורה
    if (u.role !== 'מנהל' && window.store) {
      try { const acc = await window.store.list('user_class_access', { eq: { user_id: u.id } }); A.scope = acc.map(x => x.class_id); } catch (_) { A.scope = []; }
    }
    renderUserInfo();
    filterByPermissions();
    if (window.showPage) window.showPage('home');
  }

  function renderUserInfo() {
    const box = $('#userInfo');
    if (!box) return;
    if (A.currentUser) {
      box.innerHTML = '<span class="ui-name"><i class="bi bi-person-circle"></i> ' +
        (A.currentUser.name || '') + ' · ' + (A.currentUser.role || '') + '</span>' +
        '<button class="icon-btn" id="pwBtn" title="שינוי סיסמה" aria-label="שינוי סיסמה"><i class="bi bi-key"></i></button>' +
        '<button class="icon-btn" id="logoutBtn" title="יציאה" aria-label="יציאה"><i class="bi bi-box-arrow-right"></i></button>';
      const pb = $('#pwBtn'); if (pb) pb.addEventListener('click', changeOwnPassword);
      const lb = $('#logoutBtn'); if (lb) lb.addEventListener('click', logout);
      box.hidden = false;
    } else { box.innerHTML = ''; box.hidden = true; }
  }

  // שינוי סיסמה עצמי — זמין לכל משתמש מחובר (מנהל/מורה/צוות).
  function changeOwnPassword() {
    const u = A.currentUser; if (!u) return;
    window.UI.modal({
      title: 'שינוי הסיסמה שלי', saveLabel: 'עדכן סיסמה',
      bodyHTML: '<div class="form-grid">' +
        '<label class="fld fld-wide"><span>סיסמה חדשה *</span><input class="inp mb0" id="cp_new" type="password" autocomplete="new-password"></label>' +
        '<label class="fld fld-wide"><span>אימות סיסמה *</span><input class="inp mb0" id="cp_conf" type="password" autocomplete="new-password"></label>' +
        '</div>',
      onSave: async (mel) => {
        const p1 = mel.querySelector('#cp_new').value, p2 = mel.querySelector('#cp_conf').value;
        if (!p1 || p1.length < 4) { window.UI.toast('סיסמה קצרה מדי (4 תווים לפחות)', 'err'); return false; }
        if (p1 !== p2) { window.UI.toast('הסיסמאות אינן תואמות', 'err'); return false; }
        if (DEMO) { await window.store.update('users', u.id, { password: p1 }); }
        else if (window.sb) { const { error } = await window.sb.auth.updateUser({ password: p1 }); if (error) { window.UI.toast('שגיאה: ' + error.message, 'err'); return false; } }
        window.UI.toast('הסיסמה עודכנה בהצלחה'); return true;
      },
    });
  }

  function filterByPermissions() {
    const u = A.currentUser; if (!u) return;
    const isAdmin = u.role === 'מנהל';
    (window.MODULES || []).forEach(m => {
      let allowed;
      if (isAdmin) allowed = true;
      else if (m.adminOnly) allowed = false;
      else if (A.perms) allowed = A.perms.includes(m.id);   // הרשאות גרנולריות שהמנהל הגדיר
      else allowed = true;                                   // ברירת מחדל — כל המסכים הלא-ניהוליים
      const tile = document.querySelector('.tile[data-id="' + m.id + '"]');
      if (tile) tile.style.display = allowed ? '' : 'none';
      if (!allowed) { const p = document.getElementById('page-' + m.id); if (p) p.classList.remove('active'); }
    });
  }

  async function logout() {
    if (!DEMO && window.sb) { try { await window.sb.auth.signOut(); } catch (_) {} }
    A.currentUser = null; window.currentUser = null;
    renderUserInfo();
    if (window.showPage) window.showPage('login');
  }

  async function loadProfile(user) {
    let role = 'צוות', name = user.email, perms = null;
    try {
      const { data } = await window.sb.from('profiles').select('*').eq('id', user.id).single();
      if (data) { role = data.role || 'צוות'; name = data.name || user.email; perms = data.perms || null; }
    } catch (_) {}
    setUser({ id: user.id, email: user.email, name, role, perms });
  }

  async function init() {
    buildLoginPage();
    renderUserInfo();
    if (DEMO) { if (window.showPage) window.showPage('login'); return; }
    try {
      const { data: { session } } = await window.sb.auth.getSession();
      if (session && session.user) await loadProfile(session.user);
      else if (window.showPage) window.showPage('login');
      window.sb.auth.onAuthStateChange(async (_e, s) => {
        if (s && s.user) await loadProfile(s.user);
        else { A.currentUser = null; window.currentUser = null; renderUserInfo(); if (window.showPage) window.showPage('login'); }
      });
    } catch (_) { if (window.showPage) window.showPage('login'); }
  }

  window.Auth = {
    init: init, logout: logout, changePassword: changeOwnPassword, get currentUser() { return A.currentUser; }, scopeClasses: function () { return A.scope; },
    hasPermission: function (m) { const u = A.currentUser; if (!u) return false; return u.role === 'מנהל' || !m.adminOnly; },
    canAccess: function (id) {
      const u = A.currentUser; if (!u) return false;
      if (u.role === 'מנהל') return true;
      const m = (window.MODULES || []).find(x => x.id === id);
      if (m && m.adminOnly) return false;
      if (A.perms) return A.perms.includes(id);
      return true;
    },
  };
})();
