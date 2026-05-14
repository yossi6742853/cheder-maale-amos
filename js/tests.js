// Tests page (מבחנים)
let _testsData = [];
let _testsStudents = [];

async function renderTests() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-pencil-square"></i> מבחנים</h3>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="testAddModal()"><i class="bi bi-plus"></i> ציון חדש</button>
        <button class="btn btn-outline-info" onclick="testExportCSV()"><i class="bi bi-download"></i> ייצוא CSV</button>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-1">סוג מבחן</label>
          <select id="t-type" class="form-select form-select-sm"><option value="">הכל</option></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">פרשה</label>
          <select id="t-parsha" class="form-select form-select-sm"><option value="">הכל</option></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">תלמיד</label>
          <select id="t-student" class="form-select form-select-sm"><option value="">הכל</option></select>
        </div>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <h6><i class="bi bi-graph-up"></i> ממוצעי מבחנים — לפי תלמיד</h6>
      <canvas id="t-chart" style="max-height:280px"></canvas>
    </div>

    <div class="card p-3">
      <h6>פירוט ציונים</h6>
      <div class="table-responsive" style="max-height:520px;overflow-y:auto">
        <table class="table table-sm table-hover">
          <thead class="sticky-top bg-white"><tr><th>תלמיד</th><th>סוג</th><th>פרשה</th><th>ציון</th><th>תאריך</th><th></th></tr></thead>
          <tbody id="t-tbody"></tbody>
        </table>
      </div>
      <div id="t-empty" class="text-center py-3 text-muted d-none">
        <i class="bi bi-inbox fs-1"></i>
        <p class="mb-0">אין ציונים</p>
      </div>
    </div>`;
  document.getElementById('page-tests').innerHTML = html;

  const [sR, tR] = await Promise.all([api('listStudents', []), api('listTests', [])]);
  _testsStudents = (sR.data || []).filter(s => (s['סטטוס']||'פעיל') !== 'סיים');
  _testsData = tR.data || [];

  const types = [...new Set(_testsData.map(t => t['סוג']).filter(Boolean))];
  document.getElementById('t-type').innerHTML = '<option value="">הכל</option>' +
    types.map(x => `<option>${escHtml(x)}</option>`).join('');

  const parshot = [...new Set(_testsData.map(t => t['פרשה']).filter(Boolean))];
  document.getElementById('t-parsha').innerHTML = '<option value="">הכל</option>' +
    parshot.map(x => `<option>${escHtml(x)}</option>`).join('');

  const sortedStu = _testsStudents.slice().sort((a,b) =>
    String(a['מחזור']).localeCompare(String(b['מחזור'])) ||
    (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  document.getElementById('t-student').innerHTML = '<option value="">הכל</option>' +
    sortedStu.map(s => `<option value="${s['מזהה']}">${escHtml((s['מחזור']||'')+' · '+(s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('');

  ['t-type','t-parsha','t-student'].forEach(id => document.getElementById(id).onchange = testsRefresh);
  testsRefresh();
}

function testsRefresh() {
  const type = document.getElementById('t-type').value;
  const parsha = document.getElementById('t-parsha').value;
  const sid = document.getElementById('t-student').value;
  let list = _testsData;
  if (type) list = list.filter(t => t['סוג'] === type);
  if (parsha) list = list.filter(t => t['פרשה'] === parsha);
  if (sid) list = list.filter(t => String(t['תלמיד_מזהה']) === sid);
  drawTestsTable(list);
  drawTestsChart(list);
}

function drawTestsTable(list) {
  const tbody = document.getElementById('t-tbody');
  document.getElementById('t-empty').classList.toggle('d-none', list.length > 0);
  if (!list.length) { tbody.innerHTML = ''; return; }
  const stuById = {};
  _testsStudents.forEach(s => stuById[s['מזהה']] = s);
  tbody.innerHTML = list.slice(0, 500).map(t => {
    const stu = stuById[t['תלמיד_מזהה']];
    const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '?';
    const score = parseFloat(t['ציון']) || 0;
    const color = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger';
    return `<tr>
      <td>${escHtml(stuName)}</td>
      <td><span class="badge bg-light text-dark">${escHtml(t['סוג']||'')}</span></td>
      <td>${escHtml(t['פרשה']||'')}</td>
      <td><span class="badge bg-${color}">${score}</span></td>
      <td class="small text-muted">${escHtml(t['תאריך']||'')}</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="testDelete(${t['מזהה']})"><i class="bi bi-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function drawTestsChart(list) {
  const el = document.getElementById('t-chart');
  if (!el || typeof Chart === 'undefined') return;
  const stuById = {};
  _testsStudents.forEach(s => stuById[s['מזהה']] = s);
  const byStu = {};
  list.forEach(t => {
    const sid = t['תלמיד_מזהה'];
    if (!byStu[sid]) byStu[sid] = { sum: 0, n: 0 };
    byStu[sid].sum += parseFloat(t['ציון']) || 0;
    byStu[sid].n += 1;
  });
  const arr = Object.keys(byStu).map(sid => {
    const stu = stuById[sid];
    return {
      name: stu ? `${stu['שם משפחה']||''} ${stu['שם פרטי']||''}`.trim() : sid,
      avg: byStu[sid].sum / byStu[sid].n,
      n: byStu[sid].n,
    };
  }).sort((a,b) => b.avg - a.avg);
  if (window._testsChart) window._testsChart.destroy();
  if (!arr.length) return;
  window._testsChart = new Chart(el, {
    type: 'bar',
    data: {
      labels: arr.map(a => a.name),
      datasets: [{ label: 'ממוצע', data: arr.map(a => a.avg), backgroundColor: arr.map(a => a.avg >= 85 ? '#16a34a' : a.avg >= 70 ? '#f59e0b' : '#dc2626') }]
    },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { min: 0, max: 100 } } }
  });
}

function testAddModal() {
  const types = [...new Set(_testsData.map(t => t['סוג']).filter(Boolean))];
  const sortedStu = _testsStudents.slice().sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const html = `<div class="modal fade" id="t-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">ציון מבחן חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">תלמיד</label>
        <select id="ta-student" class="form-select">${sortedStu.map(s => `<option value="${s['מזהה']}">${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('')}</select>
      </div>
      <div class="mb-2"><label class="form-label">סוג מבחן</label>
        <input list="ta-types" id="ta-type" class="form-control">
        <datalist id="ta-types">${types.map(x => `<option value="${escHtml(x)}">`).join('')}</datalist>
      </div>
      <div class="mb-2"><label class="form-label">פרשה</label><input id="ta-parsha" class="form-control"></div>
      <div class="mb-2"><label class="form-label">ציון</label><input id="ta-score" type="number" min="0" max="100" class="form-control"></div>
      <div class="mb-2"><label class="form-label">תאריך</label><input id="ta-date" type="date" class="form-control"></div>
      <div class="mb-2"><label class="form-label">הערות</label><textarea id="ta-notes" class="form-control" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="testSave()">שמור</button>
    </div></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const m = new bootstrap.Modal(document.getElementById('t-modal'));
  m.show();
  document.getElementById('t-modal').addEventListener('hidden.bs.modal', e => e.target.remove());
}

async function testSave() {
  const obj = {
    'תלמיד_מזהה': parseInt(document.getElementById('ta-student').value),
    'סוג': document.getElementById('ta-type').value.trim(),
    'פרשה': document.getElementById('ta-parsha').value.trim(),
    'ציון': Math.max(0, Math.min(100, parseFloat(document.getElementById('ta-score').value) || 0)),
    'תאריך': document.getElementById('ta-date').value,
    'הערות': document.getElementById('ta-notes').value.trim(),
  };
  if (!obj['תלמיד_מזהה'] || !obj['סוג']) return alert('תלמיד וסוג חובה');
  const r = await api('addTest', [obj]);
  if (r.ok) {
    hideModal('t-modal');
    notify('ציון נוסף', 'success');
    renderTests();
  } else alert(r.error || 'שגיאה');
}

async function testDelete(id) {
  if (!confirm('למחוק את הציון?')) return;
  const r = await api('deleteTest', [id]);
  if (r.ok) { notify('נמחק', 'success'); renderTests(); } else alert(r.error || 'שגיאה במחיקה');
}

function testExportCSV() {
  if (!_testsData.length) return alert('אין נתונים');
  const stuById = {};
  _testsStudents.forEach(s => stuById[s['מזהה']] = s);
  const cols = ['תלמיד','סוג','פרשה','ציון','תאריך','הערות'];
  const csv = ['﻿' + cols.join(',')];
  _testsData.forEach(t => {
    const stu = stuById[t['תלמיד_מזהה']];
    const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
    const vals = [name, t['סוג']||'', t['פרשה']||'', t['ציון']||'', t['תאריך']||'', t['הערות']||''];
    csv.push(vals.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'מבחנים.csv';
  a.click();
}
