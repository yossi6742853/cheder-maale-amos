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
        <thead><tr><th>שם משתמש</th><th>תפקיד</th><th>הרשאות</th><th>פעולות</th></tr></thead>
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
    const isAdmin = u['שם משתמש'] === 'admin';
    const actions = isAdmin ? '' :
      `<button class="btn btn-sm btn-outline-primary me-1" onclick="editUser('${u['שם משתמש']}')"><i class="bi bi-pencil"></i></button>
       <button class="btn btn-sm btn-outline-danger" onclick="deleteUser('${u['שם משתמש']}')"><i class="bi bi-trash"></i></button>`;
    return `<tr><td>${u['שם משתמש']||''}</td><td><span class="badge ${cls}">${role}</span></td><td>${permBadges}</td><td>${actions}</td></tr>`;
  }).join('');
}

async function editUser(username) {
  const data = getData();
  const u = data.users.find(x => x.username === username);
  if (!u) return;
  addUserModal();
  setTimeout(() => {
    document.getElementById('nu-name').value = u.username;
    document.getElementById('nu-name').readOnly = true;
    document.getElementById('nu-pass').value = u.password_hash || '';
    document.getElementById('nu-role').value = u.role || 'מורה';
    document.getElementById('nu-role').dispatchEvent(new Event('change'));
    // Permissions
    const perms = (u.permissions || '').split(',').map(s=>s.trim());
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = u.permissions === 'all' || perms.includes(a.key);
    });
    // Visible students
    const allStu = !u.visible_students || u.visible_students === 'all';
    document.getElementById('all-students').checked = allStu;
    document.getElementById('all-students').dispatchEvent(new Event('change'));
    if (!allStu) {
      const ids = u.visible_students.split(',').map(s=>s.trim());
      ids.forEach(id => {
        const cb = document.getElementById('stu-' + id);
        if (cb) cb.checked = true;
      });
    }
    // Visible categories
    const allCat = !u.visible_categories || u.visible_categories === 'all';
    document.getElementById('all-cats').checked = allCat;
    document.getElementById('all-cats').dispatchEvent(new Event('change'));
    if (!allCat) {
      const cats = u.visible_categories.split(',').map(s=>s.trim());
      cats.forEach(c => {
        const cb = document.getElementById('cat-' + c.replace(/\s/g,'_'));
        if (cb) cb.checked = true;
      });
    }
    document.getElementById('addUModal').dataset.editMode = '1';
    document.querySelector('#addUModal h5').textContent = 'עריכת משתמש: ' + username;
  }, 100);
}

async function deleteUser(username) {
  if (!confirm('בטוח למחוק את ' + username + '?')) return;
  await api('deleteUser', [username]);
  renderSettings();
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
  const data = getData();
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

  const studentOpts = data.students.map(s => `
    <div class="form-check">
      <input class="form-check-input student-cb" type="checkbox" value="${s['מזהה']}" id="stu-${s['מזהה']}">
      <label class="form-check-label" for="stu-${s['מזהה']}">${s['שם פרטי']||''} ${s['שם משפחה']||''} <small class="text-muted">(${s['מחזור']||''})</small></label>
    </div>`).join('');

  const catOpts = data.categories.map(c => `
    <div class="form-check">
      <input class="form-check-input cat-cb" type="checkbox" value="${c.name}" id="cat-${c.name.replace(/\s/g,'_')}">
      <label class="form-check-label" for="cat-${c.name.replace(/\s/g,'_')}">${c.name}</label>
    </div>`).join('');

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
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-shield-check"></i> מסכים שיוכל לראות:</h6>
          ${checkboxes}
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-people"></i> אילו תלמידים יוכל לראות?</h6>
          <div class="border rounded p-2 mb-2">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="all-students" checked>
              <label class="form-check-label fw-bold" for="all-students">כל התלמידים</label>
            </div>
            <div id="student-list" class="d-none" style="max-height:200px;overflow-y:auto">
              ${studentOpts || '<small class="text-muted">אין תלמידים</small>'}
            </div>
          </div>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-tag"></i> אילו קטגוריות התנהגות יוכל לראות?</h6>
          <div class="border rounded p-2">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="all-cats" checked>
              <label class="form-check-label fw-bold" for="all-cats">כל הקטגוריות</label>
            </div>
            <div id="cat-list" class="d-none">
              ${catOpts}
            </div>
          </div>
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

  function updatePerms(){
    const role = document.getElementById('nu-role').value;
    const defaults = ROLE_DEFAULTS[role] || [];
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = defaults.includes(a.key);
    });
  }
  document.getElementById('nu-role').addEventListener('change', updatePerms);
  updatePerms();

  // Toggle "all students" / individual list
  document.getElementById('all-students').addEventListener('change', e => {
    document.getElementById('student-list').classList.toggle('d-none', e.target.checked);
  });
  document.getElementById('all-cats').addEventListener('change', e => {
    document.getElementById('cat-list').classList.toggle('d-none', e.target.checked);
  });
}

async function saveUser() {
  const checked = Array.from(document.querySelectorAll('.perm-cb:checked')).map(c => c.value);
  const allStudents = document.getElementById('all-students').checked;
  const allCats = document.getElementById('all-cats').checked;
  const visibleStudents = allStudents ? 'all' :
    Array.from(document.querySelectorAll('.student-cb:checked')).map(c => c.value).join(',');
  const visibleCats = allCats ? 'all' :
    Array.from(document.querySelectorAll('.cat-cb:checked')).map(c => c.value).join(',');

  const obj = {
    'שם משתמש': document.getElementById('nu-name').value.trim(),
    'סיסמה': document.getElementById('nu-pass').value.trim(),
    'תפקיד': document.getElementById('nu-role').value,
    'הרשאות': checked.length === 4 ? 'all' : checked.join(','),
    'תלמידים_מורשים': visibleStudents,
    'קטגוריות_מורשות': visibleCats,
  };
  if (!obj['שם משתמש'] || !obj['סיסמה']) return alert('שם וסיסמה חובה');
  if (!checked.length) return alert('יש לסמן לפחות מסך אחד');
  if (!allStudents && !visibleStudents) return alert('יש לבחור לפחות תלמיד אחד או לסמן "כל התלמידים"');
  const editMode = document.getElementById('addUModal').dataset.editMode === '1';
  const r = editMode ? await api('updateUser', [obj]) : await api('addUser', [obj]);
  bootstrap.Modal.getInstance(document.getElementById('addUModal')).hide();
  renderSettings();
}

async function renderReports() {
  const data = getData();
  const cycles = [...new Set(data.students.map(s => s['מחזור']).filter(Boolean))];
  const cats = data.categories.map(c => c.name);
  const sevs = ['גבוהה','בינונית','נמוכה'];

  document.getElementById('page-reports').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <h3 class="mb-3"><i class="bi bi-file-earmark-bar-graph"></i> דוחות וסינון</h3>

    <div class="card p-3 mb-3">
      <h6><i class="bi bi-funnel"></i> סינון</h6>
      <div class="row g-2">
        <div class="col-md-3">
          <label class="form-label small">תלמיד</label>
          <select id="r-student" class="form-select form-select-sm">
            <option value="">כל התלמידים</option>
            ${data.students.map(s => `<option value="${s['מזהה']}">${s['שם פרטי']||''} ${s['שם משפחה']||''}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">מחזור</label>
          <select id="r-cycle" class="form-select form-select-sm">
            <option value="">כל המחזורים</option>
            ${cycles.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">קטגוריית התנהגות</label>
          <select id="r-cat" class="form-select form-select-sm">
            <option value="">כל הקטגוריות</option>
            ${cats.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">חומרה</label>
          <select id="r-sev" class="form-select form-select-sm">
            <option value="">כל החומרות</option>
            ${sevs.map(s => `<option value="${s}">${s}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">מתאריך</label>
          <input id="r-from" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-3">
          <label class="form-label small">עד תאריך</label>
          <input id="r-to" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-6 d-flex align-items-end gap-2">
          <button class="btn btn-primary btn-sm" onclick="applyReportFilters()"><i class="bi bi-search"></i> הצג דוח</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="resetReportFilters()"><i class="bi bi-arrow-counterclockwise"></i> איפוס</button>
          <button class="btn btn-outline-success btn-sm" onclick="exportFilteredCSV()"><i class="bi bi-file-earmark-spreadsheet"></i> CSV</button>
          <button class="btn btn-outline-danger btn-sm" onclick="printFiltered()"><i class="bi bi-printer"></i> הדפס</button>
        </div>
      </div>
    </div>

    <div id="report-results"></div>`;

  applyReportFilters();
}

let _filteredStudents = [], _filteredEvents = [];

function applyReportFilters() {
  const data = getData();
  const sId = document.getElementById('r-student').value;
  const cycle = document.getElementById('r-cycle').value;
  const cat = document.getElementById('r-cat').value;
  const sev = document.getElementById('r-sev').value;
  const from = document.getElementById('r-from').value;
  const to = document.getElementById('r-to').value;

  _filteredStudents = data.students.filter(s => {
    if (sId && String(s['מזהה']) !== sId) return false;
    if (cycle && s['מחזור'] !== cycle) return false;
    return true;
  });

  _filteredEvents = data.behavior.filter(e => {
    if (sId && String(e['תלמיד_מזהה']) !== sId) return false;
    if (cat && e['קטגוריה'] !== cat) return false;
    if (sev && e['חומרה'] !== sev) return false;
    const dt = new Date(e['תאריך']);
    if (from && dt < new Date(from)) return false;
    if (to && dt > new Date(to+'T23:59:59')) return false;
    if (cycle) {
      const stu = data.students.find(s => String(s['מזהה']) === String(e['תלמיד_מזהה']));
      if (!stu || stu['מחזור'] !== cycle) return false;
    }
    return true;
  });

  drawReportResults();
}

function drawReportResults() {
  const totalEvents = _filteredEvents.length;
  const high = _filteredEvents.filter(e => e['חומרה']==='גבוהה').length;
  const mid = _filteredEvents.filter(e => e['חומרה']==='בינונית').length;
  const low = _filteredEvents.filter(e => e['חומרה']==='נמוכה').length;

  let html = `
    <div class="row g-2 mb-3">
      <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-primary">${_filteredStudents.length}</div><div class="text-muted small">תלמידים</div></div></div>
      <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-info">${totalEvents}</div><div class="text-muted small">אירועים</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-danger">${high}</div><div class="text-muted small">גבוהה</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-warning">${mid}</div><div class="text-muted small">בינונית</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-success">${low}</div><div class="text-muted small">נמוכה</div></div></div>
    </div>`;

  if (_filteredStudents.length) {
    html += '<div class="card p-3 mb-3"><h6><i class="bi bi-people"></i> תלמידים</h6><table class="table table-sm"><thead><tr><th>שם</th><th>מחזור</th><th>טלפון אם</th><th>אירועים</th></tr></thead><tbody>';
    _filteredStudents.forEach(s => {
      const cnt = _filteredEvents.filter(e => String(e['תלמיד_מזהה']) === String(s['מזהה'])).length;
      html += `<tr><td><strong>${s['שם פרטי']||''} ${s['שם משפחה']||''}</strong></td><td>${s['מחזור']||''}</td><td>${s['טלפון אם']||''}</td><td><span class="badge bg-secondary">${cnt}</span></td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (_filteredEvents.length) {
    html += '<div class="card p-3"><h6><i class="bi bi-clipboard-check"></i> אירועי התנהגות</h6>';
    const sorted = [..._filteredEvents].sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
    sorted.forEach(e => {
      const sev = e['חומרה']==='גבוהה' ? 'severity-high' : e['חומרה']==='נמוכה' ? 'severity-low' : 'severity-mid';
      const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
      html += `<div class="card p-2 mb-2 ${sev}">
        <div class="d-flex justify-content-between"><div><span class="cat-badge">${e['קטגוריה']||''}</span><strong class="mx-2">${e['שם תלמיד']||''}</strong></div><small class="text-muted">${dt}</small></div>
        <p class="mb-0 mt-2">${e['תיאור']||''}</p>
      </div>`;
    });
    html += '</div>';
  }

  if (!_filteredStudents.length && !_filteredEvents.length) {
    html += '<div class="card p-5 text-center text-muted"><i class="bi bi-inbox fs-1"></i><p class="mt-2">אין נתונים בפילטר הנוכחי</p></div>';
  }

  document.getElementById('report-results').innerHTML = html;
}

function resetReportFilters() {
  ['r-student','r-cycle','r-cat','r-sev','r-from','r-to'].forEach(id => document.getElementById(id).value = '');
  applyReportFilters();
}

function exportFilteredCSV() {
  let csv = '﻿';  // BOM for Excel Hebrew
  csv += 'תלמידים\n';
  csv += 'מזהה,שם,גיל,מחזור,טלפון אם,טלפון אב\n';
  _filteredStudents.forEach(s => {
    csv += `${s['מזהה']||''},"${s['שם פרטי']||''} ${s['שם משפחה']||''}",${s['גיל']||''},${s['מחזור']||''},${s['טלפון אם']||''},${s['טלפון אב']||''}\n`;
  });
  csv += '\nאירועי התנהגות\n';
  csv += 'תאריך,תלמיד,קטגוריה,חומרה,תיאור\n';
  _filteredEvents.forEach(e => {
    const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
    csv += `${dt},"${e['שם תלמיד']||''}","${e['קטגוריה']||''}",${e['חומרה']||''},"${(e['תיאור']||'').replace(/"/g,'""')}"\n`;
  });
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cheder_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function printFiltered() {
  const today = new Date().toLocaleDateString('he-IL');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח חדר</title>
<style>
@page{size:A4;margin:1.5cm}
body{font-family:Arial,'Heebo',sans-serif;direction:rtl;color:#1f2937}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10pt}
th{background:#f3f4f6;padding:8px;border:1px solid #d1d5db;text-align:right}
td{padding:6px 8px;border:1px solid #e5e7eb}
.event{margin-bottom:8px;padding:8px;border-right:4px solid #0066cc;background:#f9fafb}
.event.high{border-color:#dc2626}.event.mid{border-color:#f59e0b}.event.low{border-color:#16a34a}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()" style="background:#0066cc;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin-bottom:20px">🖨 הדפס</button>
<h1>דוח חדר מעלה עמוס - ${today}</h1>
<p>תלמידים: ${_filteredStudents.length} · אירועים: ${_filteredEvents.length}</p>
${_filteredStudents.length ? `<h2>תלמידים</h2><table><tr><th>שם</th><th>גיל</th><th>מחזור</th><th>טלפון</th></tr>${_filteredStudents.map(s=>`<tr><td>${s['שם פרטי']||''} ${s['שם משפחה']||''}</td><td>${s['גיל']||''}</td><td>${s['מחזור']||''}</td><td>${s['טלפון אם']||''}</td></tr>`).join('')}</table>` : ''}
${_filteredEvents.length ? `<h2>אירועי התנהגות</h2>${_filteredEvents.map(e=>{const c=e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';return `<div class="event ${c}"><strong>${e['שם תלמיד']||''}</strong> · ${e['קטגוריה']||''} · ${new Date(e['תאריך']).toLocaleString('he-IL')}<br>${e['תיאור']||''}</div>`}).join('')}` : ''}
<script>setTimeout(()=>window.print(), 500);</script>
</body></html>`;
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
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
