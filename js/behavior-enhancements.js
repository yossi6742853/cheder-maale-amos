// behavior-enhancements.js — sbbs 11-20: many small improvements stacked.
// 2026-05-21. Each function is self-contained.

// SBB 11: Keyboard shortcuts on behavior page
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,textarea,select')) return;
  if (location.hash.replace('#','') !== 'behavior') return;
  const shortcuts = {
    '1': () => switchBehaviorTab('events'),
    '2': () => switchBehaviorTab('forms'),
    '3': () => switchBehaviorTab('tasks'),
    '4': () => switchBehaviorTab('projects'),
    '5': () => switchBehaviorTab('card'),
    'n': () => {
      const t = sessionStorage.getItem('behavior_tab') || 'events';
      if (t === 'events' && typeof addEventModal === 'function') addEventModal();
      else if (t === 'tasks' && typeof addTaskModal === 'function') addTaskModal();
      else if (t === 'projects' && typeof addProjectModal === 'function') addProjectModal();
    },
    'r': () => { if (typeof forceSyncBehavior === 'function') forceSyncBehavior(); },
  };
  if (shortcuts[e.key]) {
    e.preventDefault();
    shortcuts[e.key]();
  }
});

// SBB 12: Quick search across all behavior data (events/tasks/projects)
window.openBehaviorSearch = function() {
  const html = `<div class="modal fade" id="bs-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-search"></i> חיפוש כללי</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <input id="bs-q" class="form-control mb-3" placeholder="חפש בכל האירועים, המשימות והפרויקטים..." autocomplete="off">
      <div id="bs-results" style="max-height:400px;overflow-y:auto"></div>
    </div>
  </div></div></div>`;
  cleanupModal('bs-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const m = document.getElementById('bs-modal');
  new bootstrap.Modal(m).show();
  m.addEventListener('hidden.bs.modal', () => cleanupModal('bs-modal'), { once: true });
  setTimeout(() => document.getElementById('bs-q').focus(), 300);
  document.getElementById('bs-q').oninput = bsRefresh;
};

function bsRefresh() {
  const q = document.getElementById('bs-q').value.trim().toLowerCase();
  const el = document.getElementById('bs-results');
  if (!q || q.length < 2) { el.innerHTML = '<div class="text-muted text-center py-3">הקלד לפחות 2 תווים</div>'; return; }
  const match = (obj) => Object.values(obj).some(v => String(v||'').toLowerCase().includes(q));
  const evs = (_events || []).filter(match).slice(0, 10);
  const tks = (_tasks || []).filter(match).slice(0, 10);
  const prj = (_projects || []).filter(match).slice(0, 10);
  let out = '';
  if (evs.length) out += '<h6 class="mt-2">📋 אירועים</h6>' + evs.map(e => `<div class="small mb-1" onclick="hideModal('bs-modal');switchBehaviorTab('events')" style="cursor:pointer">→ ${escHtml(e['שם תלמיד']||'')} - ${escHtml((e['תיאור']||'').substring(0,60))}</div>`).join('');
  if (tks.length) out += '<h6 class="mt-2">✅ משימות</h6>' + tks.map(t => `<div class="small mb-1" onclick="hideModal('bs-modal');switchBehaviorTab('tasks')" style="cursor:pointer">→ ${escHtml(t['כותרת']||'')}</div>`).join('');
  if (prj.length) out += '<h6 class="mt-2">📊 פרויקטים</h6>' + prj.map(p => `<div class="small mb-1" onclick="hideModal('bs-modal');switchBehaviorTab('projects')" style="cursor:pointer">→ ${escHtml(p['שם']||'')}</div>`).join('');
  el.innerHTML = out || '<div class="text-muted text-center py-3">אין תוצאות</div>';
}

// SBB 13: Ctrl+K / Cmd+K for global search
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k' && location.hash.replace('#','') === 'behavior') {
    e.preventDefault();
    openBehaviorSearch();
  }
});

// SBB 14: Export current behavior tab to CSV
window.exportBehaviorCSV = function() {
  const tab = sessionStorage.getItem('behavior_tab') || 'events';
  const dataMap = {
    'events': { name: 'אירועים', rows: _events || [] },
    'tasks': { name: 'משימות', rows: _tasks || [] },
    'projects': { name: 'פרויקטים', rows: _projects || [] },
    'forms': { name: 'חתימות', rows: window._bfSignatures || [] },
  };
  const ds = dataMap[tab];
  if (!ds || !ds.rows.length) return alert('אין נתונים לייצוא');
  // Build CSV
  const headers = Object.keys(ds.rows[0]);
  const csv = [
    headers.join(','),
    ...ds.rows.map(r => headers.map(h => {
      const v = String(r[h] || '').replace(/"/g, '""');
      return `"${v}"`;
    }).join(','))
  ].join('\n');
  // Add BOM for Hebrew Excel
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ds.name}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  if (typeof toast === 'function') toast('✓ ייצוא הצליח', 'success');
};

// SBB 15: Print current tab list (works for any tab)
window.printBehaviorTab = function() {
  const tab = sessionStorage.getItem('behavior_tab') || 'events';
  const titles = { events: 'אירועים', tasks: 'משימות', projects: 'פרויקטים', forms: 'חתימות' };
  const dataMap = {
    'events': _events || [],
    'tasks': _tasks || [],
    'projects': _projects || [],
    'forms': window._bfSignatures || [],
  };
  const rows = dataMap[tab] || [];
  if (!rows.length) return alert('אין נתונים');
  const headers = Object.keys(rows[0]);
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${titles[tab]}</title>
  <style>
    @page{size:A4 landscape;margin:1cm}
    body{font-family:Arial;direction:rtl;font-size:9pt}
    h1{color:#0066cc;border-bottom:2px solid #0066cc;padding-bottom:6pt}
    table{width:100%;border-collapse:collapse;margin-top:10pt}
    th{background:#f3f4f6;padding:5pt;border:1px solid #ddd;font-size:9pt;text-align:right;font-weight:bold}
    td{padding:4pt;border:1px solid #e5e7eb;font-size:8.5pt;vertical-align:top}
    @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()" style="padding:8pt 16pt;background:#0066cc;color:#fff;border:0;border-radius:4px;cursor:pointer;margin-bottom:10pt">🖨 הדפס</button>
  <h1>${titles[tab]} — בית התלמוד · ${new Date().toLocaleDateString('he-IL')}</h1>
  <table><thead><tr>${headers.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead><tbody>
  ${rows.map(r => `<tr>${headers.map(h => `<td>${escHtml(String(r[h]||'').substring(0,100))}</td>`).join('')}</tr>`).join('')}
  </tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return alert('פופ-אפ חסום');
  w.document.write(html);
  w.document.close();
};

// SBB 16: Floating quick-action button (FAB) on behavior page
function injectBehaviorFAB() {
  if (document.getElementById('beh-fab')) return;
  if (location.hash.replace('#','') !== 'behavior') return;
  const fab = document.createElement('div');
  fab.id = 'beh-fab';
  fab.innerHTML = `
    <button class="beh-fab-main" onclick="document.getElementById('beh-fab').classList.toggle('open')">⚡</button>
    <div class="beh-fab-menu">
      <button onclick="openBehaviorSearch()" title="חיפוש (Ctrl+K)">🔍</button>
      <button onclick="exportBehaviorCSV()" title="ייצוא CSV">📊</button>
      <button onclick="printBehaviorTab()" title="הדפסה">🖨</button>
      <button onclick="forceSyncBehavior()" title="סנכרון (R)">🔄</button>
    </div>`;
  document.body.appendChild(fab);
}

// Re-inject FAB on hash change
window.addEventListener('hashchange', injectBehaviorFAB);
setTimeout(injectBehaviorFAB, 500);
setInterval(injectBehaviorFAB, 3000);

// SBB 17: Reminder banner if many overdue tasks
function checkOverdueReminders() {
  if (location.hash.replace('#','') !== 'behavior') return;
  const overdueCount = (_tasks || []).filter(t => t['סטטוס'] !== 'הושלם' && t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date()).length;
  if (overdueCount < 3) return;
  if (sessionStorage.getItem('overdue_dismissed_' + new Date().toISOString().slice(0,10))) return;
  if (document.getElementById('overdue-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'overdue-banner';
  banner.style.cssText = 'position:fixed;top:60px;right:20px;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 4px 16px rgba(220,38,38,0.4);z-index:9997;direction:rtl;font-family:Heebo,Arial,sans-serif;max-width:280px';
  banner.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start;gap:8px">
    <div><strong>⚠ ${overdueCount} משימות פגי תוקף</strong><div style="font-size:12px;margin-top:2px">לחץ לעבור למשימות</div></div>
    <button onclick="sessionStorage.setItem('overdue_dismissed_${new Date().toISOString().slice(0,10)}','1');this.closest('#overdue-banner').remove()" style="background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;padding:0 4px">×</button>
  </div>`;
  banner.onclick = (e) => { if (e.target.tagName !== 'BUTTON') switchBehaviorTab('tasks'); };
  banner.style.cursor = 'pointer';
  document.body.appendChild(banner);
}
window.addEventListener('cheder-data-refreshed', checkOverdueReminders);
setInterval(checkOverdueReminders, 60000);

// SBB 18: Tab title with badge for browser
function updateBrowserTitle() {
  if (location.hash.replace('#','') !== 'behavior') return;
  const counts = [
    (_events||[]).filter(e => e['סטטוס_אישור'] === 'ממתין לאישור').length,
    (_tasks||[]).filter(t => t['סטטוס'] !== 'הושלם' && t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date()).length,
  ];
  const total = counts.reduce((s, n) => s + n, 0);
  document.title = (total > 0 ? `(${total}) ` : '') + 'מעקב התנהגות - בית התלמוד';
}
setInterval(updateBrowserTitle, 30000);
window.addEventListener('cheder-data-refreshed', updateBrowserTitle);

// SBB 19: Skeleton loaders while data loads
window.showSkeletonLoader = function(rootEl, rows) {
  rootEl.innerHTML = Array(rows || 4).fill('').map(() => `
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-w70"></div>
      <div class="skeleton-line skeleton-w50"></div>
      <div class="skeleton-line skeleton-w90"></div>
    </div>
  `).join('');
};

// SBB 20: Quick-add via keyboard (when on respective tab)
function setupQuickAddListener() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (location.hash.replace('#','') !== 'behavior') return;
    if (e.key !== '+' && e.key !== '=') return;
    e.preventDefault();
    const t = sessionStorage.getItem('behavior_tab') || 'events';
    const map = { 'events': 'addEventModal', 'tasks': 'addTaskModal', 'projects': 'addProjectModal' };
    if (typeof window[map[t]] === 'function') window[map[t]]();
  });
}
setupQuickAddListener();

// Help tooltip showing all shortcuts
window.showShortcutsHelp = function() {
  alert([
    'קיצורי מקלדת:',
    '1-5: מעבר בין tabs',
    'n או +: יצירת פריט חדש',
    'r: סנכרון',
    'Ctrl+K: חיפוש',
    'Esc: סגירת modal',
  ].join('\n'));
};
