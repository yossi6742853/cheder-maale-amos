// Functioning scores page (תפקוד)
let _funcEntries = [];
let _funcStudents = [];
let _funcSelected = null;

async function renderFunctioning() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-bar-chart-line"></i> ציוני תפקוד</h3>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="funcAddModal()"><i class="bi bi-plus"></i> ציון חדש</button>
        <button class="btn btn-outline-info" onclick="funcExportCSV()"><i class="bi bi-download"></i> ייצוא CSV</button>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <div class="row g-2">
        <div class="col-md-4">
          <label class="form-label small mb-1">תלמיד</label>
          <select id="func-student" class="form-select form-select-sm"></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">קטגוריה</label>
          <select id="func-cat" class="form-select form-select-sm"><option value="">הכל</option></select>
        </div>
        <div class="col-md-4">
          <label class="form-label small mb-1">תקופה</label>
          <select id="func-period" class="form-select form-select-sm"><option value="">הכל</option></select>
        </div>
      </div>
    </div>

    <div class="row">
      <div class="col-lg-5">
        <div class="card p-3 mb-3">
          <h6><i class="bi bi-graph-up"></i> ממוצע לפי קטגוריה</h6>
          <canvas id="func-radar" style="max-height:300px"></canvas>
        </div>
        <div class="card p-3 mb-3">
          <h6>סיכום</h6>
          <div id="func-summary"></div>
        </div>
      </div>
      <div class="col-lg-7">
        <div class="card p-3">
          <h6>ציונים מפורטים</h6>
          <div id="func-empty" class="text-center py-4 text-muted d-none">
            <i class="bi bi-inbox fs-1"></i>
            <p class="mb-0">אין ציונים לתלמיד זה</p>
          </div>
          <div class="table-responsive" style="max-height:560px;overflow-y:auto">
            <table class="table table-sm table-hover">
              <thead class="sticky-top bg-white"><tr><th>קטגוריה</th><th>פרמטר</th><th>ציון</th><th>תקופה</th><th></th></tr></thead>
              <tbody id="func-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;
  document.getElementById('page-functioning').innerHTML = html;

  const [sR, fR] = await Promise.all([api('listStudents', []), api('listFunctioning', [])]);
  _funcStudents = (sR.data || []).filter(s => (s['סטטוס']||'פעיל') !== 'סיים').sort((a,b) =>
    String(a['מחזור']).localeCompare(String(b['מחזור'])) ||
    (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  _funcEntries = fR.data || [];

  const sel = document.getElementById('func-student');
  sel.innerHTML = _funcStudents.map(s =>
    `<option value="${s['מזהה']}">${escHtml((s['מחזור']||'')+' · '+(s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('');

  const cats = [...new Set(_funcEntries.map(e => e['קטגוריה']).filter(Boolean))];
  document.getElementById('func-cat').innerHTML = '<option value="">הכל</option>' +
    cats.map(c => `<option>${escHtml(c)}</option>`).join('');

  const periods = [...new Set(_funcEntries.map(e => e['תקופה']).filter(Boolean))];
  document.getElementById('func-period').innerHTML = '<option value="">הכל</option>' +
    periods.map(p => `<option>${escHtml(p)}</option>`).join('');

  if (_funcStudents.length) {
    _funcSelected = _funcStudents[0]['מזהה'];
    sel.value = _funcSelected;
  }
  sel.onchange = () => { _funcSelected = sel.value; funcRefresh(); };
  document.getElementById('func-cat').onchange = funcRefresh;
  document.getElementById('func-period').onchange = funcRefresh;
  funcRefresh();
}

function funcRefresh() {
  const sid = String(_funcSelected || document.getElementById('func-student').value);
  const cat = document.getElementById('func-cat').value;
  const period = document.getElementById('func-period').value;
  let list = _funcEntries.filter(e => String(e['תלמיד_מזהה']) === sid);
  if (cat) list = list.filter(e => e['קטגוריה'] === cat);
  if (period) list = list.filter(e => e['תקופה'] === period);
  drawFuncTable(list);
  drawFuncRadar(_funcEntries.filter(e => String(e['תלמיד_מזהה']) === sid && (!period || e['תקופה'] === period)));
  drawFuncSummary(list);
}

function drawFuncTable(list) {
  const tbody = document.getElementById('func-tbody');
  document.getElementById('func-empty').classList.toggle('d-none', list.length > 0);
  if (!list.length) { tbody.innerHTML = ''; return; }
  tbody.innerHTML = list.map(e => {
    const score = parseFloat(e['ציון']) || 0;
    const color = score >= 4 ? 'success' : score >= 3 ? 'warning' : 'danger';
    return `<tr>
      <td><span class="text-muted small">${escHtml(e['קטגוריה']||'')}</span><br>${escHtml(e['תת_קטגוריה']||'')}</td>
      <td>${escHtml(e['פרמטר']||'')}</td>
      <td><span class="badge bg-${color}">${score}</span></td>
      <td class="small text-muted">${escHtml(e['תקופה']||'')}</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="funcDelete(${e['מזהה']})"><i class="bi bi-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function drawFuncRadar(list) {
  const el = document.getElementById('func-radar');
  if (!el || typeof Chart === 'undefined') return;
  const byCat = {};
  list.forEach(e => {
    const c = e['קטגוריה'] || 'אחר';
    if (!byCat[c]) byCat[c] = { sum: 0, n: 0 };
    byCat[c].sum += parseFloat(e['ציון']) || 0;
    byCat[c].n += 1;
  });
  const cats = Object.keys(byCat);
  const avgs = cats.map(c => byCat[c].sum / byCat[c].n);
  if (window._funcChart) window._funcChart.destroy();
  if (!cats.length) return;
  window._funcChart = new Chart(el, {
    type: 'radar',
    data: { labels: cats, datasets: [{ label: 'ממוצע', data: avgs, backgroundColor: 'rgba(0,102,204,0.2)', borderColor: '#0066cc', pointBackgroundColor: '#0066cc' }] },
    options: { scales: { r: { min: 0, max: 5, ticks: { stepSize: 1 } } }, plugins: { legend: { display: false } } }
  });
}

function drawFuncSummary(list) {
  const el = document.getElementById('func-summary');
  if (!list.length) { el.innerHTML = '<p class="text-muted small mb-0">אין נתונים</p>'; return; }
  const scores = list.map(e => parseFloat(e['ציון']) || 0);
  const avg = scores.reduce((a,b)=>a+b, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  el.innerHTML = `
    <div class="row text-center">
      <div class="col-4"><div class="display-6 text-primary">${avg.toFixed(2)}</div><div class="small text-muted">ממוצע</div></div>
      <div class="col-4"><div class="display-6 text-success">${max}</div><div class="small text-muted">גבוה</div></div>
      <div class="col-4"><div class="display-6 text-danger">${min}</div><div class="small text-muted">נמוך</div></div>
    </div>
    <hr>
    <div class="small text-muted">${list.length} ציונים נמדדו</div>`;
}

function funcAddModal() {
  const sid = _funcSelected;
  if (!sid) return alert('בחר תלמיד');
  const student = _funcStudents.find(s => String(s['מזהה']) === String(sid));
  if (!student) return alert('התלמיד לא זמין יותר — רענן את הדף');  // Bug #40 fix
  const cats = [...new Set(_funcEntries.map(e => e['קטגוריה']).filter(Boolean))];
  const html = `<div class="modal fade" id="func-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">ציון תפקוד חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="text-muted small">${escHtml((student['שם פרטי']||'')+' '+(student['שם משפחה']||''))}</p>
      <div class="mb-2"><label class="form-label">קטגוריה</label>
        <input list="cat-options" id="fa-cat" class="form-control">
        <datalist id="cat-options">${cats.map(c => `<option value="${escHtml(c)}">`).join('')}</datalist>
      </div>
      <div class="mb-2"><label class="form-label">תת קטגוריה</label><input id="fa-sub" class="form-control"></div>
      <div class="mb-2"><label class="form-label">פרמטר</label><input id="fa-param" class="form-control"></div>
      <div class="mb-2"><label class="form-label">ציון (1-5)</label><input id="fa-score" type="number" min="1" max="5" step="0.5" class="form-control"></div>
      <div class="mb-2"><label class="form-label">תקופה</label><input id="fa-period" class="form-control" value="חשוון תשפו"></div>
      <div class="mb-2"><label class="form-label">הערות</label><textarea id="fa-notes" class="form-control" rows="2"></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="funcSave()">שמור</button>
    </div></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const m = new bootstrap.Modal(document.getElementById('func-modal'));
  m.show();
  document.getElementById('func-modal').addEventListener('hidden.bs.modal', e => e.target.remove());
}

async function funcSave() {
  const obj = {
    'תלמיד_מזהה': _funcSelected,
    'קטגוריה': document.getElementById('fa-cat').value.trim(),
    'תת_קטגוריה': document.getElementById('fa-sub').value.trim(),
    'פרמטר': document.getElementById('fa-param').value.trim(),
    'ציון': Math.max(0, Math.min(5, parseFloat(document.getElementById('fa-score').value) || 0)),
    'תקופה': document.getElementById('fa-period').value.trim(),
    'תאריך': new Date().toISOString().slice(0,10),
    'הערות': document.getElementById('fa-notes').value.trim(),
  };
  if (!obj['פרמטר'] || !obj['ציון']) return alert('פרמטר וציון חובה');
  const r = await api('addFunctioning', [obj]);
  if (r.ok) {
    hideModal('func-modal');
    notify('ציון נוסף', 'success');
    renderFunctioning();
  } else {
    alert(r.error || 'שגיאה');
  }
}

async function funcDelete(id) {
  if (!confirm('למחוק את הציון?')) return;
  const r = await api('deleteFunctioning', [id]);
  if (r.ok) { notify('נמחק', 'success'); renderFunctioning(); } else alert(r.error || 'שגיאה במחיקה');
}

function funcExportCSV() {
  const sid = String(_funcSelected);
  const list = _funcEntries.filter(e => String(e['תלמיד_מזהה']) === sid);
  if (!list.length) return alert('אין נתונים לייצוא');
  const cols = ['קטגוריה','תת_קטגוריה','פרמטר','ציון','תקופה','תאריך','הערות'];
  const csv = ['﻿' + cols.join(',')];
  list.forEach(e => csv.push(cols.map(c => `"${(e[c]||'').toString().replace(/"/g,'""')}"`).join(',')));
  const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const student = _funcStudents.find(s => String(s['מזהה']) === sid);
  a.download = `תפקוד_${student ? (student['שם משפחה']||'') : sid}.csv`;
  a.click();
}
