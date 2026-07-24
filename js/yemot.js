// yemot.js — פאנל ניהול קו ימות המשיח של המוסד (מנהל בלבד).
// גרסה מלאה: דפדפן שלוחות, השמעה מנורמלת, הקלטה ישירה מהמיקרופון, טקסט→שמע
// (Gemini דרך Cloudflare Worker), העלאה, וצינתוק (כבוי כברירת מחדל).
//
// CORS: ימות מאפשר fetch דפדפן ישיר. token ב-sessionStorage בלבד (לא הסיסמה).
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const API = 'https://www.call2all.co.il/ym/api';
  const TTS_URL = 'https://cheder-tts.6742853.workers.dev';   // Cloudflare Worker (טקסט→שמע). דורש הוספה לרשימה הלבנה של נטפרי.
  const SS_KEY = 'cv3_yemot_token';
  const DEFAULT_LINE = '033060570';

  const token = () => { try { return sessionStorage.getItem(SS_KEY) || ''; } catch (_) { return ''; } };
  const setToken = t => { try { t ? sessionStorage.setItem(SS_KEY, t) : sessionStorage.removeItem(SS_KEY); } catch (_) {} };

  async function call(method, params) {
    const qs = new URLSearchParams(Object.assign({ token: token() }, params || {}));
    const res = await fetch(`${API}/${method}?${qs}`, { method: 'GET' });
    let data; try { data = await res.json(); } catch (_) { data = { responseStatus: 'EXCEPTION', message: 'תשובה לא תקינה' }; }
    if (data && /token/i.test(data.message || '') && data.responseStatus !== 'OK') setToken('');
    return data;
  }

  async function login(line, pass) {
    const res = await fetch(`${API}/Login?${new URLSearchParams({ username: line, password: pass })}`);
    const data = await res.json();
    if (data.responseStatus === 'OK' && data.token) { setToken(data.token); return { ok: true }; }
    return { ok: false, msg: data.message || 'שם משתמש או סיסמה שגויים' };
  }

  // העלאת קובץ/blob לשלוחה
  async function uploadBlob(ext, blob, filename) {
    const fd = new FormData();
    fd.append('token', token());
    fd.append('path', 'ivr2:/' + ext + '/000.wav');
    fd.append('convertAudio', '1');
    fd.append('file', blob, filename || 'message.wav');
    const res = await fetch(`${API}/UploadFile`, { method: 'POST', body: fd });
    return res.json();
  }

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

  const state = { path: 'ivr2:/', rec: null, chunks: [], recBlob: null, ttsBlob: null };

  async function render(page) { return token() ? renderPanel(page) : renderLogin(page); }

  function renderLogin(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2></div>' +
      '<div class="qr-card" style="max-width:460px;margin:0 auto">' +
        '<h3><i class="bi bi-telephone-inbound"></i> התחברות לקו המוסד</h3>' +
        '<p class="login-hint" style="margin:6px 0 14px">ההתחברות מול שרת ימות. הסיסמה אינה נשמרת — רק אסימון זמני לסשן.</p>' +
        '<label class="lbl">מספר הקו</label><input class="inp" id="ymLine" value="' + DEFAULT_LINE + '" inputmode="numeric">' +
        '<label class="lbl">סיסמת הקו</label><input class="inp" id="ymPass" type="password" autocomplete="off" placeholder="סיסמת ניהול הקו">' +
        '<button class="btn-primary" id="ymLoginBtn" style="margin-top:6px"><i class="bi bi-box-arrow-in-left"></i> התחברות</button>' +
        '<div id="ymMsg" class="login-msg"></div></div>';
    const btn = page.querySelector('#ymLoginBtn');
    const go = async () => {
      const line = page.querySelector('#ymLine').value.trim(), pass = page.querySelector('#ymPass').value, msg = page.querySelector('#ymMsg');
      if (!line || !pass) { msg.textContent = 'נא להזין מספר קו וסיסמה.'; return; }
      msg.textContent = 'מתחבר…'; btn.disabled = true;
      try { const r = await login(line, pass); if (r.ok) { state.path = 'ivr2:/'; render(page); } else { msg.textContent = r.msg; btn.disabled = false; } }
      catch (e) { msg.textContent = 'שגיאת רשת — בדוק חיבור.'; btn.disabled = false; }
    };
    btn.addEventListener('click', go);
    page.querySelector('#ymPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  function renderPanel(page) {
    page.innerHTML =
      '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>קו ימות המשיח</h2>' +
        '<div class="head-actions"><span class="chip ok" style="margin-inline-end:8px"><i class="bi bi-check-circle"></i> מחובר</span>' +
        '<button class="btn-ghost sm" id="ymLogout"><i class="bi bi-box-arrow-right"></i> ניתוק</button></div></div>' +

      '<div class="qr-card"><h3><i class="bi bi-telephone-fill"></i> מצב הקו</h3><div id="ymState" class="ym-stats">טוען…</div></div>' +

      // טקסט → שמע (Gemini) + הקלטה ישירה — הודעה חדשה לשלוחה
      '<div class="qr-card"><h3><i class="bi bi-megaphone"></i> הודעה חדשה לשלוחה</h3>' +
        '<div class="ym-tabs"><button class="ym-tab on" data-tab="text"><i class="bi bi-body-text"></i> טקסט לשמע</button>' +
          '<button class="ym-tab" data-tab="rec"><i class="bi bi-mic"></i> הקלטה ישירה</button>' +
          '<button class="ym-tab" data-tab="file"><i class="bi bi-file-earmark-music"></i> קובץ מוכן</button></div>' +

        // טאב טקסט
        '<div class="ym-pane" data-pane="text">' +
          '<textarea class="inp" id="ymText" rows="3" placeholder="כתבו את ההודעה שתוקרא בקול… (למשל: שלום, הגעתם לתלמוד תורה מעלה עמוס)"></textarea>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center">' +
            '<button class="btn-ghost sm" id="ymTtsGen"><i class="bi bi-soundwave"></i> צור קול</button>' +
            '<audio id="ymTtsPrev" controls style="display:none;height:36px"></audio>' +
            '<span id="ymTtsMsg" class="count-line"></span></div></div>' +

        // טאב הקלטה
        '<div class="ym-pane" data-pane="rec" hidden>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
            '<button class="btn-primary sm" id="ymRecStart"><i class="bi bi-record-circle"></i> התחל הקלטה</button>' +
            '<button class="btn-ghost sm" id="ymRecStop" disabled><i class="bi bi-stop-circle"></i> עצור</button>' +
            '<span id="ymRecTime" class="count-line"></span></div>' +
          '<audio id="ymRecPrev" controls style="display:none;width:100%;margin-top:8px"></audio></div>' +

        // טאב קובץ
        '<div class="ym-pane" data-pane="file" hidden>' +
          '<input class="inp mb0" id="ymFile" type="file" accept="audio/*"></div>' +

        // יעד + העלאה + צינתוק
        '<hr style="border:none;border-top:1px solid var(--line);margin:14px 0">' +
        '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">' +
          '<label style="display:flex;align-items:center;gap:6px">שלוחת יעד <input class="inp mb0" id="ymExt" value="1" style="width:70px" inputmode="numeric"></label>' +
          '<button class="btn-primary sm" id="ymSend"><i class="bi bi-upload"></i> העלה לשלוחה</button>' +
          '<label class="ym-check"><input type="checkbox" id="ymTz"> הפעל צינתוק לנרשמים אחרי ההעלאה</label></div>' +
        '<div id="ymSendMsg" class="count-line" style="margin-top:8px;min-height:1.2em"></div>' +
        '<p class="login-hint" style="margin-top:6px"><i class="bi bi-exclamation-triangle"></i> צינתוק שולח שיחה לכל הנרשמים — השאירו כבוי אם לא בטוחים.</p></div>' +

      // דפדפן שלוחות
      '<div class="qr-card"><div class="card-h-row"><h3><i class="bi bi-diagram-3"></i> תוכן הקו</h3>' +
        '<button class="btn-ghost sm" id="ymRefresh"><i class="bi bi-arrow-clockwise"></i> רענון</button></div>' +
        '<div id="ymCrumb" class="ym-crumb"></div>' +
        '<div id="ymDir" class="ym-dir"><div class="empty-state" style="padding:14px">טוען…</div></div></div>';

    page.querySelector('#ymLogout').addEventListener('click', () => { setToken(''); render(page); });
    page.querySelector('#ymRefresh').addEventListener('click', () => loadDir(page, state.path));
    wireTabs(page); wireTts(page); wireRec(page); wireSend(page);
    loadState(page); loadDir(page, state.path);
  }

  function wireTabs(page) {
    page.querySelectorAll('.ym-tab').forEach(t => t.addEventListener('click', () => {
      page.querySelectorAll('.ym-tab').forEach(x => x.classList.toggle('on', x === t));
      page.querySelectorAll('.ym-pane').forEach(p => { p.hidden = p.dataset.pane !== t.dataset.tab; });
    }));
  }

  // ----- טקסט → שמע (Gemini Worker) -----
  function wireTts(page) {
    page.querySelector('#ymTtsGen').addEventListener('click', async () => {
      const text = page.querySelector('#ymText').value.trim();
      const msg = page.querySelector('#ymTtsMsg'), prev = page.querySelector('#ymTtsPrev');
      if (!text) { msg.textContent = 'כתבו טקסט קודם.'; return; }
      msg.textContent = 'יוצר קול…';
      try {
        const r = await fetch(TTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
        if (!r.ok) { msg.innerHTML = 'שירות הקול לא זמין (ודאו ש-cheder-tts.6742853.workers.dev מאושר בסינון התוכן).'; return; }
        state.ttsBlob = await r.blob();
        prev.src = URL.createObjectURL(state.ttsBlob); prev.style.display = '';
        msg.textContent = '✓ הקול מוכן — האזינו וייעלו לשלוחה.';
      } catch (e) { msg.textContent = 'שגיאת רשת ביצירת הקול.'; }
    });
  }

  // ----- הקלטה ישירה מהמיקרופון -----
  function wireRec(page) {
    const startB = page.querySelector('#ymRecStart'), stopB = page.querySelector('#ymRecStop');
    const timeEl = page.querySelector('#ymRecTime'), prev = page.querySelector('#ymRecPrev');
    let timer, t0;
    startB.addEventListener('click', async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        state.chunks = [];
        const rec = new MediaRecorder(stream);
        rec.ondataavailable = e => { if (e.data.size) state.chunks.push(e.data); };
        rec.onstop = () => {
          state.recBlob = new Blob(state.chunks, { type: rec.mimeType || 'audio/webm' });
          prev.src = URL.createObjectURL(state.recBlob); prev.style.display = '';
          stream.getTracks().forEach(t => t.stop());
        };
        rec.start(); state.rec = rec; t0 = Date.now();
        timer = setInterval(() => { timeEl.textContent = '● מקליט… ' + Math.floor((Date.now() - t0) / 1000) + 'ש'; }, 300);
        startB.disabled = true; stopB.disabled = false;
      } catch (e) { timeEl.textContent = 'אין גישה למיקרופון.'; }
    });
    stopB.addEventListener('click', () => {
      if (state.rec && state.rec.state !== 'inactive') state.rec.stop();
      clearInterval(timer); timeEl.textContent = '✓ ההקלטה מוכנה'; startB.disabled = false; stopB.disabled = true;
    });
  }

  // ----- העלאה לשלוחה (מכל אחד משלושת המקורות) + צינתוק אופציונלי -----
  function wireSend(page) {
    page.querySelector('#ymSend').addEventListener('click', async () => {
      const ext = page.querySelector('#ymExt').value.trim();
      const msg = page.querySelector('#ymSendMsg');
      const activeTab = page.querySelector('.ym-tab.on').dataset.tab;
      if (!ext) { msg.textContent = 'הזינו שלוחת יעד.'; return; }
      let blob, name;
      if (activeTab === 'text') { blob = state.ttsBlob; name = 'tts.wav'; if (!blob) { msg.textContent = 'צרו קול קודם (כפתור "צור קול").'; return; } }
      else if (activeTab === 'rec') { blob = state.recBlob; name = 'rec.webm'; if (!blob) { msg.textContent = 'הקליטו קודם.'; return; } }
      else { const f = page.querySelector('#ymFile').files[0]; if (!f) { msg.textContent = 'בחרו קובץ.'; return; } blob = f; name = f.name; }

      msg.textContent = 'מעלה לשלוחה ' + esc(ext) + '…';
      try {
        const up = await uploadBlob(ext, blob, name);
        if (up.responseStatus !== 'OK') { msg.textContent = 'ההעלאה נכשלה: ' + esc(up.message || ''); return; }
        msg.textContent = '✓ ההודעה הועלתה לשלוחה ' + esc(ext);
        loadDir(page, state.path);
        // צינתוק — רק אם סומן במפורש ואושר
        if (page.querySelector('#ymTz').checked) {
          const ok = await window.UI.confirm('לשלוח צינתוק לכל הנרשמים בקו? פעולה זו מחייגת אליהם בפועל.');
          if (ok) {
            msg.textContent = 'שולח צינתוק…';
            const tz = await call('RunTzintuk', { path: 'ivr2:/' + ext });
            msg.textContent = tz.responseStatus === 'OK' ? '✓ ההודעה הועלתה והצינתוק נשלח.' :
              '✓ ההודעה הועלתה. הצינתוק לא נשלח: ' + esc(tz.message || '');
          } else { msg.textContent = '✓ ההודעה הועלתה (צינתוק בוטל).'; }
        }
      } catch (e) { msg.textContent = 'שגיאת רשת בהעלאה.'; }
    });
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
        box.innerHTML = items.map(([ic, k, v]) => '<div class="ym-stat"><i class="bi ' + ic + '"></i><div><span class="ym-k">' + esc(k) + '</span><b>' + esc(v) + '</b></div></div>').join('');
      } else if (!token()) render(page);
      else box.innerHTML = '<div class="empty-state" style="padding:12px">' + esc(s.message || 'לא ניתן לטעון מצב') + '</div>';
    } catch (e) { box.innerHTML = '<div class="empty-state" style="padding:12px">שגיאה בטעינת מצב הקו.</div>'; }
  }

  async function loadDir(page, path) {
    state.path = path;
    const box = page.querySelector('#ymDir'), crumb = page.querySelector('#ymCrumb');
    box.innerHTML = '<div class="empty-state" style="padding:14px">טוען…</div>';
    const rel = path.replace(/^ivr2:\/?/, '').replace(/\/$/, '');
    const parts = rel.split('/').filter(Boolean);
    let acc = 'ivr2:/', cr = '<a class="ym-bc" data-p="ivr2:/"><i class="bi bi-house"></i> ראשי</a>';
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
      if (!dirs.length && !wavs.length) html = '<div class="empty-state" style="padding:14px">אין תוכן בשלוחה זו.</div>';
      dirs.forEach(dir => {
        const isExt = dir.fileType === 'EXT', ti = typeInfo(dir.extType);
        const title = dir.extTitle || (isExt ? ti.label : '');
        html += '<div class="ym-row" data-nav="' + esc('ivr2:/' + (rel ? rel + '/' : '') + dir.name) + '">' +
          '<span class="ym-ic"><i class="bi ' + (isExt ? ti.icon : 'bi-folder2') + '"></i></span>' +
          '<div class="ym-main"><b>שלוחה ' + esc(dir.name) + '</b>' + (title ? ' <span class="ym-note">' + esc(title) + '</span>' : '') + '</div>' +
          (isExt ? '<span class="ym-badge"><i class="bi ' + ti.icon + '"></i> ' + esc(ti.label) + '</span>' : '') +
          '<i class="bi bi-chevron-left ym-arrow"></i></div>';
      });
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

  // השמעה מנורמלת — מיישר את הווליום כדי שההתחלה השקטה של הקלטות ימות
  // (שמתחילות חלש ועולות) תישמע אחיד. משתמש ב-DynamicsCompressor.
  let audioCtx = null;
  async function playFile(page, path, name) {
    const full = (path.endsWith('/') ? path : path + '/') + name;
    const url = `${API}/DownloadFile?token=${encodeURIComponent(token())}&path=${encodeURIComponent(full)}`;
    try {
      const old = document.getElementById('ymAudio'); if (old) { try { old.pause(); } catch (_) {} old.remove(); }
      const audio = document.createElement('audio');
      audio.id = 'ymAudio'; audio.controls = true; audio.crossOrigin = 'anonymous';
      audio.style.cssText = 'width:100%;margin-top:10px'; audio.src = url;
      page.querySelector('#ymDir').appendChild(audio);
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const src = audioCtx.createMediaElementSource(audio);
        const comp = audioCtx.createDynamicsCompressor();
        comp.threshold.value = -40; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
        const gain = audioCtx.createGain(); gain.value = 2.2;   // makeup gain — מרים את החלקים החלשים
        src.connect(comp); comp.connect(gain); gain.connect(audioCtx.destination);
      } catch (_) { /* אם Web Audio לא זמין — השמעה רגילה */ }
      audio.play().catch(() => {});
    } catch (e) { window.UI.toast('לא ניתן להשמיע', 'err'); }
  }

  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.yemot = render;
})();
