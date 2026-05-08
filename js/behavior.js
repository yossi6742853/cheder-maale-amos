let _events = [], _categories = [], _allStudents = [];

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
    const date = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
    return `<div class="card p-3 mb-2 ${sev}">
      <div class="d-flex justify-content-between">
        <div><span class="cat-badge">${escHtml(e['קטגוריה']||'')}</span><strong class="mx-2">${escHtml(e['שם תלמיד']||'')}</strong></div>
        <div class="d-flex align-items-center gap-2">
          <small class="text-muted">${escHtml(date)}</small>
          <button class="btn btn-sm btn-outline-primary" onclick="editEvent(${e['מזהה']||0})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteEvent(${e['מזהה']||0})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <p class="mb-0 mt-2">${escHtml(e['תיאור']||'')}</p>
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

function addEventModal() {
  const html = `<div class="modal fade" id="addEvModal"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>אירוע חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">תלמיד</label><select id="ne-student" class="form-select"><option value="">בחר</option>${_allStudents.map(s=>`<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">קטגוריה</label><select id="ne-cat" class="form-select"><option value="">בחר</option>${_categories.map(c=>`<option value="${escHtml(c['קטגוריה'])}">${escHtml(c['קטגוריה'])}</option>`).join('')}</select></div>
      <div class="mb-3"><label class="form-label">תיאור</label><textarea id="ne-desc" class="form-control" rows="3"></textarea></div>
      <div class="mb-3"><label class="form-label">חומרה</label><select id="ne-sev" class="form-select"><option>נמוכה</option><option selected>בינונית</option><option>גבוהה</option></select></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button><button class="btn btn-primary" onclick="saveEvent()">שמור</button></div>
  </div></div></div>`;
  const old = document.getElementById('addEvModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addEvModal')).show();
}

async function saveEvent() {
  const sid = document.getElementById('ne-student').value;
  const stu = _allStudents.find(s => String(s['מזהה']) === sid);
  const obj = {
    'תלמיד_מזהה': sid,
    'שם תלמיד': stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '',
    'קטגוריה': document.getElementById('ne-cat').value,
    'תיאור': document.getElementById('ne-desc').value,
    'חומרה': document.getElementById('ne-sev').value,
  };
  if (!obj['תלמיד_מזהה'] || !obj['קטגוריה'] || !obj['תיאור']) return alert('כל השדות חובה');
  const editId = document.getElementById('addEvModal').dataset.editId;
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    await api('updateBehavior', [obj]);
  } else {
    obj['תאריך'] = new Date().toISOString();
    await api('addBehavior', [obj]);
  }
  bootstrap.Modal.getInstance(document.getElementById('addEvModal')).hide();
  renderBehavior();
  loadStats();
}
