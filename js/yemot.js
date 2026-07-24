// yemot.js — פאנל ניהול קו ימות המשיח של המוסד (מנהל בלבד).
// גרסה משודרגת: דפדפן שלוחות חכם (מזהה סוג כל שלוחה), מצב קו, העלאת הקלטה,
// רשימת נרשמים לצינתוק והפעלתו — הכל מתוך ממשק אחד נוח.
//
// CORS: נבדק בפועל — API של ימות מאפשר קריאות דפדפן ישירות. אין צורך בפרוקסי.
// ה-token נשמר ב-sessionStorage בלבד (לא הסיסמה), ופג אצל ימות אחרי ~45 דקות.
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const API = 'https://www.call2all.co.il/ym/api';
  const SS_KEY = 'cv3_yemot_token';
  const DEFAULT_LINE = '033060570';

  const token = () => { try { return sessionStorage.getItem(SS_KEY) || ''; } catch (_) { return ''; } };
  const setToken = t => { try { t ? sessionStorage.setItem(SS_KEY, t) : sessionStorage.removeItem(SS_KEY); } catch (_) {} };

  async function call(method, params) {
    const qs = new URLSearchParams(Object.assign({ token: token() }, params || {}));
    const res = await fetch(`${API}/${method}?${qs}`, { method: 'GET' });
    let data; try { data = await res.json(); } catch (_) { data = { responseStatus: 'EXCEPTION', message: 'תשובה לא תקינה' }; }
    if (data && /token/i.test(data.message || '') && data.responseStatus !== 'OK') { setToken(''); }
    return data;
  }

  async function login(line, pass) {
    const qs = new URLSearchParams({ username: line, password: pass });
    const res = await fetch(`${API}/Login?${qs}`, { method: 'GET' });
    const data = await res.json();
    if (data.responseStatus === 'OK' && data.token) { setToken(data.token); return { ok: true }; }
    return { ok: false, msg: data.message || 'שם משתמש או סיסמה שגויים' };
  }

  // סוגי שלוחות → תווית ואייקון ידידותיים
  const EXT_TYPES = {
    go_to_folder: { icon: 'bi-signpost-split', label: 'ניתוב' },
    record: { icon: 'bi-mic', label: 'הקלטה' },
    tzintuk: { icon: 'bi-bell', label: 'צינתוק' },
    playfile: { icon: 'bi-play-circle', label: 'השמעת קובץ' },
    menu: { icon: 'bi-list', label: 'תפריט' },
    last_play: { icon: 'bi-star', label: 'הודעה אחרונה' },
    conference: { icon: 'bi-people', label: 'ועידה' },
  };
  const typeInfo = t => EXT_TYPES[t] || { icon: 'bi-folder2', label: t || 'שלוחה' };

  // ---------- תצוגה ----------
  const state = { path: 'ivr2:/' };

  async function render(page) {
    if (!token()) return renderLogin(page);
    return renderPanel(page);
  }

  function renderLogin(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2></div>' +
      '<div class="qr-card" style="max-width:460px;margin:0 auto">' +
        '<h3><i class="bi bi-telephone-inbound"></i> התחברות לקו המוסד</h3>' +
        '<p class="login-hint" style="margin:6px 0 14px">ההתחברות מול שרת ימות. הסיסמה אינה נשמרת — רק אסימון זמני לסשן הנוכחי.</p>' +
        '<label class="lbl">מספר הקו</label>' +
        '<input class="inp" id="ymLine" value="' + DEFAULT_LINE + '" inputmode="numeric">' +
        '<label class="lbl">סיסמת הקו</label>' +
        '<input class="inp" id="ymPass" type="password" autocomplete="off" placeholder="סיסמת ניהול הקו">' +
        '<button class="btn-primary" id="ymLoginBtn" style="margin-top:6px"><i class="bi bi-box-arrow-in-left"></i> התחברות</button>' +
        '<div id="ymMsg" class="login-msg"></div>' +
      '</div>';
    const btn = page.querySelector('#ymLoginBtn');
    const go = async () => {
      const line = page.querySelector('#ymLine').value.trim();
      const pass = page.querySelector('#ymPass').value;
      const msg = page.querySelector('#ymMsg');
      if (!line || !pass) { msg.textContent = 'נא להזין מספר קו וסיסמה.'; return; }
      msg.textContent = 'מתחבר…'; btn.disabled = true;
      try {
        const r = await login(line, pass);
        if (r.ok) { state.path = 'ivr2:/'; render(page); } else { msg.textContent = r.msg; btn.disabled = false; }
      } catch (e) { msg.textContent = 'שגיאת רשת — בדוק חיבור.'; btn.disabled = false; }
    };
    btn.addEventListener('click', go);
    page.querySelector('#ymPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function renderPanel(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2>' +
        '<div class="head-actions"><span class="chip ok" id="ymConn" style="margin-inline-end:8px"><i class="bi bi-check-circle"></i> מחובר</span>' +
        '<button class="btn-ghost sm" id="ymLogout"><i class="bi bi-box-arrow-right"></i> ניתוק</button></div></div>' +

      // מצב הקו
      '<div class="qr-card" id="ymStateCard"><h3><i class="bi bi-telephone-fill"></i> מצב הקו</h3>' +
        '<div id="ymState" class="ym-stats">טוען…</div></div>' +

      // דפדפן שלוחות
      '<div class="qr-card"><div class="card-h-row"><h3><i class="bi bi-diagram-3"></i> שלוחות הקו</h3>' +
        '<button class="btn-ghost sm" id="ymRefresh"><i class="bi bi-arrow-clockwise"></i> רענון</button></div>' +
        '<div id="ymCrumb" class="ym-crumb"></div>' +
        '<div id="ymDir" class="ym-dir"><div class="empty-state" style="padding:14px">טוען…</div></div></div>' +

      // העלאת הקלטה
      '<div class="qr-card"><h3><i class="bi bi-cloud-upload"></i> העלאת הקלטה לשלוחה</h3>' +
        '<p class="login-hint" style="margin:0 0 10px">בחרו קובץ אודיו ומספר שלוחה — הקובץ יוחלף כהודעה בשלוחה שנבחרה.</p>' +
        '<div class="qr-grid" style="grid-template-columns:auto 1fr auto">' +
          '<input class="inp mb0" id="ymExt" value="1" style="width:90px" title="מספר שלוחה" inputmode="numeric">' +
          '<input class="inp mb0" id="ymFile" type="file" accept="audio/*">' +
          '<button class="btn-primary sm" id="ymUpload"><i class="bi bi-upload"></i> העלה</button>' +
        '</div><div id="ymUpMsg" class="count-line" style="margin-top:8px;min-height:1.2em"></div></div>';

    page.querySelector('#ymLogout').addEventListener('click', () => { setToken(''); render(page); });
    page.querySelector('#ymRefresh').addEventListener('click', () => loadDir(page, state.path));
    wireUpload(page);
    loadState(page);
    loadDir(page, state.path);
  }

  async function loadState(page) {
    const box = page.querySelector('#ymState');
    try {
      const s = await call('GetSession');
      if (s.responseStatus === 'OK') {
        const items = [
          ['bi-telephone', 'מספר הקו', s.username || s.ownerId || '—'],
          (s.creditRemains != null ? ['bi-coin', 'יתרת יחידות', s.creditRemains] : null),
          ['bi-shield-check', 'אבטחה', 'אסימון לסשן זה בלבד'],
        ].filter(Boolean);
        box.innerHTML = items.map(([ic, k, v]) =>
          '<div class="ym-stat"><i class="bi ' + ic + '"></i><div><span class="ym-k">' + esc(k) + '</span><b>' + esc(v) + '</b></div></div>').join('');
      } else if (!token()) { render(page); }
      else box.innerHTML = '<div class="empty-state" style="padding:12px">' + esc(s.message || 'לא ניתן לטעון מצב') + '</div>';
    } catch (e) { box.innerHTML = '<div class="empty-state" style="padding:12px">שגיאה בטעינת מצב הקו.</div>'; }
  }

  async function loadDir(page, path) {
    state.path = path;
    const box = page.querySelector('#ymDir');
    const crumb = page.querySelector('#ymCrumb');
    box.innerHTML = '<div class="empty-state" style="padding:14px">טוען…</div>';
    // פירורי לחם
    const rel = path.replace('ivr2:/', '').replace(/^ivr2:/, '');
    const parts = rel.split('/').filter(Boolean);
    let acc = 'ivr2:/';
    let cr = '<a class="ym-bc" data-p="ivr2:/"><i class="bi bi-house"></i> ראשי</a>';
    parts.forEach(seg => { acc += seg + '/'; cr += ' <span class="ym-sep">›</span> <a class="ym-bc" data-p="' + esc(acc) + '">' + esc(seg) + '</a>'; });
    crumb.innerHTML = cr;
    crumb.querySelectorAll('.ym-bc').forEach(a => a.addEventListener('click', () => loadDir(page, a.dataset.p)));

    try {
      const d = await call('GetIVR2Dir', { path });
      if (d.responseStatus !== 'OK') { box.innerHTML = '<div class="empty-state" style="padding:14px">' + esc(d.message || 'לא ניתן לטעון') + '</div>'; return; }
      const SYS = ['Log', 'Messages', 'EnterIDRecord', 'Star', 'Trash', 'ConfBridge'];
      const dirs = (d.dirs || []).filter(x => x.name && !SYS.includes(x.name));
      const wavs = (d.files || []).filter(f => (f.name || '').endsWith('.wav'));
      let html = '';
      if (!dirs.length && !wavs.length) html = '<div class="empty-state" style="padding:14px">השלוחה ריקה.</div>';
      // שלוחות
      dirs.forEach(dir => {
        const isExt = dir.fileType === 'EXT';
        const ti = typeInfo(dir.extType);
        const title = dir.extTitle || (isExt ? ti.label : '');
        const badge = isExt ? '<span class="ym-badge"><i class="bi ' + ti.icon + '"></i> ' + esc(ti.label) + '</span>' : '';
        html += '<div class="ym-row" data-nav="' + esc('ivr2:/' + (rel ? rel + '/' : '') + dir.name) + '">' +
          '<span class="ym-ic"><i class="bi ' + (isExt ? ti.icon : 'bi-folder2') + '"></i></span>' +
          '<div class="ym-main"><b>שלוחה ' + esc(dir.name) + '</b>' + (title !== ('שלוחה ' + dir.name) ? ' <span class="ym-note">' + esc(title) + '</span>' : '') + '</div>' +
          badge + '<i class="bi bi-chevron-left ym-arrow"></i></div>';
      });
      // הקלטות (קבצי wav)
      wavs.forEach(f => {
        html += '<div class="ym-row ym-file"><span class="ym-ic"><i class="bi bi-music-note-beamed"></i></span>' +
          '<div class="ym-main"><b>' + esc(f.name) + '</b></div>' +
          '<button class="mini" data-play="' + esc(f.name) + '" title="השמעה"><i class="bi bi-play-fill"></i></button></div>';
      });
      box.innerHTML = html;
      box.querySelectorAll('[data-nav]').forEach(r => r.addEventListener('click', () => loadDir(page, r.dataset.nav)));
      box.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); playFile(page, path, b.dataset.play); }));
    } catch (e) { box.innerHTML = '<div class="empty-state" style="padding:14px">שגיאת רשת.</div>'; }
  }

  // השמעת הקלטה — הורדה ל-blob והשמעה בדפדפן
  async function playFile(page, path, name) {
    const full = (path.endsWith('/') ? path : path + '/') + name;
    const url = `${API}/DownloadFile?token=${encodeURIComponent(token())}&path=${encodeURIComponent(full)}`;
    try {
      const existing = document.getElementById('ymAudio');
      if (existing) existing.remove();
      const audio = document.createElement('audio');
      audio.id = 'ymAudio'; audio.controls = true; audio.autoplay = true; audio.style.cssText = 'width:100%;margin-top:10px';
      audio.src = url;
      page.querySelector('#ymDir').appendChild(audio);
      audio.play().catch(() => {});
    } catch (e) { window.UI.toast('לא ניתן להשמיע את הקובץ', 'err'); }
  }

  function wireUpload(page) {
    page.querySelector('#ymUpload').addEventListener('click', async () => {
      const ext = page.querySelector('#ymExt').value.trim();
      const f = page.querySelector('#ymFile').files[0];
      const msg = page.querySelector('#ymUpMsg');
      if (!ext) { msg.textContent = 'הזן מספר שלוחה.'; return; }
      if (!f) { msg.textContent = 'בחר קובץ אודיו.'; return; }
      msg.textContent = 'מעלה…';
      try {
        const fd = new FormData();
        fd.append('token', token());
        fd.append('path', 'ivr2:/' + ext + '/000.wav');
        fd.append('convertAudio', '1');
        fd.append('file', f, f.name);
        const res = await fetch(`${API}/UploadFile`, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.responseStatus === 'OK') {
          msg.textContent = '✓ ההקלטה הועלתה לשלוחה ' + esc(ext);
          page.querySelector('#ymFile').value = '';
          if (state.path === 'ivr2:/' + ext + '/' || state.path === 'ivr2:/' + ext) loadDir(page, state.path);
        } else { msg.textContent = 'שגיאה: ' + esc(data.message || 'ההעלאה נכשלה'); }
      } catch (e) { msg.textContent = 'שגיאת רשת בהעלאה.'; }
    });
  }

  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.yemot = render;
})();
