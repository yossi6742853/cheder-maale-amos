let _events = [], _categories = [], _allStudents = [];

// Compute Hebrew date + parsha for a given JS Date — delegates to dates.js for consistency
function getHebrewInfo(jsDate) {
  return {
    hdate: (typeof formatHebrew === 'function') ? formatHebrew(jsDate) : '',
    parsha: (typeof getParshaFor === 'function') ? getParshaFor(jsDate) : '',
  };
}

async function renderBehavior() {
  document.getElementById('page-behavior').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-clipboard-check"></i> מעקב התנהגות</h3>
      <button class="btn btn-success" onclick="addEventModal()"><i class="bi bi-plus"></i> אירוע חדש</button>
    </div>
    <div class="row g-2 mb-3">
      <div class="col-md-4"><select id="b-fstudent" class="form-select"><option value="">כל התלמידים</option></select></div>
      <div class="col-md-4"><select id="b-fcat" class="form-select"><option value="">כל הקטגוריות</option></select></div>
    </div>
    <div id="b-list"></div>`;
  const [stRes, evRes, catRes] = await Promise.all([
    api('listStudents', []),
    api('listBehavior', []),
    api('listCategories', []),
  ]);
  _allStudents = stRes.data || [];
  _events = evRes.data || [];
  _categories = catRes.data || [];
  _events.sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  fillFilters();
  drawEvents(_events);
  document.getElementById('b-fstudent').onchange = applyFilters;
  document.getElementById('b-fcat').onchange = applyFilters;
}

function fillFilters() {
  const stSel = document.getElementById('b-fstudent');
  _allStudents.forEach(s => {
    const fn = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    stSel.innerHTML += `<option value="${escHtml(s['מזהה'])}">${escHtml(fn)}</option>`;
  });
  const catSel = document.getElementById('b-fcat');
  _categories.forEach(c => {
    catSel.innerHTML += `<option value="${escHtml(c['קטגוריה'])}">${escHtml(c['קטגוריה'])}</option>`;
  });
}

function applyFilters() {
  let f = _events;
  const s = document.getElementById('b-fstudent').value;
  const c = document.getElementById('b-fcat').value;
  if (s) f = f.filter(e => String(e['תלמיד_מזהה']) === s);
  if (c) f = f.filter(e => e['קטגוריה'] === c);
  drawEvents(f);
}

function drawEvents(list) {
  const el = document.getElementById('b-list');
  if (!list.length) {
    el.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-clipboard fs-1"></i><p>אין אירועים</p></div>';
    return;
  }
  el.innerHTML = list.map(e => {
    const sev = e['חומרה'] === 'גבוהה' ? 'severity-high' : e['חומרה'] === 'נמוכה' ? 'severity-low' : 'severity-mid';
    const date = e['תאריך'] ? formatGreg(e['תאריך']) : '';
    let hdate = e['תאריך_עברי'] || '';
    let parsha = e['פרשה'] || '';
    // Backfill from JS date if missing
    if ((!hdate || !parsha) && e['תאריך']) {
      const info = getHebrewInfo(new Date(e['תאריך']));
      if (!hdate) hdate = info.hdate;
      if (!parsha) parsha = info.parsha;
    }
    const reporter = e['דווח_עי'] || '';
    const lesson = e['שיעור'] || '';
    const reporterBadge = reporter ? `<small class="text-muted"><i class="bi bi-person-fill"></i> ${escHtml(reporter)}</small>` : '';
    const lessonBadge = lesson ? `<small class="text-muted ms-2"><i class="bi bi-book"></i> ${escHtml(lesson)}</small>` : '';
    const parshaBadge = parsha ? `<span class="badge bg-light text-dark border me-1">פר' ${escHtml(parsha)}</span>` : '';
    const hdateBadge = hdate ? `<span class="badge bg-light text-dark border">${escHtml(hdate)}</span>` : '';
    const isHigh = e['חומרה'] === 'גבוהה';
    const handled = String(e['טופל']||'').toLowerCase() === 'true' || e['טופל'] === true || e['טופל'] === 'כן';
    const followBadge = isHigh ? (handled
      ? '<span class="badge bg-success-subtle text-success-emphasis border me-1"><i class="bi bi-check-circle"></i> טופל</span>'
      : '<span class="badge bg-danger-subtle text-danger-emphasis border me-1"><i class="bi bi-exclamation-triangle"></i> נדרשת שיחה</span>') : '';
    const handleBtn = isHigh && !handled
      ? `<button class="btn btn-sm btn-outline-success" onclick="markEventHandled(${e['מזהה']||0})" title="סמן כטופל"><i class="bi bi-check2-circle"></i></button>` : '';
    return `<div class="card p-3 mb-2 ${sev}">
      <div class="d-flex justify-content-between flex-wrap gap-2">
        <div><span class="cat-badge">${escHtml(e['קטגוריה']||'')}</span><strong class="mx-2">${escHtml(e['שם תלמיד']||'')}</strong>${followBadge}</div>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          ${parshaBadge}${hdateBadge}
          <small class="text-muted">${escHtml(date)}</small>
          ${handleBtn}
          <button class="btn btn-sm btn-outline-primary" onclick="editEvent(${e['מזהה']||0})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${e['מזהה']||0})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <p class="mb-0 mt-2">${escHtml(e['תיאור']||'')}</p>
      ${(reporterBadge || lessonBadge) ? `<div class="mt-2">${reporterBadge}${lessonBadge}</div>` : ''}
    </div>`;
  }).join('');
}

function editEvent(id) {
  const e = _events.find(x => String(x['מזהה']) === String(id));
  if (!e) return;
  addEventModal();
  const modalEl = document.getElementById('addEvModal');
  const populate = () => {
    document.getElementById('ne-student').value = e['תלמיד_מזהה'] || '';
    document.getElementById('ne-cat').value = e['קטגוריה'] || '';
    document.getElementById('ne-desc').value = e['תיאור'] || '';
    document.getElementById('ne-sev').value = e['חומרה'] || 'בינונית';
    modalEl.dataset.editId = id;
    const h5 = modalEl.querySelector('h5');
    if (h5) h5.textContent = 'עריכת אירוע';
  };
  modalEl.addEventListener('shown.bs.modal', populate, { once: true });
}

async function deleteEvent(id) {
  if (!confirm('בטוח למחוק את האירוע?')) return;
  await api('deleteBehavior', [id]);
  renderBehavior();
  loadStats();
}

// Mark a high-severity event as handled (follow-up done)
async function markEventHandled(id) {
  const ev = _events.find(x => String(x['מזהה']) === String(id));
  if (!ev) return;
  ev['טופל'] = 'כן';
  const r = await api('updateBehavior', [ev]);
  if (r && !r.ok) return alert(r.error || 'שגיאה');
  if (typeof toast === 'function') toast('סומן כטופל', 'success');
  renderBehavior();
}
window.markEventHandled = markEventHandled;

function addEventModal() {
  const html = `<div class="modal fade" id="addEvModal"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>אירוע חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">תלמיד</label><select id="ne-student" class="form-select"><option value="">בחר</option>${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').map(s=>`<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">קטגוריה</label><select id="ne-cat" class="form-select"><option value="">בחר</option>${_categories.map(c=>`<option value="${escHtml(c['קטגוריה'])}">${escHtml(c['קטגוריה'])}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">תיאור</label><textarea id="ne-desc" class="form-control" rows="3"></textarea></div>
      <div class="mb-3"><label class="form-label">חומרה</label><select id="ne-sev" class="form-select"><option>נמוכה</option><option selected>בינונית</option><option>גבוהה</option></select></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button><button class="btn btn-primary" onclick="saveEvent(event)">שמור</button></div>
  </div></div></div>`;
  cleanupModal('addEvModal');
  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById('addEvModal');
  new bootstrap.Modal(modalEl).show();
  modalEl.addEventListener('hidden.bs.modal', () => cleanupModal('addEvModal'), { once: true });
}

async function saveEvent(event) {
  // Bug #8 fix: prevent double-submit
  const btn = event?.target?.closest('button');
  if (btn && btn.disabled) return;
  if (btn) {
    btn.disabled = true;
    setTimeout(() => { btn.disabled = false; }, 3000);
  }
  const sid = document.getElementById('ne-student').value;
  const stu = _allStudents.find(s => String(s['מזהה']) === sid);
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const reporter = sess.username || 'admin';
  const obj = {
    'תלמיד_מזהה': sid,
    'שם תלמיד': stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '',
    'קטגוריה': document.getElementById('ne-cat').value,
    'תיאור': document.getElementById('ne-desc').value,
    'חומרה': document.getElementById('ne-sev').value,
  };
  if (!obj['תלמיד_מזהה'] || !obj['קטגוריה'] || !obj['תיאור']) return alert('כל השדות חובה');
  const editId = document.getElementById('addEvModal').dataset.editId;
  let r;
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    const orig = _events.find(x => String(x['מזהה']) === String(editId));
    if (orig && orig['תאריך']) {
      const info = getHebrewInfo(new Date(orig['תאריך']));
      obj['תאריך_עברי'] = orig['תאריך_עברי'] || info.hdate;
      obj['פרשה'] = orig['פרשה'] || info.parsha;
    }
    r = await api('updateBehavior', [obj]);
  } else {
    const now = new Date();
    const info = getHebrewInfo(now);
    obj['תאריך'] = now.toISOString();
    obj['תאריך_עברי'] = info.hdate;
    obj['פרשה'] = info.parsha;
    obj['דווח_עי'] = reporter;
    r = await api('addBehavior', [obj]);
  }
  if (r && !r.ok) return alert(r.error || 'שגיאה בשמירה');  // Bug #42 fix
  hideModal('addEvModal');
  renderBehavior();
  loadStats();
}
