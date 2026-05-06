// Students page
let _students = [];

async function renderStudents() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-people"></i> רשימת תלמידים</h3>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="addStudentModal()"><i class="bi bi-plus"></i> תלמיד חדש</button>
        <button class="btn btn-outline-success" onclick="importStudentsCSV()"><i class="bi bi-upload"></i> ייבוא CSV</button>
        <button class="btn btn-outline-info" onclick="exportStudentsCSV()"><i class="bi bi-download"></i> ייצוא CSV</button>
      </div>
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
    return `<tr style="cursor:pointer">
      <td onclick="viewStudent(${s['מזהה']})">${s['מזהה']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})"><span class="avatar">${initials}</span>${fullName}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['גיל']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['מחזור']||''}</td>
      <td onclick="viewStudent(${s['מזהה']})">${s['טלפון אם']||''}</td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" onclick="viewStudent(${s['מזהה']})" title="צפייה"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editStudent(${s['מזהה']})" title="עריכה"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStudent(${s['מזהה']})" title="מחיקה"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

async function viewStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const events = ((await api('listBehavior', [])).data || [])
    .filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const eventsHtml = events.length ? events.map(e => {
    const sev = e['חומרה'] === 'גבוהה' ? 'severity-high' : e['חומרה'] === 'נמוכה' ? 'severity-low' : 'severity-mid';
    const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleDateString('he-IL') : '';
    return `<div class="card p-2 mb-2 ${sev}">
      <div class="d-flex justify-content-between"><span class="cat-badge">${e['קטגוריה']||''}</span><small class="text-muted">${dt}</small></div>
      <p class="mb-0 mt-1 small">${e['תיאור']||''}</p>
    </div>`;
  }).join('') : '<p class="text-muted">אין אירועים מתועדים</p>';

  const html = `<div class="modal fade" id="viewStuModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-person"></i> ${fullName}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2 mb-3">
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${s['גיל']||'-'}</strong><div class="small text-muted">גיל</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${s['מחזור']||'-'}</strong><div class="small text-muted">מחזור</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.length}</strong><div class="small text-muted">אירועים</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.filter(e=>e['חומרה']==='גבוהה').length}</strong><div class="small text-muted">חומרה גבוהה</div></div></div>
      </div>
      <h6>פרטים אישיים</h6>
      <table class="table table-sm">
        <tr><td><strong>שם אם</strong></td><td>${s['שם אם']||'-'}</td><td><strong>טלפון אם</strong></td><td>${s['טלפון אם']||'-'}</td></tr>
        <tr><td><strong>שם אב</strong></td><td>${s['שם אב']||'-'}</td><td><strong>טלפון אב</strong></td><td>${s['טלפון אב']||'-'}</td></tr>
        <tr><td><strong>כתובת</strong></td><td colspan="3">${s['כתובת']||'-'}</td></tr>
        ${s['הערות'] ? `<tr><td><strong>הערות</strong></td><td colspan="3">${s['הערות']}</td></tr>` : ''}
      </table>
      <h6 class="mt-3">היסטוריית התנהגות (${events.length})</h6>
      ${eventsHtml}
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-info" onclick="emailParentSummary(${id})"><i class="bi bi-envelope"></i> שלח להורים</button>
      <button class="btn btn-outline-success" onclick="printStudentReport(${id})"><i class="bi bi-printer"></i> הדפס</button>
      <button class="btn btn-outline-primary" onclick="bootstrap.Modal.getInstance(document.getElementById('viewStuModal')).hide(); editStudent(${id})"><i class="bi bi-pencil"></i> ערוך</button>
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('viewStuModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('viewStuModal')).show();
}

function editStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  addStudentModal();
  setTimeout(() => {
    document.getElementById('ns-fname').value = s['שם פרטי']||'';
    document.getElementById('ns-lname').value = s['שם משפחה']||'';
    document.getElementById('ns-age').value = s['גיל']||'';
    document.getElementById('ns-cycle').value = s['מחזור']||'';
    document.getElementById('ns-mname').value = s['שם אם']||'';
    document.getElementById('ns-mphone').value = s['טלפון אם']||'';
    document.getElementById('ns-fname2').value = s['שם אב']||'';
    document.getElementById('ns-fphone').value = s['טלפון אב']||'';
    document.getElementById('ns-addr').value = s['כתובת']||'';
    // Mark as edit mode
    document.getElementById('addStudentModal').dataset.editId = id;
    document.querySelector('#addStudentModal .modal-title').textContent = 'עריכת תלמיד';
  }, 100);
}

async function deleteStudent(id) {
  if (!confirm('בטוח למחוק את התלמיד?')) return;
  await api('deleteStudent', [id]);
  renderStudents();
  loadStats();
}

async function emailParentSummary(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const events = ((await api('listBehavior', [])).data || [])
    .filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const motherEmail = prompt('מייל ההורה:', s['טלפון אם'] || '');
  if (!motherEmail) return;
  const subject = `סיכום התנהגות — ${fullName}`;
  const lines = [`שלום,`, ``, `הנה סיכום עדכני של ${fullName}:`, ``];
  lines.push(`גיל: ${s['גיל']||'-'} | מחזור: ${s['מחזור']||'-'}`);
  lines.push(`סך כל אירועים: ${events.length} | חומרה גבוהה: ${events.filter(e=>e['חומרה']==='גבוהה').length}`);
  lines.push(``);
  if (events.length) {
    lines.push('אירועים אחרונים:');
    events.slice(0, 10).forEach(e => {
      const dt = new Date(e['תאריך']).toLocaleDateString('he-IL');
      lines.push(`- ${dt} | ${e['קטגוריה']||''} (${e['חומרה']||'-'}): ${e['תיאור']||''}`);
    });
  }
  lines.push(``, 'בברכה,', 'בית התלמוד · בית שמש');
  const body = lines.join('\n');
  const mailto = `mailto:${motherEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function exportStudentsCSV() {
  let csv = '﻿';  // BOM
  csv += 'מזהה,שם פרטי,שם משפחה,גיל,מחזור,שם אם,טלפון אם,שם אב,טלפון אב,כתובת,הערות\n';
  _students.forEach(s => {
    const fields = ['מזהה','שם פרטי','שם משפחה','גיל','מחזור','שם אם','טלפון אם','שם אב','טלפון אב','כתובת','הערות'];
    csv += fields.map(f => `"${(s[f]||'').toString().replace(/"/g,'""')}"`).join(',') + '\n';
  });
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `תלמידים_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function importStudentsCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.txt';
  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.replace(/^﻿/,'').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return alert('הקובץ ריק או לא תקין');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g,''));
    let added = 0;
    let maxId = _students.reduce((m,s) => Math.max(m, parseInt(s['מזהה'])||0), 0);
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h,j) => obj[h] = values[j] || '');
      if (!obj['שם פרטי'] && !obj['שם משפחה']) continue;
      if (!obj['מזהה']) {
        maxId += 1;
        obj['מזהה'] = maxId;
      }
      const r = await api('addStudent', [obj]);
      if (r.ok) added++;
    }
    alert(`יובאו ${added} תלמידים`);
    renderStudents();
    loadStats();
  };
  input.click();
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function printStudentReport(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  // Open print view
  const w = window.open('', '_blank');
  Promise.resolve(api('listBehavior', [])).then(b => {
    const events = (b.data || []).filter(e => String(e['תלמיד_מזהה']) === String(id))
      .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
    const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    const today = new Date().toLocaleDateString('he-IL');
    const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${fullName}</title>
<style>
@page{size:A4;margin:1.5cm}body{font-family:Arial,sans-serif;direction:rtl;color:#1f2937}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:8pt}
table{width:100%;border-collapse:collapse;margin:10pt 0;font-size:10pt}
th{background:#f3f4f6;padding:6pt;border:1px solid #d1d5db;text-align:right}
td{padding:5pt;border:1px solid #e5e7eb}
.event{margin:6pt 0;padding:8pt;border-right:4px solid #0066cc;background:#f9fafb}
.event.high{border-color:#dc2626;background:#fef2f2}.event.mid{border-color:#f59e0b;background:#fffbeb}.event.low{border-color:#16a34a;background:#f0fdf4}
@media print{.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="background:#0066cc;color:#fff;border:none;padding:10pt 20pt;border-radius:6px;cursor:pointer">🖨 הדפס</button>
<h1>${fullName}</h1>
<p>בית התלמוד · בית שמש · ${today}</p>
<table>
<tr><th>גיל</th><td>${s['גיל']||'-'}</td><th>מחזור</th><td>${s['מחזור']||'-'}</td></tr>
<tr><th>שם אם</th><td>${s['שם אם']||'-'}</td><th>טלפון אם</th><td>${s['טלפון אם']||'-'}</td></tr>
<tr><th>שם אב</th><td>${s['שם אב']||'-'}</td><th>טלפון אב</th><td>${s['טלפון אב']||'-'}</td></tr>
<tr><th>כתובת</th><td colspan="3">${s['כתובת']||'-'}</td></tr>
</table>
<h2>היסטוריית התנהגות (${events.length})</h2>
${events.map(e => {
  const c = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
  return `<div class="event ${c}"><strong>${e['קטגוריה']||''}</strong> · ${new Date(e['תאריך']).toLocaleString('he-IL')} · חומרה ${e['חומרה']||''}<br>${e['תיאור']||''}</div>`;
}).join('')}
<script>setTimeout(()=>window.print(), 500);</script>
</body></html>`;
    w.document.write(html);
    w.document.close();
  });
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
  const editId = document.getElementById('addStudentModal').dataset.editId;
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    await api('updateStudent', [obj]);
  } else {
    await api('addStudent', [obj]);
  }
  bootstrap.Modal.getInstance(document.getElementById('addStudentModal')).hide();
  renderStudents();
  loadStats();
}
