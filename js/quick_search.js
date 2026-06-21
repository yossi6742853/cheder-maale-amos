/**
 * quick_search.js — Ctrl+K palette (כמו Notion / VS Code / Linear)
 * Searches: pages (תלמידים, התנהגות...), students (by full name), recent behavior events.
 * Open with Ctrl+K (or Cmd+K). Esc closes.
 */
(function () {
  'use strict';

  const PAGES = [
    { key: 'students',      label: 'תלמידים',           icon: 'bi-people',           kw: 'תלמיד תלמידים רשימת' },
    { key: 'behavior',      label: 'התנהגות',           icon: 'bi-clipboard-check',  kw: 'התנהגות אירוע אירועים' },
    { key: 'attendance',    label: 'נוכחות',            icon: 'bi-check2-square',    kw: 'נוכחות חסר חיסור' },
    { key: 'conversations', label: 'שיחות',             icon: 'bi-chat-dots',        kw: 'שיחה שיחות שיחת' },
    { key: 'meetings',      label: 'אסיפות הורים',      icon: 'bi-people-fill',      kw: 'אסיפה הורה' },
    { key: 'calendar',      label: 'לוח שנה',           icon: 'bi-calendar3',        kw: 'לוח יומן תאריך' },
    { key: 'tasks',         label: 'משימות צוות',       icon: 'bi-list-check',       kw: 'משימה' },
    { key: 'projects',      label: 'פרויקטים',          icon: 'bi-kanban',           kw: 'פרויקט' },
    { key: 'writing',       label: 'כתיבה',             icon: 'bi-pencil-fill',      kw: '' },
    { key: 'reading',       label: 'קריאה',             icon: 'bi-book-half',        kw: '' },
    { key: 'lessonsKlein',  label: 'שיעורים פרטניים',   icon: 'bi-mortarboard',      kw: 'שיעור' },
    { key: 'tests',         label: 'מבחנים',            icon: 'bi-pencil-square',    kw: 'מבחן ציון' },
    { key: 'medications',   label: 'תרופות',            icon: 'bi-capsule',          kw: 'תרופה כדור' },
    { key: 'functioning',   label: 'תפקוד',             icon: 'bi-bar-chart-line',   kw: 'תפקוד דיוק' },
    { key: 'reports',       label: 'דוחות',             icon: 'bi-file-earmark-pdf', kw: 'דוח' },
    { key: 'staff',         label: 'צוות',              icon: 'bi-people-fill',      kw: 'צוות רב מורה' },
    { key: 'classview',     label: 'תצוגת כיתה',        icon: 'bi-grid-3x3-gap',     kw: 'כיתה' },
    { key: 'settings',      label: 'הגדרות',            icon: 'bi-gear',             kw: 'הגדרה הרשאה' },
    { key: 'cameras',       label: 'מצלמות',            icon: 'bi-camera-video',     kw: '' },
    { key: 'formsMgmt',     label: 'ניהול טפסים',       icon: 'bi-clipboard-data',   kw: 'טופס חתימה' },
    { key: 'home',          label: 'דף הבית',           icon: 'bi-house',            kw: 'בית home' },
  ];

  function ensureOverlay() {
    if (document.getElementById('qs-overlay')) return;
    const html = `
      <div id="qs-overlay" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;backdrop-filter:blur(2px)" onclick="if(event.target===this)quickSearchClose()">
        <div style="max-width:640px;margin:80px auto;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;">
          <div style="display:flex;align-items:center;border-bottom:1px solid #e2e8f0;padding:14px 18px;gap:10px">
            <i class="bi bi-search fs-5 text-muted"></i>
            <input id="qs-input" placeholder="חיפוש דף, תלמיד, או אירוע…  (Ctrl+K)" style="border:0;outline:0;flex:1;font-size:17px;background:transparent" autocomplete="off">
            <kbd class="small text-muted" style="background:#f1f5f9;padding:2px 6px;border-radius:4px">Esc</kbd>
          </div>
          <div id="qs-results" style="max-height:60vh;overflow-y:auto;padding:6px 0"></div>
          <div style="border-top:1px solid #e2e8f0;padding:6px 14px;font-size:12px;color:#64748b;display:flex;gap:14px;flex-wrap:wrap">
            <span><kbd>↑↓</kbd> ניווט</span>
            <span><kbd>Enter</kbd> בחירה</span>
            <span><kbd>Esc</kbd> סגירה</span>
          </div>
        </div>
      </div>`;
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  let _idx = 0;
  let _results = [];

  function open() {
    ensureOverlay();
    const o = document.getElementById('qs-overlay');
    o.style.display = 'block';
    const inp = document.getElementById('qs-input');
    inp.value = '';
    inp.focus();
    render('');
  }

  function close() {
    const o = document.getElementById('qs-overlay');
    if (o) o.style.display = 'none';
  }

  function pickAction(r) {
    close();
    if (r.kind === 'page') {
      if (typeof window.goto === 'function') window.goto(r.key);
      else location.hash = '#' + r.key;
    } else if (r.kind === 'student') {
      // Prefer the quickview modal if available — faster than full page nav
      if (typeof window.showStudentQuickView === 'function') {
        window.showStudentQuickView(r.id);
      } else {
        location.hash = '#student-card?id=' + encodeURIComponent(r.id);
      }
    } else if (r.kind === 'behavior') {
      location.hash = '#student-card?id=' + encodeURIComponent(r.student_id) + '&tab=behavior';
    }
  }

  function buildResults(q) {
    q = (q || '').trim();
    const results = [];
    const ql = q.toLowerCase();
    PAGES.forEach(p => {
      const hay = (p.label + ' ' + p.kw + ' ' + p.key).toLowerCase();
      if (!ql || hay.includes(ql)) {
        results.push({ kind: 'page', key: p.key, label: p.label, icon: p.icon });
      }
    });

    // Students
    try {
      const data = (typeof getData === 'function') ? getData() : (window._data || {});
      const students = data.students || [];
      students.forEach(s => {
        const name = s['שם מלא'] || s['שם'] || '';
        if (!name) return;
        if (!ql || name.includes(q) || (s['כיתה'] || '').includes(q)) {
          results.push({
            kind: 'student', id: s['מזהה'] || s.id,
            label: name + (s['כיתה'] ? ' · ' + s['כיתה'] : ''),
            icon: 'bi-person-vcard',
          });
        }
      });
    } catch (_) {}

    return results.slice(0, 40);
  }

  function render(q) {
    _results = buildResults(q);
    _idx = 0;
    const cont = document.getElementById('qs-results');
    if (!cont) return;
    if (!_results.length) {
      cont.innerHTML = '<div class="text-center text-muted py-4">אין תוצאות</div>';
      return;
    }
    cont.innerHTML = _results.map((r, i) => `
      <div class="qs-row" data-i="${i}" style="display:flex;align-items:center;gap:12px;padding:10px 18px;cursor:pointer;${i===0?'background:#eef2ff;':''}">
        <i class="bi ${r.icon} text-muted"></i>
        <span style="flex:1">${r.label}</span>
        <span class="small text-muted">${r.kind === 'page' ? 'דף' : (r.kind === 'student' ? 'תלמיד' : 'אירוע')}</span>
      </div>`).join('');
    Array.from(cont.querySelectorAll('.qs-row')).forEach((el) => {
      el.addEventListener('mouseenter', () => { _idx = +el.dataset.i; refreshHighlight(); });
      el.addEventListener('click', () => pickAction(_results[+el.dataset.i]));
    });
  }

  function refreshHighlight() {
    const rows = document.querySelectorAll('.qs-row');
    rows.forEach((el, i) => el.style.background = i === _idx ? '#eef2ff' : '');
    const cur = rows[_idx];
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('keydown', function (e) {
    // Ctrl+K / Cmd+K opens palette
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open();
      return;
    }
    const o = document.getElementById('qs-overlay');
    if (!o || o.style.display === 'none') return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown') { _idx = Math.min(_idx + 1, _results.length - 1); refreshHighlight(); e.preventDefault(); }
    if (e.key === 'ArrowUp')   { _idx = Math.max(_idx - 1, 0); refreshHighlight(); e.preventDefault(); }
    if (e.key === 'Enter' && _results[_idx]) { pickAction(_results[_idx]); }
  });

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'qs-input') render(e.target.value);
  });

  window.quickSearchOpen = open;
  window.quickSearchClose = close;
})();
