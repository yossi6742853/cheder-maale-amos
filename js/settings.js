async function renderSettings() {
  document.getElementById('page-settings').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-gear"></i> הגדרות והרשאות</h3>
      <button class="btn btn-primary" onclick="addUserModal()"><i class="bi bi-plus"></i> משתמש חדש</button>
    </div>
    <div class="card p-3 mb-3">
      <h5>משתמשים</h5>
      <table class="table table-hover">
        <thead><tr><th>שם משתמש</th><th>תפקיד</th><th>הרשאות</th></tr></thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
    <div class="card p-3">
      <h5>אודות המערכת</h5>
      <ul class="mb-0">
        <li>מערכת חדר מעלה עמוס - גרסה 1.0</li>
        <li>backend: Google Apps Script + Google Sheets</li>
        <li>אחסון מקומי כגיבוי (localStorage)</li>
        <li>RTL עברית מלא</li>
      </ul>
    </div>`;
  const r = await api('listUsers', []);
  const users = r.data || [];
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">אין משתמשים</td></tr>';
    return;
  }
  const PERM_LABELS = {students:'תלמידים', behavior:'התנהגות', reports:'דוחות', settings:'ניהול', all:'הכל'};
  tbody.innerHTML = users.map(u => {
    const role = u['תפקיד']||'';
    const cls = role === 'מנהל' ? 'role-admin' : role === 'רב' ? 'role-rabbi' : 'role-readonly';
    const perms = (u['הרשאות']||'').split(',').map(p => p.trim()).filter(Boolean);
    const permBadges = perms.map(p => `<span class="cat-badge me-1">${PERM_LABELS[p]||p}</span>`).join(' ');
    return `<tr><td>${u['שם משתמש']||''}</td><td><span class="badge ${cls}">${role}</span></td><td>${permBadges}</td></tr>`;
  }).join('');
}

const PERMISSION_AREAS = [
  { key: 'students', label: 'תלמידים', icon: 'bi-people', desc: 'צפייה והוספה של תלמידים' },
  { key: 'behavior', label: 'מעקב התנהגות', icon: 'bi-clipboard-check', desc: 'תיעוד אירועים' },
  { key: 'reports', label: 'דוחות וייצוא', icon: 'bi-file-earmark-pdf', desc: 'הורדת PDF' },
  { key: 'settings', label: 'ניהול משתמשים', icon: 'bi-gear', desc: 'הוספה ועריכה של משתמשים' },
];

const ROLE_DEFAULTS = {
  'מנהל': ['students','behavior','reports','settings'],
  'רב': ['students','behavior','reports'],
  'מורה': ['students','behavior'],
  'קריאה בלבד': ['students'],
  'מותאם אישית': [],
};

function addUserModal() {
  const checkboxes = PERMISSION_AREAS.map(a => `
    <div class="form-check d-flex align-items-center p-3 mb-2 border rounded" style="cursor:pointer">
      <input class="form-check-input ms-3 perm-cb" type="checkbox" value="${a.key}" id="perm-${a.key}">
      <label class="form-check-label flex-grow-1 ms-2" for="perm-${a.key}" style="cursor:pointer">
        <i class="bi ${a.icon} fs-4 text-primary"></i>
        <strong class="ms-2">${a.label}</strong>
        <div class="text-muted small">${a.desc}</div>
      </label>
    </div>
  `).join('');

  const html = `<div class="modal fade" id="addUModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-person-plus"></i> משתמש חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">שם משתמש</label>
          <input id="nu-name" class="form-control form-control-lg" placeholder="לדוגמה: rabbi.cohen">
        </div>
        <div class="col-md-6">
          <label class="form-label">סיסמה</label>
          <input id="nu-pass" class="form-control form-control-lg" placeholder="לפחות 4 ספרות">
        </div>
        <div class="col-12">
          <label class="form-label">תפקיד</label>
          <select id="nu-role" class="form-select form-select-lg">
            ${Object.keys(ROLE_DEFAULTS).map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
          <div class="text-muted small mt-1">בחירת תפקיד מסמנת אוטומטית את ההרשאות המתאימות</div>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-shield-check"></i> מסכים שיוכל לראות:</h6>
          ${checkboxes}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveUser()"><i class="bi bi-check"></i> שמור משתמש</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('addUModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addUModal')).show();

  // Auto-set permissions when role changes
  function updatePerms(){
    const role = document.getElementById('nu-role').value;
    const defaults = ROLE_DEFAULTS[role] || [];
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = defaults.includes(a.key);
    });
  }
  document.getElementById('nu-role').addEventListener('change', updatePerms);
  updatePerms();
}

async function saveUser() {
  const checked = Array.from(document.querySelectorAll('.perm-cb:checked')).map(c => c.value);
  const obj = {
    'שם משתמש': document.getElementById('nu-name').value.trim(),
    'סיסמה': document.getElementById('nu-pass').value.trim(),
    'תפקיד': document.getElementById('nu-role').value,
    'הרשאות': checked.length === 4 ? 'all' : checked.join(','),
  };
  if (!obj['שם משתמש'] || !obj['סיסמה']) return alert('שם וסיסמה חובה');
  if (!checked.length) return alert('יש לסמן לפחות מסך אחד');
  const r = await api('addUser', [obj]);
  bootstrap.Modal.getInstance(document.getElementById('addUModal')).hide();
  renderSettings();
}

async function renderReports() {
  document.getElementById('page-reports').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <h3 class="mb-3"><i class="bi bi-file-earmark-pdf"></i> דוחות וייצוא</h3>
    <div class="row g-3">
      <div class="col-md-4"><div class="card p-4 text-center card-tile" onclick="generateReport('students')">
        <i class="bi bi-people fs-1 text-primary"></i>
        <h5 class="mt-2">רשימת תלמידים</h5>
        <p class="text-muted small mb-0">פירוט מלא של תלמידים עם כל הפרטים</p>
      </div></div>
      <div class="col-md-4"><div class="card p-4 text-center card-tile" onclick="generateReport('behavior')">
        <i class="bi bi-clipboard fs-1 text-success"></i>
        <h5 class="mt-2">מעקב התנהגות</h5>
        <p class="text-muted small mb-0">כל אירועי ההתנהגות לפי תאריך</p>
      </div></div>
      <div class="col-md-4"><div class="card p-4 text-center card-tile" onclick="generateReport('all')">
        <i class="bi bi-file fs-1 text-info"></i>
        <h5 class="mt-2">דוח מלא</h5>
        <p class="text-muted small mb-0">תלמידים + התנהגות + סטטיסטיקה</p>
      </div></div>
    </div>
    <div class="card p-3 mt-4">
      <h5><i class="bi bi-info-circle"></i> איך זה עובד</h5>
      <ul class="mb-0 small text-muted">
        <li>לחץ על אחד הסוגים למעלה</li>
        <li>הדוח ייפתח בחלון חדש בעיצוב מודפס</li>
        <li>לחץ Ctrl+P או על "הדפס" לשמירה כ-PDF</li>
        <li>בחר "Save as PDF" כיעד הדפסה</li>
      </ul>
    </div>`;
}

function generateReport(type) {
  const data = getData();
  const today = new Date().toLocaleDateString('he-IL');
  const time = new Date().toLocaleTimeString('he-IL', {hour:'2-digit',minute:'2-digit'});

  let title, content;
  if (type === 'students') {
    title = 'רשימת תלמידים';
    content = renderStudentsReport(data.students);
  } else if (type === 'behavior') {
    title = 'מעקב התנהגות';
    content = renderBehaviorReport(data.behavior, data.students);
  } else {
    title = 'דוח מלא - חדר מעלה עמוס';
    content = renderStudentsReport(data.students) + '<div style="page-break-after:always"></div>' + renderBehaviorReport(data.behavior, data.students);
  }

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${title}</title>
<style>
@page{size:A4;margin:1.5cm}
body{font-family:Arial,'Heebo',sans-serif;direction:rtl;color:#1f2937;padding:0}
.header{border-bottom:3px solid #0066cc;padding-bottom:15px;margin-bottom:25px}
.header h1{margin:0;color:#0066cc;font-size:24pt}
.header .subtitle{color:#6b7280;font-size:11pt;margin-top:5px}
.section{margin-top:25px}
.section h2{color:#0066cc;border-bottom:1px solid #e5e7eb;padding-bottom:5px;font-size:16pt}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10pt}
th{background:#f3f4f6;text-align:right;padding:8px;border:1px solid #d1d5db;font-weight:700}
td{padding:6px 8px;border:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#fafafa}
.event{margin-bottom:12px;padding:10px;border-right:4px solid #0066cc;background:#f9fafb;border-radius:4px}
.event.high{border-color:#dc2626;background:#fef2f2}
.event.mid{border-color:#f59e0b;background:#fffbeb}
.event.low{border-color:#16a34a;background:#f0fdf4}
.event-meta{color:#6b7280;font-size:9pt;margin-bottom:4px}
.stats{display:flex;justify-content:space-around;background:#f3f4f6;padding:15px;border-radius:8px;margin:15px 0}
.stat{text-align:center}
.stat-num{font-size:24pt;color:#0066cc;font-weight:700}
.stat-label{font-size:10pt;color:#6b7280}
.print-btn{position:fixed;top:20px;left:20px;background:#0066cc;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14pt;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:100}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨 הדפס/שמור PDF</button>
<div class="header">
  <h1>${title}</h1>
  <div class="subtitle">חדר מעלה עמוס · הופק ב-${today} בשעה ${time}</div>
</div>
${content}
<script>setTimeout(()=>window.print(), 500);</script>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

function renderStudentsReport(students) {
  if (!students.length) return '<div class="section"><p>אין תלמידים רשומים.</p></div>';
  const stats = `<div class="stats">
    <div class="stat"><div class="stat-num">${students.length}</div><div class="stat-label">תלמידים</div></div>
    <div class="stat"><div class="stat-num">${new Set(students.map(s=>s['מחזור'])).size}</div><div class="stat-label">מחזורים</div></div>
  </div>`;
  let table = '<table><thead><tr><th>מזהה</th><th>שם מלא</th><th>גיל</th><th>מחזור</th><th>שם אם</th><th>טלפון אם</th><th>שם אב</th><th>טלפון אב</th><th>כתובת</th></tr></thead><tbody>';
  students.forEach(s => {
    table += `<tr>
      <td>${s['מזהה']||''}</td>
      <td><strong>${s['שם פרטי']||''} ${s['שם משפחה']||''}</strong></td>
      <td>${s['גיל']||''}</td>
      <td>${s['מחזור']||''}</td>
      <td>${s['שם אם']||''}</td>
      <td>${s['טלפון אם']||''}</td>
      <td>${s['שם אב']||''}</td>
      <td>${s['טלפון אב']||''}</td>
      <td>${s['כתובת']||''}</td>
    </tr>`;
  });
  table += '</tbody></table>';
  return `<div class="section">${stats}<h2>רשימת תלמידים</h2>${table}</div>`;
}

function renderBehaviorReport(events, students) {
  if (!events.length) return '<div class="section"><p>אין אירועים רשומים.</p></div>';
  const sorted = [...events].sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const high = sorted.filter(e => e['חומרה'] === 'גבוהה').length;
  const mid = sorted.filter(e => e['חומרה'] === 'בינונית').length;
  const low = sorted.filter(e => e['חומרה'] === 'נמוכה').length;
  const stats = `<div class="stats">
    <div class="stat"><div class="stat-num">${sorted.length}</div><div class="stat-label">סה"כ אירועים</div></div>
    <div class="stat"><div class="stat-num" style="color:#dc2626">${high}</div><div class="stat-label">חומרה גבוהה</div></div>
    <div class="stat"><div class="stat-num" style="color:#f59e0b">${mid}</div><div class="stat-label">בינונית</div></div>
    <div class="stat"><div class="stat-num" style="color:#16a34a">${low}</div><div class="stat-label">נמוכה</div></div>
  </div>`;
  let evs = '';
  sorted.forEach(e => {
    const sevCls = e['חומרה'] === 'גבוהה' ? 'high' : e['חומרה'] === 'נמוכה' ? 'low' : 'mid';
    const date = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
    evs += `<div class="event ${sevCls}">
      <div class="event-meta"><strong>${e['שם תלמיד']||''}</strong> · ${e['קטגוריה']||''} · ${date} · חומרה ${e['חומרה']||''}</div>
      <div>${e['תיאור']||''}</div>
    </div>`;
  });
  return `<div class="section">${stats}<h2>אירועי התנהגות</h2>${evs}</div>`;
}
