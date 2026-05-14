// Class view — show all students in a class with KPIs
let _cvSelected = '';

async function renderClassView() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-grid-3x3-gap"></i> תצוגת כיתה</h3>
      <select id="cv-class" class="form-select w-auto"></select>
    </div>
    <div id="cv-stats" class="row g-2 mb-3"></div>
    <div id="cv-grid" class="row g-3"></div>`;
  document.getElementById('page-classview').innerHTML = html;

  const data = getVisibleData();
  const classes = (data.classes || []).slice().sort((a,b) => parseInt(a['סדר']) - parseInt(b['סדר']));
  const sel = document.getElementById('cv-class');
  sel.innerHTML = classes.map(c => `<option value="${escHtml(c['שם'])}">כיתה ${escHtml(c['שם'])}</option>`).join('');
  if (!_cvSelected && classes.length) _cvSelected = classes[0]['שם'];
  sel.value = _cvSelected;
  sel.onchange = () => { _cvSelected = sel.value; refreshClassView(); };
  refreshClassView();
}

function refreshClassView() {
  const data = getVisibleData();
  const cls = _cvSelected;
  const students = (data.students || []).filter(s => s['מחזור'] === cls && (s['סטטוס']||'פעיל') !== 'סיים');
  const events = data.behavior || [];
  const funcs = data.functioning || [];
  const tests = data.tests || [];
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;

  const stats = document.getElementById('cv-stats');
  const totalEvents = events.filter(e => students.some(s => String(s['מזהה']) === String(e['תלמיד_מזהה']))).length;
  const weekEvents = events.filter(e => students.some(s => String(s['מזהה']) === String(e['תלמיד_מזהה'])) && dateMs(e['תאריך']) > weekAgo).length;
  const stuFunc = funcs.filter(f => students.some(s => String(s['מזהה']) === String(f['תלמיד_מזהה'])));
  const funcAvg = stuFunc.length ? (stuFunc.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / stuFunc.length).toFixed(2) : '-';
  const stuTests = tests.filter(t => students.some(s => String(s['מזהה']) === String(t['תלמיד_מזהה'])));
  const testsAvg = stuTests.length ? (stuTests.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / stuTests.length).toFixed(1) : '-';

  stats.innerHTML = `
    <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-primary">${students.length}</div><div class="small text-muted">תלמידים</div></div></div>
    <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-info">${totalEvents}</div><div class="small text-muted">אירועים</div></div></div>
    <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-warning">${weekEvents}</div><div class="small text-muted">השבוע</div></div></div>
    <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-success">${funcAvg}</div><div class="small text-muted">ממוצע תפקוד</div></div></div>
  `;

  const grid = document.getElementById('cv-grid');
  if (!students.length) {
    grid.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-people fs-1"></i><p>אין תלמידים בכיתה זו</p></div>';
    return;
  }
  grid.innerHTML = students.map(s => {
    const stuEvents = events.filter(e => String(e['תלמיד_מזהה']) === String(s['מזהה']));
    const stuWeek = stuEvents.filter(e => dateMs(e['תאריך']) > weekAgo).length;
    const stuHigh = stuEvents.filter(e => e['חומרה'] === 'גבוהה' && dateMs(e['תאריך']) > weekAgo).length;
    const stuFs = funcs.filter(f => String(f['תלמיד_מזהה']) === String(s['מזהה']));
    const fAvg = stuFs.length ? stuFs.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / stuFs.length : 0;
    const fColor = fAvg >= 4 ? 'success' : fAvg >= 3 ? 'warning' : fAvg > 0 ? 'danger' : 'secondary';
    const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    const initials = ((s['שם פרטי']||' ')[0] + (s['שם משפחה']||' ')[0]).trim() || '?';
    const flag = stuHigh >= 2 ? '<span class="badge bg-danger position-absolute" style="top:8px;left:8px"><i class="bi bi-flag-fill"></i> דגל</span>' : '';
    return `<div class="col-md-6 col-lg-4">
      <div class="card p-3 h-100 position-relative" style="cursor:pointer" onclick="viewStudent(${s['מזהה']})">
        ${flag}
        <div class="d-flex align-items-center mb-2 gap-2">
          <span class="avatar bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style="width:48px;height:48px;font-size:1.1rem">${escHtml(initials)}</span>
          <div>
            <strong>${escHtml(fullName)}</strong>
            <div class="small text-muted">גיל ${escHtml(s['גיל']||'-')}</div>
          </div>
        </div>
        <div class="row g-1 mt-2">
          <div class="col-4"><div class="small text-muted">תפקוד</div><span class="badge bg-${fColor}">${fAvg > 0 ? fAvg.toFixed(2) : '-'}</span></div>
          <div class="col-4"><div class="small text-muted">השבוע</div><span class="badge bg-${stuWeek > 3 ? 'warning' : 'light'} text-dark">${stuWeek}</span></div>
          <div class="col-4"><div class="small text-muted">סה"כ</div><span class="badge bg-light text-dark">${stuEvents.length}</span></div>
        </div>
      </div>
    </div>`;
  }).join('');
}
