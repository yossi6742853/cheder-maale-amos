/**
 * audit_viewer.js — admin-only audit log viewer.
 *
 * Surface: a button on the staff page (admins only) that opens a modal
 * listing recent system audit events: who changed what and when.
 * Data source: the existing api('listAuditLog', []) (already wired
 * server-side to the יומן_פעולות tab) plus any Supabase audit_log rows.
 */
(function () {
  'use strict';

  const STYLE_ID = 'audit-style';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      .audit-backdrop { position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9998;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(2px) }
      .audit-modal { background:#fff;border-radius:14px;max-width:900px;width:100%;max-height:90vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4) }
      .audit-head { padding:16px 22px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:10px;background:#f8fafc }
      .audit-head h5 { margin:0;flex:1;color:#1e293b }
      .audit-toolbar { padding:10px 22px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;background:#fafbfc }
      .audit-body { overflow-y:auto;flex:1 }
      .audit-row { padding:10px 22px;border-bottom:1px solid #f1f5f9;display:flex;gap:14px;align-items:flex-start }
      .audit-row:hover { background:#f8fafc }
      .audit-row .at { color:#64748b;font-size:.78rem;min-width:130px }
      .audit-row .who { font-weight:500;color:#1e293b;min-width:90px }
      .audit-row .what { flex:1;color:#475569 }
      .audit-badge { display:inline-block;padding:1px 8px;border-radius:8px;font-size:.7rem;font-weight:500;background:#dbeafe;color:#1e40af;margin-left:6px }
      .audit-badge.add { background:#dcfce7;color:#15803d }
      .audit-badge.del { background:#fee2e2;color:#b91c1c }
      .audit-badge.edit { background:#fef3c7;color:#a16207 }
      [data-theme="dark"] .audit-modal { background:#0f172a;color:#e2e8f0 }
      [data-theme="dark"] .audit-head { background:#1e293b;border-bottom-color:#334155 }
      [data-theme="dark"] .audit-toolbar { background:#172033;border-bottom-color:#334155 }
      [data-theme="dark"] .audit-row { border-bottom-color:#1e293b }
      [data-theme="dark"] .audit-row:hover { background:#1e293b }
      [data-theme="dark"] .audit-row .what { color:#cbd5e1 }
    `;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function fmtDate(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 16);
    return d.toLocaleString('he-IL', { hour12: false });
  }

  function actionBadge(action) {
    const a = String(action || '').toLowerCase();
    if (a.includes('הוספה') || a.includes('add') || a.includes('create')) return 'add';
    if (a.includes('מחיק') || a.includes('delete')) return 'del';
    if (a.includes('עריכ') || a.includes('עדכון') || a.includes('update') || a.includes('edit')) return 'edit';
    return '';
  }

  let _allRows = [];
  let _filter = 'all';
  let _query = '';

  function renderBody() {
    const list = _allRows.filter(r => {
      if (_filter !== 'all') {
        const a = String(r['פעולה'] || r.action || '').toLowerCase();
        if (_filter === 'add' && !(a.includes('הוספה') || a.includes('add'))) return false;
        if (_filter === 'del' && !(a.includes('מחיק') || a.includes('delete'))) return false;
        if (_filter === 'edit' && !(a.includes('עריכ') || a.includes('עדכון') || a.includes('update'))) return false;
      }
      if (_query) {
        const hay = [r['משתמש'], r['פעולה'], r['ישות'], r['פירוט']].join(' ').toLowerCase();
        if (!hay.includes(_query.toLowerCase())) return false;
      }
      return true;
    }).slice(0, 250);

    const body = document.getElementById('audit-body');
    if (!body) return;
    if (!list.length) {
      body.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px">אין רשומות שתואמות</div>';
      return;
    }
    body.innerHTML = list.map(r => {
      const action = r['פעולה'] || r.action || '';
      const badge = actionBadge(action);
      return `<div class="audit-row">
        <div class="at">${escHtml(fmtDate(r['תאריך'] || r.created_at || r['חותמת זמן']))}</div>
        <div class="who">${escHtml(r['משתמש'] || r.actor || '?')}</div>
        <div class="what">
          <span class="audit-badge ${badge}">${escHtml(action)}</span>
          <b>${escHtml(r['ישות'] || r.entity || '')}</b>
          <span style="opacity:.8">${escHtml(r['פירוט'] || r.detail || '')}</span>
        </div>
      </div>`;
    }).join('');
  }

  window.openAuditLog = async function () {
    ensureStyle();
    const back = document.createElement('div');
    back.className = 'audit-backdrop';
    back.onclick = (e) => { if (e.target === back) closeAuditLog(); };
    back.innerHTML = `
      <div class="audit-modal" role="dialog">
        <div class="audit-head">
          <i class="bi bi-journal-text text-primary fs-5"></i>
          <h5>יומן פעולות</h5>
          <button class="btn btn-sm btn-outline-secondary" onclick="closeAuditLog()">×</button>
        </div>
        <div class="audit-toolbar">
          <input id="audit-search" placeholder="חיפוש..." class="form-control form-control-sm" style="max-width:260px">
          <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-primary" data-fil="all">הכל</button>
            <button class="btn btn-outline-success" data-fil="add">הוספה</button>
            <button class="btn btn-outline-warning" data-fil="edit">עריכה</button>
            <button class="btn btn-outline-danger" data-fil="del">מחיקה</button>
          </div>
          <span class="ms-auto small text-muted" id="audit-count">טוען…</span>
        </div>
        <div class="audit-body" id="audit-body">
          <div style="text-align:center;padding:30px"><div class="spinner-border text-primary"></div></div>
        </div>
      </div>`;
    document.body.appendChild(back);
    window._audit_back = back;

    document.getElementById('audit-search').oninput = (e) => { _query = e.target.value; renderBody(); };
    Array.from(back.querySelectorAll('[data-fil]')).forEach(b => {
      b.onclick = () => {
        _filter = b.dataset.fil;
        Array.from(back.querySelectorAll('[data-fil]')).forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        renderBody();
      };
    });

    try {
      const r = await api('listAuditLog', []);
      _allRows = (r.data || []).sort((a, b) => {
        const da = new Date(a['תאריך'] || a['חותמת זמן'] || 0);
        const db = new Date(b['תאריך'] || b['חותמת זמן'] || 0);
        return db - da;
      });
      document.getElementById('audit-count').textContent = `${_allRows.length} רשומות`;
      renderBody();
    } catch (e) {
      document.getElementById('audit-body').innerHTML = `<div style="text-align:center;color:#dc2626;padding:30px">שגיאה בטעינה: ${escHtml(e.message || e)}</div>`;
    }
  };

  window.closeAuditLog = function () {
    if (window._audit_back) { window._audit_back.remove(); window._audit_back = null; }
  };

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window._audit_back) closeAuditLog();
  });
})();
