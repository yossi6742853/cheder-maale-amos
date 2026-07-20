// app.js — שלד + ראוטר (חלק 1). בונה את אריחי הבית ואת עמודי ממלאי-המקום,
// מנווט ביניהם, ומראה את מצב המערכת. אין נתונים אמיתיים בשלב זה.
(function () {
  'use strict';

  // רשימת המודולים — כל אחד יקבל אריח + עמוד. part = באיזה חלק בנייה נבנה בפועל.
  const G1 = 'מעקב ולמידה', G2 = 'תלמיד וקהילה', G3 = 'ניהול ודוחות';
  const MODULES = [
    { id: 'behavior',      label: 'מעקב התנהגות',     icon: 'bi-clipboard-check', group: G1, color: '#c0392b' },
    { id: 'reading',       label: 'קידום קריאה',      icon: 'bi-book',            group: G1, color: '#2e86ab' },
    { id: 'writing',       label: 'מעקב כתיבה',       icon: 'bi-pencil-square',   group: G1, color: '#8e44ad' },
    { id: 'attendance',    label: 'נוכחות',           icon: 'bi-calendar-check',  group: G1, color: '#1f8a5b' },
    { id: 'tests',         label: 'מבחנים',           icon: 'bi-card-checklist',  group: G1, color: '#d68910' },
    { id: 'functioning',   label: 'ציוני תפקוד',      icon: 'bi-bar-chart-line',  group: G1, color: '#16a085' },
    { id: 'students',      label: 'תלמידים',          icon: 'bi-people-fill',     group: G2, color: '#2b7c98' },
    { id: 'medical',       label: 'רפואי',            icon: 'bi-capsule',         group: G2, color: '#d35400' },
    { id: 'conversations', label: 'שיחות',            icon: 'bi-chat-dots',       group: G2, color: '#2980b9' },
    { id: 'meetings',      label: 'אסיפות הורים',     icon: 'bi-people',          group: G2, color: '#7d3c98' },
    { id: 'forms',         label: 'טפסים וחתימות',    icon: 'bi-file-earmark-check', group: G2, color: '#c0398a' },
    { id: 'calendar',      label: 'לוח שנה',          icon: 'bi-calendar3',       group: G2, color: '#117a65' },
    { id: 'reports',       label: 'דשבורד ודוחות',    icon: 'bi-graph-up-arrow',  group: G3, color: '#34495e' },
    { id: 'tuition',       label: 'שכר לימוד',        icon: 'bi-cash-coin',       group: G3, color: '#229954' },
    { id: 'cashbox',       label: 'קופה כללית',       icon: 'bi-wallet2',         group: G3, color: '#16794f' },
    { id: 'settings',      label: 'הגדרות והרשאות',   icon: 'bi-gear',            group: G3, color: '#7f8c8d', adminOnly: true },
  ];
  window.MODULES = MODULES;

  const $ = (s, r = document) => r.querySelector(s);

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of kids) if (c != null) e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }

  function buildTiles() {
    const grid = $('#tileGrid');
    grid.innerHTML = '';
    const groups = [];
    MODULES.forEach(m => { let g = groups.find(x => x.name === m.group); if (!g) { g = { name: m.group, items: [] }; groups.push(g); } g.items.push(m); });
    groups.forEach(g => {
      const sec = el('div', { class: 'tile-group' }, el('h3', { class: 'group-title' }, g.name));
      const row = el('div', { class: 'tile-grid-inner' });
      g.items.forEach(m => {
        const tile = el('a', { class: 'tile', href: '#' + m.id, 'data-id': m.id, style: '--tc:' + m.color },
          el('span', { class: 'ic', html: '<i class="bi ' + m.icon + '"></i>' }),
          el('span', { class: 't' }, m.label),
          el('span', { class: 'tile-arrow', html: '<i class="bi bi-arrow-left-short"></i>' })
        );
        tile.addEventListener('click', (e) => { e.preventDefault(); showPage(m.id); });
        row.appendChild(tile);
      });
      sec.appendChild(row);
      grid.appendChild(sec);
    });
  }

  function buildPages() {
    const host = $('#pages');
    MODULES.forEach(m => {
      const page = el('section', { class: 'page', id: 'page-' + m.id },
        el('div', { class: 'page-head' },
          el('button', { class: 'back', onclick: () => showPage('home') }, '→ חזרה לתפריט'),
          el('h2', {}, m.label)
        ),
        el('div', { class: 'soon-card' },
          el('span', { class: 'ic', html: '<i class="bi ' + m.icon + '"></i>' }),
          el('div', { html: 'מסך <b>' + m.label + '</b> — השלד מוכן.' }),
          el('div', {}, 'המסך המלא (טפסים, נתונים, פעולות) ייבנה בשלב הבנייה שלו.'),
          el('span', { class: 'part' }, 'ייבנה בחלק ' + m.part)
        )
      );
      host.appendChild(page);
    });
  }

  function showPage(id) {
    if (id && (window.MODULES || []).some(m => m.id === id) && window.Auth && window.Auth.currentUser && !window.Auth.canAccess(id)) {
      if (window.UI) window.UI.toast('אין לך הרשאה למסך זה', 'err');
      id = 'home';
    }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById('page-' + id) || $('#page-home');
    target.classList.add('active');
    if (window.PAGE_RENDERERS && window.PAGE_RENDERERS[id]) {
      try { window.PAGE_RENDERERS[id](target); } catch (e) { console.warn('renderer error', id, e); }
    }
    if (id && id !== 'home') { try { history.replaceState({}, '', '#' + id); } catch (_) {} }
    else { try { history.replaceState({}, '', location.pathname); } catch (_) {} }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.showPage = showPage;

  function wireDark() {
    const btn = $('#darkBtn');
    const saved = (() => { try { return localStorage.getItem('cv3_dark'); } catch (_) { return null; } })();
    if (saved === '1') document.body.classList.add('dark');
    btn.addEventListener('click', () => {
      const on = document.body.classList.toggle('dark');
      try { localStorage.setItem('cv3_dark', on ? '1' : '0'); } catch (_) {}
    });
  }

  function setStatus() {
    const wrap = $('#statusDot'), txt = $('#statusTxt');
    const c = window.CV3 || {};
    if (c.INSTANCE_NAME) $('#instanceName').textContent = c.INSTANCE_NAME;
    if (!window.db || window.db.DEMO) {
      wrap.classList.remove('ok'); wrap.classList.add('down');
      txt.textContent = 'מצב הדגמה';   // אין חיבור Supabase — תקין לשלד/בדיקה
    } else {
      wrap.classList.add('ok'); wrap.classList.remove('down');
      txt.textContent = 'מחובר';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildTiles();
    buildPages();
    wireDark();
    setStatus();
    if (window.Auth) window.Auth.init();   // מציג כניסה או בית לפי מצב האימות
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('sw.js').catch(() => {}); }
  });
})();
