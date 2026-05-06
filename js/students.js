// Students page
let _students = [];

async function renderStudents() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-people"></i> רשימת תלמידים</h3>
      <button class="btn btn-primary" onclick="addStudentModal()"><i class="bi bi-plus"></i> תלמיד חדש</button>
    </div>
    <div class="card p-3">
      <input id="s-search" class="form-control mb-3" placeholder="חיפוש תלמיד...">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr><th>מזהה</th><th>שם מלא</th><th>גיל</th><th>מחזור</th><th>טלפון אם</th></tr>
          </thead>
          <tbody id="students-tbody"></tbody>
        </table>
      </div>
      <div id="s-empty" class="text-center py-5 d-none text-muted"><i class="bi bi-people fs-1"></i><p>אין תלמידים</p></div>
    </div>`;
  document.getElementById('page-students').innerHTML = html;

  const r = await api('listStudents', []);
  _students = r.data || [];
  drawStudents(_students);

  document.getElementById('s-search').oninput = e => {
    const q = e.target.value.toLowerCase();
    if (!q) return drawStudents(_students);
    drawStudents(_students.filter(s =>
      Object.values(s).some(v => String(v).toLowerCase().includes(q))));
  };
}

function drawStudents(list) {
  const tbody = document.getElementById('students-tbody');
  if (!list.length) {
    tbody.innerHTML = '';
    document.getElementById('s-empty').classList.remove('d-none');
    return;
  }
  document.getElementById('s-empty').classList.add('d-none');
  tbody.innerHTML = list.map(s => {
    const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    const initials = fullName.trim().split(' ').map(w=>w[0]||'').join('').slice(0,2);
    return `<tr>
      <td>${s['מזהה']||''}</td>
      <td><span class="avatar">${initials}</span>${fullName}</td>
      <td>${s['גיל']||''}</td>
      <td>${s['מחזור']||''}</td>
      <td>${s['טלפון אם']||''}</td>
    </tr>`;
  }).join('');
}

function addStudentModal() {
  const html = `
    <div class="modal fade" id="addStudentModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5>תלמיד חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small">שם פרטי</label><input id="ns-fname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם משפחה</label><input id="ns-lname" class="form-control"></div>
              <div class="col-4"><label class="form-label small">גיל</label><input id="ns-age" type="number" class="form-control"></div>
              <div class="col-8"><label class="form-label small">מחזור</label><input id="ns-cycle" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם אם</label><input id="ns-mname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אם</label><input id="ns-mphone" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם אב</label><input id="ns-fname2" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אב</label><input id="ns-fphone" class="form-control"></div>
              <div class="col-12"><label class="form-label small">כתובת</label><input id="ns-addr" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
            <button class="btn btn-primary" onclick="saveStudent()">שמור</button>
          </div>
        </div>
      </div>
    </div>`;
  const old = document.getElementById('addStudentModal');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addStudentModal')).show();
}

async function saveStudent() {
  const obj = {
    'שם פרטי': document.getElementById('ns-fname').value,
    'שם משפחה': document.getElementById('ns-lname').value,
    'גיל': document.getElementById('ns-age').value,
    'מחזור': document.getElementById('ns-cycle').value,
    'שם אם': document.getElementById('ns-mname').value,
    'טלפון אם': document.getElementById('ns-mphone').value,
    'שם אב': document.getElementById('ns-fname2').value,
    'טלפון אב': document.getElementById('ns-fphone').value,
    'כתובת': document.getElementById('ns-addr').value,
  };
  if (!obj['שם פרטי']) return alert('שם פרטי חובה');
  // Auto ID
  const all = (await api('listStudents', [])).data || [];
  obj['מזהה'] = all.reduce((m,s) => Math.max(m, parseInt(s['מזהה']) || 0), 0) + 1;
  const r = await api('addStudent', [obj]);
  if (r.ok) {
    bootstrap.Modal.getInstance(document.getElementById('addStudentModal')).hide();
    renderStudents();
    loadStats();
  } else {
    // Fallback: save locally
    localAppend('listStudents', obj);
    bootstrap.Modal.getInstance(document.getElementById('addStudentModal')).hide();
    renderStudents();
  }
}
