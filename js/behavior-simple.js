// behavior-simple.js — Clean, packs-independent behavior save flow. 2026-05-31
// Loads LAST so it overrides anything earlier scripts/packs may have wrapped.
// Goal: typing works, save works, list updates immediately, no debounce.
(function () {
  'use strict';

  function getStudents() {
    if (Array.isArray(window._allStudents) && window._allStudents.length) return window._allStudents;
    try {
      if (typeof window.getData === 'function') {
        const d = window.getData();
        if (d && Array.isArray(d.students)) return d.students;
      }
    } catch {}
    try {
      const stored = JSON.parse(localStorage.getItem('cheder_bht_data') || '{}');
      if (Array.isArray(stored.students)) return stored.students;
    } catch {}
    return [];
  }

  function getCategories() {
    if (Array.isArray(window._categories) && window._categories.length) return window._categories;
    try {
      const stored = JSON.parse(localStorage.getItem('cheder_bht_data') || '{}');
      if (Array.isArray(stored.categories)) return stored.categories;
    } catch {}
    return [];
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&"'<>]/g, c => ({'&':'&amp;','"':'&quot;',"'":'&#39;','<':'&lt;','>':'&gt;'}[c]));
  }

  function studentName(s) {
    return `${s['שם פרטי']||''} ${s['שם משפחה']||''}`.trim();
  }

  // Override the modal to a simple, robust version
  window.addEventModal = function addEventModalSimple() {
    const students = getStudents().filter(s => (s['סטטוס']||'פעיל') !== 'סיים');
    const cats = getCategories();

    // Remove any existing modal first
    const existing = document.getElementById('addEvModal');
    if (existing) existing.remove();
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());

    const html = `
      <div class="modal fade" id="addEvModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" dir="rtl">
            <div class="modal-header">
              <h5 class="modal-title">אירוע התנהגות חדש</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="סגור"></button>
            </div>
            <div class="modal-body">
              <div class="mb-3">
                <label class="form-label">תלמיד</label>
                <input id="ne-student" class="form-control form-control-lg" list="ne-student-list" placeholder="הקלד שם או בחר..." autocomplete="off">
                <datalist id="ne-student-list">
                  ${students.map(s => `<option value="${esc(studentName(s))}" data-id="${esc(s['מזהה'])}"></option>`).join('')}
                </datalist>
                <small class="text-muted">${students.length} תלמידים זמינים</small>
              </div>
              <div class="mb-3">
                <label class="form-label">קטגוריה</label>
                <select id="ne-cat" class="form-select form-select-lg">
                  <option value="">בחר קטגוריה</option>
                  ${cats.map(c => `<option value="${esc(c['קטגוריה']||c.name||'')}">${esc(c['קטגוריה']||c.name||'')}</option>`).join('')}
                </select>
              </div>
              <div class="mb-3">
                <label class="form-label">תיאור</label>
                <textarea id="ne-desc" class="form-control" rows="3" placeholder="מה קרה?"></textarea>
              </div>
              <div class="mb-3">
                <label class="form-label">חומרה</label>
                <select id="ne-sev" class="form-select">
                  <option value="נמוכה">נמוכה</option>
                  <option value="בינונית" selected>בינונית</option>
                  <option value="גבוהה">גבוהה</option>
                </select>
              </div>
              <div id="ne-status" class="alert alert-info d-none" role="alert"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
              <button type="button" id="ne-save" class="btn btn-success btn-lg">💾 שמור אירוע</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', html);
    const modalEl = document.getElementById('addEvModal');

    // Show modal
    let bsModal;
    try {
      bsModal = (window.bootstrap && bootstrap.Modal) ? new bootstrap.Modal(modalEl) : null;
      if (bsModal) bsModal.show();
      else modalEl.classList.add('show'), modalEl.style.display = 'block', modalEl.style.background = 'rgba(0,0,0,0.5)';
    } catch (e) { console.warn('[simple] modal show err', e); }

    // Wire up the save button — re-entry guard prevents duplicates from
    // multiple-listener chains. Use BOTH addEventListener and onclick so the
    // click is captured no matter what; the guard makes them idempotent.
    let _inFlight = false;
    const wrappedSave = function (ev) {
      console.warn('[simple] save click fired');
      if (ev && ev.preventDefault) ev.preventDefault();
      if (_inFlight) { console.warn('[simple] duplicate click ignored'); return; }
      _inFlight = true;
      try { simpleSaveEvent(); }
      catch (e) { console.warn('[simple] save threw:', e); _inFlight = false; throw e; }
      setTimeout(() => { _inFlight = false; }, 2500);
    };
    const saveBtn = document.getElementById('ne-save');
    saveBtn.addEventListener('click', wrappedSave);
    saveBtn.onclick = wrappedSave;

    // Focus the student input
    setTimeout(() => { try { document.getElementById('ne-student').focus(); } catch {} }, 200);
  };

  // Persistent on-screen debug overlay so every step is visible without DevTools
  function dbgBanner(msg, color) {
    let el = document.getElementById('bht-save-dbg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'bht-save-dbg';
      el.style.cssText = 'position:fixed;top:60px;right:20px;min-width:300px;max-width:480px;background:#1e3a8a;color:#fff;padding:14px 18px;border-radius:10px;z-index:99999;font-family:Heebo,Arial,sans-serif;font-size:14px;direction:rtl;box-shadow:0 8px 24px rgba(0,0,0,0.3);white-space:pre-wrap;line-height:1.6';
      document.body.appendChild(el);
    }
    el.style.background = color || '#1e3a8a';
    el.textContent = msg;
    el.style.display = 'block';
  }
  function dbgClear() {
    const el = document.getElementById('bht-save-dbg');
    if (el) setTimeout(() => el.style.display = 'none', 5000);
  }

  async function simpleSaveEvent() {
    dbgBanner('🔵 לחיצה זוהתה — מתחיל שמירה...');
    const btn = document.getElementById('ne-save');
    const statusEl = document.getElementById('ne-status');
    const showStatus = (msg, type='info') => {
      if (!statusEl) return;
      statusEl.className = 'alert alert-' + type;
      statusEl.textContent = msg;
      statusEl.classList.remove('d-none');
    };

    const typed = (document.getElementById('ne-student').value || '').trim();
    const cat = document.getElementById('ne-cat').value;
    const desc = (document.getElementById('ne-desc').value || '').trim();
    const sev = document.getElementById('ne-sev').value || 'בינונית';

    // Resolve student by typed name
    const students = getStudents();
    let stu = students.find(s => studentName(s) === typed);
    if (!stu && typed) {
      // Fallback substring
      const q = typed.toLowerCase();
      const matches = students.filter(s => studentName(s).toLowerCase().includes(q));
      if (matches.length === 1) stu = matches[0];
    }

    if (!stu) {
      dbgBanner('⚠️ לא נבחר תלמיד. הקלד שם מהרשימה. (' + students.length + ' תלמידים זמינים)', '#b45309');
      showStatus('יש להקליד שם תלמיד מהרשימה. נמצאו ' + students.length + ' תלמידים זמינים.', 'warning');
      return;
    }
    if (!cat) { dbgBanner('⚠️ לא נבחרה קטגוריה', '#b45309'); showStatus('יש לבחור קטגוריה', 'warning'); return; }
    if (!desc) { dbgBanner('⚠️ חסר תיאור', '#b45309'); showStatus('יש להוסיף תיאור', 'warning'); return; }

    dbgBanner('🟡 שומר את האירוע של ' + studentName(stu) + '...');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ שומר...';
    }
    showStatus('שומר באופן מקומי...', 'info');

    const now = new Date();
    const obj = {
      'מזהה': Math.floor(now.getTime() / 1000) * 1000 + Math.floor(Math.random() * 1000),
      'תלמיד_מזהה': String(stu['מזהה']||''),
      'שם תלמיד': studentName(stu),
      'קטגוריה': cat,
      'תיאור': desc,
      'חומרה': sev,
      'תאריך': now.toISOString(),
      'דווח_עי': (function() {
        try { return JSON.parse(sessionStorage.getItem('user')||'{}').username || 'admin'; } catch { return 'admin'; }
      })(),
    };
    try {
      if (typeof getHebrewInfo === 'function') {
        const info = getHebrewInfo(now);
        obj['תאריך_עברי'] = info.hdate || '';
        obj['פרשה'] = info.parsha || '';
      }
    } catch {}

    let saved = false;

    // Try the real api first — with a 6s timeout so a hung ensureLoaded()
    // never blocks the save flow. If timeout hits, we fall through to the
    // local-cache path which the background sync will pick up later.
    dbgBanner('🟡 שלב 1/3: שולח לשרת...');
    try {
      if (typeof window.api === 'function') {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('api timeout 6s')), 6000));
        const apiCall = window.api('addBehavior', [obj]);
        const r = await Promise.race([apiCall, timeout]);
        if (r && r.ok !== false) {
          saved = true;
          dbgBanner('🟢 שלב 1/3 הצליח: השרת קיבל');
        } else {
          dbgBanner('🟠 שלב 1/3 נכשל - נשמור מקומית: ' + ((r && r.error) || 'תשובה ריקה'), '#b45309');
          console.warn('[simple] api addBehavior failed:', r);
        }
      } else {
        dbgBanner('🟠 אין api - שומר מקומית', '#b45309');
      }
    } catch (e) {
      dbgBanner('🟠 שגיאה: ' + (e && e.message) + ' - שומר מקומית', '#b45309');
      console.warn('[simple] api threw / timed out:', e && e.message);
    }

    // ALWAYS also write to localStorage so it's never lost
    dbgBanner('🟡 שלב 2/3: שומר מקומית...');
    try {
      const data = JSON.parse(localStorage.getItem('cheder_bht_data') || '{}');
      if (!Array.isArray(data.behavior)) data.behavior = [];
      // Don't duplicate if api already added it (look by id)
      const exists = data.behavior.some(e => String(e['מזהה']||'') === String(obj['מזהה']));
      if (!exists) data.behavior.push(obj);
      localStorage.setItem('cheder_bht_data', JSON.stringify(data));
      saved = true;
      dbgBanner('🟢 שלב 2/3 הושלם: שמור ב-localStorage (' + data.behavior.length + ' אירועים סה"כ)');
    } catch (e) {
      dbgBanner('🔴 שלב 2/3 נכשל: ' + e.message, '#dc2626');
      showStatus('שגיאה: ' + e.message, 'danger');
      if (btn) { btn.disabled = false; btn.textContent = '💾 שמור אירוע'; }
      return;
    }

    // Update in-memory events list immediately
    try {
      if (!Array.isArray(window._events)) window._events = [];
      window._events.unshift(obj);
      window._events.sort((a, b) => new Date(b['תאריך']) - new Date(a['תאריך']));
    } catch {}

    // Try to redraw the events list directly without going through debounced renderBehavior
    dbgBanner('🟡 שלב 3/3: מעדכן את הרשימה...');
    try {
      if (typeof window.drawEvents === 'function' && document.getElementById('b-list')) {
        window.drawEvents(window._events.filter(e => e['סטטוס_אישור'] !== 'ממתין לאישור'));
      }
      if (typeof window.updateTabBadges === 'function') window.updateTabBadges();
    } catch (e) { console.warn('[simple] redraw err', e); }

    showStatus('✓ נשמר בהצלחה!', 'success');
    if (typeof window.toast === 'function') {
      try { window.toast('✓ אירוע נשמר: ' + studentName(stu), 'success'); } catch {}
    }
    dbgBanner('🟢 ✓ נשמר בהצלחה!\nתלמיד: ' + studentName(stu) + '\nקטגוריה: ' + cat, '#16a34a');
    dbgClear();

    // Close modal after a short delay so user sees the success message
    setTimeout(() => {
      const modalEl = document.getElementById('addEvModal');
      if (!modalEl) return;
      try {
        const inst = window.bootstrap && bootstrap.Modal ? bootstrap.Modal.getInstance(modalEl) : null;
        if (inst) inst.hide();
        else modalEl.remove();
      } catch { try { modalEl.remove(); } catch {} }
      document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
      document.body.classList.remove('modal-open');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }, 700);
  }

  // Also keep saveEvent in sync for any code that calls it from elsewhere
  window.saveEvent = function (event) {
    event?.preventDefault?.();
    return simpleSaveEvent();
  };

  // Disable pack-105 textarea unwrapping inside our modal explicitly
  if (typeof MutationObserver !== 'undefined') {
    const obs = new MutationObserver(() => {
      const modal = document.getElementById('addEvModal');
      if (!modal) return;
      modal.querySelectorAll('textarea, input').forEach(el => {
        el.removeAttribute('data-mic-added');
        el.removeAttribute('data-mic-injected');
        el.removeAttribute('data-camera');
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: false });
  }

  console.warn('%c✅ behavior-simple.js loaded — clean save flow (bypasses pack wrappers)', 'color:#16a34a;font-weight:bold;font-size:13px');
})();
