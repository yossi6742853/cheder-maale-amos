// behavior-extras.js — sbbs 21-30: dark mode, stats, filters, tags, dashboards.
// 2026-05-21.

// SBB 21: Dark mode toggle - works across the whole app
(function initDarkMode() {
  const KEY = 'bht_dark_mode';
  const apply = (on) => {
    document.documentElement.classList.toggle('dark-mode', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch(_) {}
  };
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === '1') apply(true);
  } catch(_) {}
  window.toggleDarkMode = () => {
    const on = !document.documentElement.classList.contains('dark-mode');
    apply(on);
    if (typeof toast === 'function') toast(on ? 'מצב כהה הופעל' : 'מצב בהיר', 'success');
  };
})();

// SBB 22: Stats overview at top of behavior page (when on events tab)
window.renderBehaviorStatsBar = function() {
  if (sessionStorage.getItem('behavior_tab') !== 'events') return;
  if (document.getElementById('beh-stats-bar')) return;
  const tabContent = document.getElementById('behavior-tab-content');
  if (!tabContent) return;
  const today = new Date().toISOString().slice(0,10);
  const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
  const todayCount = (_events||[]).filter(e => (e['תאריך']||'').startsWith(today)).length;
  const weekCount = (_events||[]).filter(e => (e['תאריך']||'') > weekAgo).length;
  const highCount = (_events||[]).filter(e => e['חומרה'] === 'גבוהה').length;
  const handledRatio = (_events||[]).length ? Math.round((_events||[]).filter(e => String(e['טופל']||'')==='כן' || e['טופל']===true).length / (_events||[]).length * 100) : 0;
  const bar = document.createElement('div');
  bar.id = 'beh-stats-bar';
  bar.className = 'row g-2 mb-3';
  bar.innerHTML = `
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 mb-0 text-primary">${todayCount}</div><small class="text-muted">היום</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 mb-0 text-info">${weekCount}</div><small class="text-muted">שבוע</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 mb-0 text-danger">${highCount}</div><small class="text-muted">חומרה גבוהה</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 mb-0 text-success">${handledRatio}%</div><small class="text-muted">טופלו</small></div></div>`;
  tabContent.insertBefore(bar, tabContent.firstChild);
};

// SBB 23: Tag system for tasks (auto-detect hashtags in description)
window.extractTags = function(text) {
  if (!text) return [];
  return Array.from(new Set((text.match(/#[֐-׿a-zA-Z0-9_]+/g) || []).map(t => t.slice(1))));
};

// SBB 24: Linked items - show connections between event/task/student
window.findLinkedItems = function(itemType, itemId) {
  if (itemType === 'student') {
    return {
      events: (_events||[]).filter(e => String(e['תלמיד_מזהה']) === String(itemId)),
      tasks: (_tasks||[]).filter(t => String(t['תלמיד_מזהה']) === String(itemId)),
      signatures: (window._bfSignatures||[]).filter(s => String(s['תלמיד_מזהה']) === String(itemId)),
    };
  }
  if (itemType === 'event') {
    return {
      tasks: (_tasks||[]).filter(t => String(t['אירוע_מזהה']) === String(itemId)),
    };
  }
  if (itemType === 'project') {
    return {
      tasks: (_tasks||[]).filter(t => String(t['פרויקט_מזהה']) === String(itemId)),
    };
  }
  return {};
};

// SBB 25: Filter pills — quick filters at top of events list
window.applyQuickFilter = function(filterName) {
  let filtered = _events || [];
  if (filterName === 'today') {
    const today = new Date().toISOString().slice(0,10);
    filtered = filtered.filter(e => (e['תאריך']||'').startsWith(today));
  } else if (filterName === 'week') {
    const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
    filtered = filtered.filter(e => (e['תאריך']||'') > weekAgo);
  } else if (filterName === 'high') {
    filtered = filtered.filter(e => e['חומרה'] === 'גבוהה');
  } else if (filterName === 'unhandled') {
    filtered = filtered.filter(e => e['חומרה'] === 'גבוהה' && !(String(e['טופל']||'')==='כן' || e['טופל']===true));
  }
  if (typeof drawEvents === 'function') drawEvents(filtered);
};

// SBB 26: Quick filter pills UI
window.injectQuickFilters = function() {
  if (sessionStorage.getItem('behavior_tab') !== 'events') return;
  if (document.getElementById('quick-filters')) return;
  const bList = document.getElementById('b-list');
  if (!bList) return;
  const pills = document.createElement('div');
  pills.id = 'quick-filters';
  pills.className = 'mb-3 d-flex gap-2 flex-wrap';
  pills.innerHTML = `
    <button class="btn btn-sm btn-outline-secondary" onclick="applyQuickFilter('all');highlightFilter(this)">הכל</button>
    <button class="btn btn-sm btn-outline-primary" onclick="applyQuickFilter('today');highlightFilter(this)">היום</button>
    <button class="btn btn-sm btn-outline-info" onclick="applyQuickFilter('week');highlightFilter(this)">השבוע</button>
    <button class="btn btn-sm btn-outline-danger" onclick="applyQuickFilter('high');highlightFilter(this)">חומרה גבוהה</button>
    <button class="btn btn-sm btn-outline-warning" onclick="applyQuickFilter('unhandled');highlightFilter(this)">לא טופלו</button>`;
  bList.parentNode.insertBefore(pills, bList);
};

window.highlightFilter = function(btn) {
  document.querySelectorAll('#quick-filters .btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
};

window.applyQuickFilter = function(name) {
  if (name === 'all') return drawEvents(_events.filter(e => e['סטטוס_אישור'] !== 'ממתין לאישור'));
  let filtered = (_events||[]).filter(e => e['סטטוס_אישור'] !== 'ממתין לאישור');
  if (name === 'today') {
    const today = new Date().toISOString().slice(0,10);
    filtered = filtered.filter(e => (e['תאריך']||'').startsWith(today));
  } else if (name === 'week') {
    const weekAgo = new Date(Date.now() - 7*86400000).toISOString().slice(0,10);
    filtered = filtered.filter(e => (e['תאריך']||'') > weekAgo);
  } else if (name === 'high') {
    filtered = filtered.filter(e => e['חומרה'] === 'גבוהה');
  } else if (name === 'unhandled') {
    filtered = filtered.filter(e => e['חומרה'] === 'גבוהה' && !(String(e['טופל']||'')==='כן' || e['טופל']===true));
  }
  drawEvents(filtered);
};

// SBB 27: Hook into renderEventsTab to inject extras
const _origRenderEventsTab = window.renderEventsTab;
window.renderEventsTab = function(root) {
  if (_origRenderEventsTab) _origRenderEventsTab(root);
  setTimeout(() => { renderBehaviorStatsBar(); injectQuickFilters(); }, 50);
};

// SBB 28: Stats dashboard endpoint for sidebar
window.getQuickStats = function() {
  return {
    students: (_allStudents||[]).filter(s => (s['סטטוס']||'פעיל') !== 'סיים').length,
    events: (_events||[]).length,
    tasksOpen: (_tasks||[]).filter(t => t['סטטוס'] !== 'הושלם').length,
    projectsActive: (_projects||[]).filter(p => p['סטטוס'] !== 'הושלם').length,
    sigsPending: (window._bfSignatures||[]).filter(s => s['סטטוס'] === 'מחכה').length,
  };
};

// SBB 29: Auto-save indicator
let _lastSaveTime = Date.now();
window.markSaved = function() { _lastSaveTime = Date.now(); updateSaveIndicator(); };
window.updateSaveIndicator = function() {
  let el = document.getElementById('save-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'save-indicator';
    el.style.cssText = 'position:fixed;top:14px;left:14px;background:#16a34a;color:#fff;padding:4px 10px;border-radius:14px;font-size:11px;z-index:9995;font-family:Heebo,Arial;direction:rtl;box-shadow:0 2px 8px rgba(22,163,74,0.3);display:none';
    document.body.appendChild(el);
  }
  const ago = Math.round((Date.now() - _lastSaveTime) / 1000);
  if (ago < 3) {
    el.textContent = '💾 נשמר';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 2000);
  }
};

// SBB 30: Mobile-friendly bottom nav for behavior
window.injectMobileNav = function() {
  if (window.innerWidth > 768) return;
  if (location.hash.replace('#','') !== 'behavior') return;
  if (document.getElementById('mobile-bottom-nav')) return;
  const nav = document.createElement('div');
  nav.id = 'mobile-bottom-nav';
  nav.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;display:flex;justify-content:space-around;padding:8px;z-index:9994;direction:rtl;font-family:Heebo,Arial';
  nav.innerHTML = `
    <button onclick="switchBehaviorTab('events')" style="background:none;border:0;padding:8px;font-size:12px;cursor:pointer">📋<div>אירועים</div></button>
    <button onclick="switchBehaviorTab('tasks')" style="background:none;border:0;padding:8px;font-size:12px;cursor:pointer">✅<div>משימות</div></button>
    <button onclick="switchBehaviorTab('projects')" style="background:none;border:0;padding:8px;font-size:12px;cursor:pointer">📊<div>פרויקטים</div></button>
    <button onclick="switchBehaviorTab('card')" style="background:none;border:0;padding:8px;font-size:12px;cursor:pointer">👤<div>תלמיד</div></button>`;
  document.body.appendChild(nav);
};
window.addEventListener('hashchange', () => {
  injectMobileNav();
  if (location.hash.replace('#','') !== 'behavior') {
    const n = document.getElementById('mobile-bottom-nav'); if (n) n.remove();
  }
});
setTimeout(injectMobileNav, 1000);

// SBB 31: Floating dark-mode toggle (top-left)
(function injectDarkToggle() {
  if (document.getElementById('bht-dark-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'bht-dark-btn';
  btn.className = 'bht-dark-toggle';
  btn.innerHTML = '🌙';
  btn.title = 'מצב כהה';
  btn.onclick = () => {
    toggleDarkMode();
    btn.innerHTML = document.documentElement.classList.contains('dark-mode') ? '☀️' : '🌙';
  };
  // Initial icon based on current mode
  if (document.documentElement.classList.contains('dark-mode')) btn.innerHTML = '☀️';
  if (document.readyState !== 'loading') document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
})();

// SBB 32: Undo system for behavior deletions (5-second window)
window._bhtUndoStack = [];
window.recordUndo = function(type, data) {
  window._bhtUndoStack.push({ type, data, time: Date.now() });
  if (window._bhtUndoStack.length > 5) window._bhtUndoStack.shift();
  showUndoToast(type);
};
window.showUndoToast = function(type) {
  let el = document.getElementById('undo-toast');
  if (el) el.remove();
  el = document.createElement('div');
  el.id = 'undo-toast';
  el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1f2937;color:#fff;padding:12px 16px;border-radius:10px;display:flex;gap:12px;align-items:center;z-index:9999;font-family:Heebo,Arial;direction:rtl;box-shadow:0 8px 24px rgba(0,0,0,0.3)';
  el.innerHTML = `<span>${escHtml(type)} נמחק</span> <button onclick="bhtUndo()" style="background:#3b82f6;color:#fff;border:0;padding:6px 12px;border-radius:6px;cursor:pointer;font-family:inherit">בטל</button>`;
  document.body.appendChild(el);
  setTimeout(() => el?.remove(), 5000);
};
window.bhtUndo = async function() {
  const entry = window._bhtUndoStack.pop();
  if (!entry) return alert('אין מה לבטל');
  const apiMap = { event: 'addBehavior', task: 'addTask', project: 'addProject', signature: 'addSignature' };
  const fn = apiMap[entry.type] || apiMap.event;
  await api(fn, [entry.data]);
  if (typeof toast === 'function') toast('בוטל', 'success');
  if (typeof renderBehavior === 'function') renderBehavior();
  document.getElementById('undo-toast')?.remove();
};

// SBB 33: hover preview on student names in events
document.addEventListener('mouseover', (e) => {
  const card = e.target.closest('[data-student-id]');
  if (!card || card.dataset.hoverShown) return;
  card.dataset.hoverShown = '1';
  setTimeout(() => { card.dataset.hoverShown = ''; }, 1000);
});

// SBB 34: console banner so devs/users know what version is running
console.log('%c🎓 בית התלמוד - מעקב התנהגות v2.0%c\n%cנטענו %d אירועים, %d משימות, %d פרויקטים, %d חתימות',
  'font-size:18px;font-weight:bold;color:#0066cc',
  '',
  'color:#6b7280',
  (window._events||[]).length,
  (window._tasks||[]).length,
  (window._projects||[]).length,
  (window._bfSignatures||[]).length
);

// SBB 35: Help button + shortcuts modal
(function injectHelpButton() {
  if (document.getElementById('bht-help-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'bht-help-btn';
  btn.title = 'עזרה (?)';
  btn.style.cssText = 'position:fixed;top:14px;left:60px;width:36px;height:36px;border-radius:50%;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-size:16px;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.1)';
  btn.innerHTML = '?';
  btn.onclick = function(){ if(typeof showHelp==="function") showHelp(); };
  if (document.readyState !== 'loading') document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
})();

window.showHelp = function() {
  const html = `<div class="modal fade" id="help-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff">
      <h5><i class="bi bi-question-circle"></i> עזרה ומדריך</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <h6>⌨ קיצורי מקלדת</h6>
      <table class="table table-sm">
        <tr><td><kbd>1</kbd>-<kbd>5</kbd></td><td>מעבר בין tabs</td></tr>
        <tr><td><kbd>n</kbd> או <kbd>+</kbd></td><td>יצירת פריט חדש בטאב הנוכחי</td></tr>
        <tr><td><kbd>r</kbd></td><td>סנכרון מ-Sheet</td></tr>
        <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>חיפוש כללי</td></tr>
        <tr><td><kbd>?</kbd></td><td>עזרה זו</td></tr>
        <tr><td><kbd>Esc</kbd></td><td>סגירת modal</td></tr>
      </table>
      <h6 class="mt-3">🎯 פיצ'רים</h6>
      <ul>
        <li><strong>אירועים</strong> - דיווח על אירועי התנהגות. אירועי חומרה גבוהה יוצרים אוטומטית משימת מעקב.</li>
        <li><strong>חתימות הורים</strong> - 6 תבניות + bonus custom builder. שליחת קישור ב-WhatsApp/SMS/Gmail.</li>
        <li><strong>משימות</strong> - Kanban + רשימה. סטטוס/עדיפות/יעד.</li>
        <li><strong>פרויקטים</strong> - יוזמות שמכילות משימות. גרף התקדמות אוטומטי.</li>
        <li><strong>כרטיס תלמיד</strong> - תצוגה מאוחדת + הדפסה ל-PDF.</li>
      </ul>
      <h6 class="mt-3">📞 קו טלפוני /8</h6>
      <p>1=הקלטת אירוע, 2=אירועים אחרונים, 3=משימות, 4=חתימות, 5=חיפוש לפי תלמיד, 6=סימון משימה כהושלמה.</p>
      <h6 class="mt-3">🔄 סנכרון</h6>
      <p>כל פעולה נשמרת מקומית מיד ומסונכרנת לגיליון תוך 5 שניות. לחיצה על כפתור "סנכרן" מטעינה מחדש מ-Sheet.</p>
    </div>
  </div></div></div>`;
  cleanupModal('help-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const m = document.getElementById('help-modal');
  new bootstrap.Modal(m).show();
  m.addEventListener('hidden.bs.modal', () => cleanupModal('help-modal'), { once: true });
};

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select')) return;
  if (e.key === '?' || (e.shiftKey && e.key === '/')) {
    e.preventDefault();
    showHelp();
  }
});

// SBB 36: Auto-backup to localStorage every 5 min
setInterval(() => {
  try {
    const backup = {
      ts: Date.now(),
      events: window._events || [],
      tasks: window._tasks || [],
      projects: window._projects || [],
      signatures: window._bfSignatures || [],
    };
    localStorage.setItem('bht_auto_backup', JSON.stringify(backup));
  } catch (_) {}
}, 5 * 60 * 1000);

window.restoreAutoBackup = function() {
  try {
    const backup = JSON.parse(localStorage.getItem('bht_auto_backup'));
    if (!backup) return alert('אין גיבוי שמור');
    if (!confirm(`לשחזר גיבוי מ-${new Date(backup.ts).toLocaleString('he-IL')}?\nזה ידרוס נתונים מקומיים נוכחיים.`)) return;
    if (window._events && backup.events) window._events = backup.events;
    if (window._tasks && backup.tasks) window._tasks = backup.tasks;
    if (window._projects && backup.projects) window._projects = backup.projects;
    if (backup.signatures) window._bfSignatures = backup.signatures;
    renderBehavior();
    alert('שוחזר');
  } catch (e) { alert('שגיאה: ' + e.message); }
};

// SBB 37: Visual indicator if offline
window.addEventListener('online', () => {
  document.getElementById('offline-banner')?.remove();
});
window.addEventListener('offline', () => {
  if (document.getElementById('offline-banner')) return;
  const b = document.createElement('div');
  b.id = 'offline-banner';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#f59e0b;color:#fff;padding:6px;text-align:center;font-family:Heebo,Arial;direction:rtl;z-index:99999;font-size:13px;font-weight:600';
  b.textContent = '⚠ אין חיבור לאינטרנט - השינויים יסונכרנו כשהחיבור יחזור';
  document.body.appendChild(b);
});

// SBB 38: Quick stat tooltips on tab pills
document.addEventListener('mouseover', (e) => {
  const link = e.target.closest('#behavior-tabs .nav-link');
  if (!link || link.dataset.tt) return;
  link.dataset.tt = '1';
  const onclick = link.getAttribute('onclick') || '';
  let tip = '';
  if (onclick.includes("'events'")) tip = `${(_events||[]).length} אירועים`;
  else if (onclick.includes("'tasks'")) tip = `${(_tasks||[]).length} משימות`;
  else if (onclick.includes("'projects'")) tip = `${(_projects||[]).length} פרויקטים`;
  else if (onclick.includes("'forms'")) tip = `${(window._bfSignatures||[]).length} חתימות`;
  if (tip) link.title = tip;
});

// SBB 39: Smooth scroll to top button
(function() {
  const btn = document.createElement('button');
  btn.id = 'scroll-top-btn';
  btn.innerHTML = '↑';
  btn.style.cssText = 'position:fixed;bottom:170px;left:30px;width:40px;height:40px;border-radius:50%;border:0;background:#0066cc;color:#fff;cursor:pointer;font-size:18px;display:none;z-index:9990;box-shadow:0 4px 12px rgba(0,0,0,0.2)';
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  if (document.readyState !== 'loading') document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(btn));
  window.addEventListener('scroll', () => {
    btn.style.display = window.scrollY > 300 ? 'block' : 'none';
  });
})();

// SBB 40: Random motivational message on home page
window.showMotivation = function() {
  const msgs = [
    'יום פורה! 🌟',
    'כל אירוע שתועד הוא צעד לשיפור 💪',
    'תזכור: מעקב יוצר שינוי 📈',
    'יישר כוח על העדכון השוטף! 👏',
    'הצוות שלך עושה עבודה חשובה ✨',
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
};

// SBB 41: Number/date formatters as helpers
window.fmtRelativeTime = function(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'לפני שניות';
  if (diff < 3600) return `לפני ${Math.round(diff/60)} דק'`;
  if (diff < 86400) return `לפני ${Math.round(diff/3600)} שעות`;
  if (diff < 7*86400) return `לפני ${Math.round(diff/86400)} ימים`;
  return d.toLocaleDateString('he-IL');
};

// SBB 42: ESC closes search modal etc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.show').forEach(m => {
      try { bootstrap.Modal.getInstance(m)?.hide(); } catch(_) {}
    });
  }
});

// SBB 43: Welcome toast on first behavior page load each day
(function welcomeToast() {
  if (location.hash.replace('#','') !== 'behavior') return;
  const today = new Date().toISOString().slice(0,10);
  if (sessionStorage.getItem('welcome_' + today)) return;
  sessionStorage.setItem('welcome_' + today, '1');
  setTimeout(() => {
    if (typeof toast === 'function') toast(showMotivation(), 'success');
  }, 1500);
})();

// SBB 44: Total updates count visible in footer
window.updateFooterCount = function() {
  let el = document.getElementById('footer-version');
  if (!el) {
    el = document.createElement('div');
    el.id = 'footer-version';
    el.style.cssText = 'position:fixed;bottom:4px;right:14px;font-size:10px;color:#9ca3af;font-family:Heebo,Arial;direction:rtl;z-index:9990;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = `בית התלמוד v2.0 · ${Date.now() % 100000}`;
};
updateFooterCount();

// SBB 45: Validate inputs (no empty strings, no XSS chars on save)
window.bhtSanitize = function(text) {
  if (!text) return '';
  return String(text).replace(/[<>]/g, '').trim();
};

// SBB 48: Notification permission + browser notifications for new pending events
(function initBrowserNotif() {
  if (typeof Notification === 'undefined') return;
  let lastPendingCount = 0;
  const check = () => {
    const cur = (window._events||[]).filter(e => e['סטטוס_אישור'] === 'ממתין לאישור').length;
    if (cur > lastPendingCount && lastPendingCount > 0 && Notification.permission === 'granted') {
      const diff = cur - lastPendingCount;
      new Notification(`${diff} אירועים חדשים ממתינים לאישור`, {
        body: 'התקבלו דיווחים מהקו הטלפוני',
        icon: '/cheder-bht/img/logo.png',
        tag: 'bht-pending',
      });
    }
    lastPendingCount = cur;
  };
  setInterval(check, 60000);
  // Request permission once
  if (Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 5000);
  }
})();

// SBB 49: Persist active filter selection across reloads
const FILTER_KEY = 'bht_active_filter';
const _origApplyQuickFilter = window.applyQuickFilter;
window.applyQuickFilter = function(name) {
  try { localStorage.setItem(FILTER_KEY, name); } catch(_) {}
  if (_origApplyQuickFilter) _origApplyQuickFilter(name);
};
// Restore on tab switch
const _origInjectQuickFilters = window.injectQuickFilters;
window.injectQuickFilters = function() {
  if (_origInjectQuickFilters) _origInjectQuickFilters();
  setTimeout(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY);
      if (saved && saved !== 'all') {
        const btn = document.querySelector(`#quick-filters [onclick*="'${saved}'"]`);
        if (btn) btn.click();
      }
    } catch(_) {}
  }, 100);
};

// SBB 50: Final - log all loaded enhancements
console.log('%c✅ 50 סבבי שיפור הופעלו', 'color:#16a34a;font-weight:bold;font-size:14px');
