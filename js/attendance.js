// Daily attendance
let _attCurDate = new Date().toISOString().slice(0,10);
let _attCurClass = '';

async function renderAttendance() {
  const data = getVisibleData();
  const classes = (data.classes || []).slice().sort((a,b) => parseInt(a['סדר']) - parseInt(b['סדר']));
  if (!_attCurClass && classes.length) _attCurClass = classes[0]['שם'];
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-check2-square"></i> נוכחות יומית</h3>
      <div class="d-flex gap-2 align-items-center">
        <input id="att-date" type="date" class="form-control" value="${_attCurDate}">
        <select id="att-class" class="form-select">
          ${classes.map(c => `<option ${c['שם']===_attCurClass?'selected':''}>${escHtml(c['שם'])}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <div class="d-flex justify-content-between flex-wrap gap-2">
        <div class="d-flex gap-2">
          <button class="btn btn-success" onclick="attMarkAll('נוכח')"><i class="bi bi-check-all"></i> סמן הכל נוכחים</button>
          <button class="btn btn-outline-warning" onclick="attMarkAll('חיסר')"><i class="bi bi-x"></i> סמן הכל חיסור</button>
        </div>
        <div class="d-flex gap-3 align-items-center">
          <span class="badge bg-success" id="att-present">0 נוכחים</span>
          <span class="badge bg-warning text-dark" id="att-absent">0 חיסור</span>
          <span class="badge bg-info" id="att-late">0 איחור</span>
        </div>
      </div>
    </div>

    <div id="att-grid" class="row g-2"></div>
    <div id="att-empty" class="text-center py-5 text-muted d-none">
      <i class="bi bi-people fs-1"></i>
      <p>אין תלמידים בכיתה זו</p>
    </div>`;
  document.getElementById('page-attendance').innerHTML = html;

  document.getElementById('att-date').onchange = (e) => { _attCurDate = e.target.value; refreshAttendance(); };
  document.getElementById('att-class').onchange = (e) => { _attCurClass = e.target.value; refreshAttendance(); };
  refreshAttendance();
}

async function refreshAttendance() {
  const data = getVisibleData();
  const students = (data.students||[]).filter(s => s['מחזור'] === _attCurClass && (s['סטטוס']||'פעיל') !== 'סיים')
    .sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const records = (data.attendance||[]).filter(r => r['תאריך'] === _attCurDate);
  const byStu = {};
  records.forEach(r => { byStu[r['תלמיד_מזהה']] = r; });

  const grid = document.getElementById('att-grid');
  document.getElementById('att-empty').classList.toggle('d-none', students.length > 0);
  grid.innerHTML = students.map(s => {
    const r = byStu[s['מזהה']];
    const status = r ? r['סטטוס'] || 'לא סומן' : 'לא סומן';
    const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    const initials = ((s['שם פרטי']||' ')[0] + (s['שם משפחה']||' ')[0]).trim() || '?';
    const color = { 'נוכח':'success', 'חיסר':'warning', 'איחור':'info' }[status] || 'secondary';
    return `<div class="col-md-6 col-lg-4">
      <div class="card p-2 d-flex flex-row align-items-center gap-2" style="border-right:4px solid var(--bs-${color})">
        <span class="avatar bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style="width:36px;height:36px;font-size:.9rem">${escHtml(initials)}</span>
        <div class="flex-grow-1">
          <strong>${escHtml(fullName)}</strong>
        </div>
        <div class="btn-group btn-group-sm">
          <button class="btn ${status==='נוכח'?'btn-success':'btn-outline-success'}" onclick="attMark(${s['מזהה']}, 'נוכח')" title="נוכח"><i class="bi bi-check"></i></button>
          <button class="btn ${status==='חיסר'?'btn-warning':'btn-outline-warning'}" onclick="attMark(${s['מזהה']}, 'חיסר')" title="חיסר"><i class="bi bi-x"></i></button>
          <button class="btn ${status==='איחור'?'btn-info':'btn-outline-info'}" onclick="attMark(${s['מזהה']}, 'איחור')" title="איחור"><i class="bi bi-clock"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Stats
  const present = records.filter(r => r['סטטוס'] === 'נוכח').length;
  const absent = records.filter(r => r['סטטוס'] === 'חיסר').length;
  const late = records.filter(r => r['סטטוס'] === 'איחור').length;
  document.getElementById('att-present').textContent = `${present} נוכחים`;
  document.getElementById('att-absent').textContent = `${absent} חיסור`;
  document.getElementById('att-late').textContent = `${late} איחור`;
}

async function attMark(studentId, status) {
  const data = getVisibleData();
  const existing = (data.attendance||[]).find(r => String(r['תלמיד_מזהה']) === String(studentId) && r['תאריך'] === _attCurDate);
  const stu = (data.students||[]).find(s => String(s['מזהה']) === String(studentId));
  const obj = {
    'תלמיד_מזהה': studentId,
    'שם תלמיד': stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '',
    'תאריך': _attCurDate,
    'סטטוס': status,
    'מחזור': _attCurClass,
  };
  if (existing) {
    obj['מזהה'] = existing['מזהה'];
    await api('updateAttendance', [obj]);
  } else {
    await api('addAttendance', [obj]);
  }
  refreshAttendance();
}

async function attMarkAll(status) {
  if (!confirm(`לסמן את כל תלמידי כיתה ${_attCurClass} כ-${status}?`)) return;
  const data = getVisibleData();
  const students = (data.students||[]).filter(s => s['מחזור'] === _attCurClass && (s['סטטוס']||'פעיל') !== 'סיים');
  const records = (data.attendance||[]).filter(r => r['תאריך'] === _attCurDate);
  const byStu = {};
  records.forEach(r => { byStu[r['תלמיד_מזהה']] = r; });
  for (const s of students) {
    const existing = byStu[s['מזהה']];
    const obj = {
      'תלמיד_מזהה': s['מזהה'],
      'שם תלמיד': `${s['שם פרטי']||''} ${s['שם משפחה']||''}`.trim(),
      'תאריך': _attCurDate,
      'סטטוס': status,
      'מחזור': _attCurClass,
    };
    if (existing) {
      obj['מזהה'] = existing['מזהה'];
      await api('updateAttendance', [obj]);
    } else {
      await api('addAttendance', [obj]);
    }
  }
  refreshAttendance();
  notify(`סומנו ${students.length} תלמידים`, 'success');
}
