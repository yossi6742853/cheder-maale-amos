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
  tbody.innerHTML = users.map(u => {
    const role = u['תפקיד']||'';
    const cls = role === 'מנהל' ? 'role-admin' : role === 'רב' ? 'role-rabbi' : 'role-readonly';
    return `<tr><td>${u['שם משתמש']||''}</td><td><span class="badge ${cls}">${role}</span></td><td><code>${u['הרשאות']||''}</code></td></tr>`;
  }).join('');
}

function addUserModal() {
  const html = `<div class="modal fade" id="addUModal"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>משתמש חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">שם משתמש</label><input id="nu-name" class="form-control"></div>
      <div class="mb-3"><label class="form-label">סיסמה</label><input id="nu-pass" class="form-control"></div>
      <div class="mb-3"><label class="form-label">תפקיד</label><select id="nu-role" class="form-select"><option>מנהל</option><option>רב</option><option>קריאה בלבד</option></select></div>
      <div class="mb-3"><label class="form-label">הרשאות</label><input id="nu-perm" class="form-control" value="students,behavior"></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button><button class="btn btn-primary" onclick="saveUser()">שמור</button></div>
  </div></div></div>`;
  const old = document.getElementById('addUModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addUModal')).show();
}

async function saveUser() {
  const obj = {
    'שם משתמש': document.getElementById('nu-name').value,
    'סיסמה': document.getElementById('nu-pass').value,
    'תפקיד': document.getElementById('nu-role').value,
    'הרשאות': document.getElementById('nu-perm').value,
  };
  if (!obj['שם משתמש'] || !obj['סיסמה']) return alert('שם וסיסמה חובה');
  const r = await api('addUser', [obj]);
  bootstrap.Modal.getInstance(document.getElementById('addUModal')).hide();
  renderSettings();
}

async function renderReports() {
  document.getElementById('page-reports').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <h3 class="mb-3"><i class="bi bi-file-earmark-pdf"></i> דוחות</h3>
    <div class="row g-3">
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-people fs-1 text-primary"></i>
        <h5>רשימת תלמידים</h5>
        <button class="btn btn-outline-primary" onclick="downloadReport('students')">הורד PDF</button>
      </div></div>
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-clipboard fs-1 text-success"></i>
        <h5>מעקב התנהגות</h5>
        <button class="btn btn-outline-success" onclick="downloadReport('behavior')">הורד PDF</button>
      </div></div>
      <div class="col-md-4"><div class="card p-3 text-center">
        <i class="bi bi-file fs-1 text-info"></i>
        <h5>דוח מלא</h5>
        <button class="btn btn-outline-info" onclick="downloadReport('all')">הורד PDF</button>
      </div></div>
    </div>`;
}

async function downloadReport(type) {
  const r = await api('exportPDF', [type]);
  if (r.ok && r.data && r.data.url) window.open(r.data.url, '_blank');
  else alert('שגיאה: ' + (r.error || 'לא ניתן ליצור דוח'));
}
