// Medications page (כדורים ומעקב רפואי)
let _medsData = [];
let _medsStudents = [];

async function renderMedications() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-capsule"></i> רפואי — אלרגיות, רגישויות, כדורים</h3>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="medAddModal()"><i class="bi bi-plus"></i> רישום חדש</button>
        <button class="btn btn-outline-info" onclick="medExportCSV()"><i class="bi bi-download"></i> ייצוא CSV</button>
      </div>
    </div>

    <div class="card p-3 mb-3">
      <input id="m-search" class="form-control" placeholder="חיפוש לפי שם תלמיד, תרופה...">
    </div>

    <div id="m-grid" class="row g-3"></div>
    <div id="m-empty" class="text-center py-5 text-muted d-none">
      <i class="bi bi-capsule fs-1"></i>
      <p class="mb-0">אין רישומים</p>
    </div>`;
  document.getElementById('page-medications').innerHTML = html;

  const [sR, mR] = await Promise.all([api('listStudents', []), api('listMedications', [])]);
  _medsStudents = sR.data || [];
  _medsData = mR.data || [];
  document.getElementById('m-search').oninput = medsRefresh;
  medsRefresh();
}

function medsRefresh() {
  const q = (document.getElementById('m-search').value || '').toLowerCase();
  const stuById = {};
  _medsStudents.forEach(s => stuById[s['מזהה']] = s);
  let list = _medsData.map(m => ({ ...m, _stu: stuById[m['תלמיד_מזהה']] }));
  if (q) {
    list = list.filter(m => {
      const stu = m._stu;
      const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '';
      return [name, m['תרופה'], m['מצב_כיום'], m['שיחת_הורים'], m['הערות']].some(v => String(v||'').toLowerCase().includes(q));
    });
  }
  const grid = document.getElementById('m-grid');
  document.getElementById('m-empty').classList.toggle('d-none', list.length > 0);
  grid.innerHTML = list.map(m => {
    const stu = m._stu;
    const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '?';
    const initials = (stu ? ((stu['שם פרטי']||' ')[0] + (stu['שם משפחה']||' ')[0]) : '?').trim() || '?';
    const cls = stu ? stu['מחזור'] || '' : '';
    return `<div class="col-md-6 col-lg-4">
      <div class="card p-3 h-100">
        <div class="d-flex align-items-center mb-2 gap-2">
          <span class="avatar bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style="width:40px;height:40px">${escHtml(initials)}</span>
          <div>
            <strong>${escHtml(stuName)}</strong>
            <div class="small text-muted">כיתה ${escHtml(cls)}</div>
          </div>
          <div class="ms-auto">
            <button class="btn btn-sm btn-outline-primary" onclick="medEdit(${m['מזהה']})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="medDelete(${m['מזהה']})"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        ${m['סוג'] ? `<div class="mb-1"><span class="badge bg-${m['סוג']==='אלרגיה'?'danger':m['סוג']==='רגישות'?'warning':'info'}">${m['סוג']==='אלרגיה'?'⚠️ ':m['סוג']==='רגישות'?'🌿 ':m['סוג']==='תרופה'?'💊 ':''}${escHtml(m['סוג'])}</span></div>` : ''}
        ${m['תרופה'] ? `<div class="mb-2"><span class="badge bg-secondary">${escHtml(m['תרופה'])}</span></div>` : ''}
        ${m['מצב_כיום'] ? `<div class="mb-2"><strong class="small">מצב כיום:</strong><br><span class="small">${escHtml(m['מצב_כיום'])}</span></div>` : ''}
        ${m['שיחת_הורים'] ? `<div class="mb-2"><strong class="small">שיחת הורים:</strong><br><span class="small text-muted">${escHtml(m['שיחת_הורים'])}</span></div>` : ''}
        ${m['הערות'] ? `<div class="small text-muted border-top pt-2">${escHtml(m['הערות'])}</div>` : ''}
        <div class="small text-muted mt-auto pt-2">${escHtml(m['תאריך_עדכון']||'')}</div>
      </div>
    </div>`;
  }).join('');
}

function medAddModal(existing) {
  const sortedStu = _medsStudents.slice().sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const e = existing || {};
  const html = `<div class="modal fade" id="m-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5 class="modal-title">${existing ? 'עריכת' : 'רישום'} רפואי</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">תלמיד</label>
        <select id="ma-student" class="form-select" ${existing ? 'disabled' : ''}>
          ${sortedStu.map(s => `<option value="${s['מזהה']}" ${String(e['תלמיד_מזהה'])===String(s['מזהה'])?'selected':''}>${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('')}
        </select>
      </div>
      <div class="mb-2"><label class="form-label">סוג</label>
        <select id="ma-type" class="form-select">
          <option value="תרופה" ${e['סוג']==='תרופה'?'selected':''}>💊 תרופה</option>
          <option value="אלרגיה" ${e['סוג']==='אלרגיה'?'selected':''}>⚠️ אלרגיה</option>
          <option value="רגישות" ${e['סוג']==='רגישות'?'selected':''}>🌿 רגישות</option>
          <option value="מעקב" ${e['סוג']==='מעקב'?'selected':''}>📋 מעקב רפואי</option>
          <option value="אחר" ${e['סוג']==='אחר'?'selected':''}>📌 אחר</option>
        </select>
      </div>
      <div class="mb-2"><label class="form-label">פירוט (תרופה / חומר אלרגן / מצב)</label><input id="ma-drug" class="form-control" value="${escHtml(e['תרופה']||'')}" placeholder="ריטלין / בוטנים / גלוטן / אבק..."></div>
      <div class="mb-2"><label class="form-label">מצב כיום / חומרה</label><textarea id="ma-state" class="form-control" rows="3" placeholder="לדוגמה: 1 כדור בוקר. או: רגישות חמורה — לא לתת בוטנים בכלל!">${escHtml(e['מצב_כיום']||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">שיחת הורים</label><textarea id="ma-talks" class="form-control" rows="2">${escHtml(e['שיחת_הורים']||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">הערות</label><textarea id="ma-notes" class="form-control" rows="2">${escHtml(e['הערות']||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="medSave(${existing ? e['מזהה'] : 'null'})">שמור</button>
    </div></div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  const m = new bootstrap.Modal(document.getElementById('m-modal'));
  m.show();
  document.getElementById('m-modal').addEventListener('hidden.bs.modal', ev => ev.target.remove());
}

function medEdit(id) {
  const m = _medsData.find(x => String(x['מזהה']) === String(id));
  if (m) medAddModal(m);
}

async function medSave(editId) {
  const obj = {
    'תלמיד_מזהה': parseInt(document.getElementById('ma-student').value),
    'סוג': (document.getElementById('ma-type')||{}).value || 'תרופה',
    'תרופה': document.getElementById('ma-drug').value.trim(),
    'מצב_כיום': document.getElementById('ma-state').value.trim(),
    'שיחת_הורים': document.getElementById('ma-talks').value.trim(),
    'הערות': document.getElementById('ma-notes').value.trim(),
    'תאריך_עדכון': new Date().toISOString().slice(0,10),
  };
  if (!obj['תלמיד_מזהה']) return alert('תלמיד חובה');
  if (editId) obj['מזהה'] = editId;
  const r = await api(editId ? 'updateMedication' : 'addMedication', [obj]);
  if (r.ok) {
    hideModal('m-modal');
    notify('נשמר', 'success');
    renderMedications();
  } else alert(r.error || 'שגיאה');
}

async function medDelete(id) {
  if (!confirm('למחוק את הרישום?')) return;
  const r = await api('deleteMedication', [id]);
  if (r.ok) { notify('נמחק', 'success'); renderMedications(); } else alert(r.error || 'שגיאה במחיקה');
}

function medExportCSV() {
  if (!_medsData.length) return alert('אין נתונים');
  const stuById = {};
  _medsStudents.forEach(s => stuById[s['מזהה']] = s);
  const cols = ['תלמיד','תרופה','מצב_כיום','שיחת_הורים','תאריך_עדכון','הערות'];
  const csv = ['﻿' + cols.join(',')];
  _medsData.forEach(m => {
    const stu = stuById[m['תלמיד_מזהה']];
    const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
    const vals = [name, m['תרופה']||'', m['מצב_כיום']||'', m['שיחת_הורים']||'', m['תאריך_עדכון']||'', m['הערות']||''];
    csv.push(vals.map(v => `"${String(v).replace(/"/g,'""').replace(/\n/g,' ')}"`).join(','));
  });
  const blob = new Blob([csv.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'כדורים_ורפואי.csv';
  a.click();
}
