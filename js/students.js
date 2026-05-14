// Students page
let _students = [];
let _statusFilter = 'active';

async function renderStudents() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-people"></i> רשימת תלמידים</h3>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="addStudentModal()"><i class="bi bi-plus"></i> תלמיד חדש</button>
        <button class="btn btn-outline-success" onclick="importStudentsCSV()"><i class="bi bi-upload"></i> ייבוא CSV</button>
        <button class="btn btn-outline-info" onclick="exportStudentsCSV()"><i class="bi bi-download"></i> ייצוא CSV</button>
      </div>
    </div>
    <div class="card p-3">
      <div class="row g-2 mb-3">
        <div class="col-md-4"><input id="s-search" class="form-control" placeholder="חיפוש תלמיד..."></div>
        <div class="col-md-2">
          <select id="s-status" class="form-select">
            <option value="active">פעילים</option>
            <option value="graduated">סיימו</option>
            <option value="all">הכל</option>
          </select>
        </div>
        <div class="col-md-2"><select id="s-class" class="form-select"><option value="">כל הכיתות</option></select></div>
        <div class="col-md-2"><select id="s-mood" class="form-select">
          <option value="">כל המצבים</option>
          <option value="🚨">🚨 בעייתי</option>
          <option value="⚠️">⚠️ מודאג</option>
          <option value="🟡">🟡 בסדר</option>
          <option value="👍">👍 טוב</option>
          <option value="✅">✅ מצוין</option>
        </select></div>
        <div class="col-md-2"><select id="s-quick" class="form-select">
          <option value="">— מסנן מהיר —</option>
          <option value="bd_week">ימי הולדת השבוע</option>
          <option value="attention">תלמידים לתשומת לב</option>
          <option value="no_recent_conv">בלי שיחה 30+ ימים</option>
        </select></div>
      </div>
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div class="small text-muted"><span id="s-count">0</span> תלמידים נמצאו · בחר מספר תלמידים לפעולה משותפת</div>
        <div id="bulk-actions" class="d-none">
          <button class="btn btn-sm btn-warning" onclick="bulkAddEvent()"><i class="bi bi-clipboard-check"></i> אירוע משותף (<span id="bulk-count">0</span>)</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="bulkClearSel()">נקה</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr><th style="width:30px"><input type="checkbox" id="s-checkall" onclick="bulkToggleAll(this)"></th><th>מזהה</th><th>שם מלא</th><th>גיל</th><th>כיתה</th><th>מצב</th><th>טלפון אם</th><th>סטטוס</th><th>פעולות</th></tr>
          </thead>
          <tbody id="students-tbody"></tbody>
        </table>
      </div>
      <div id="s-empty" class="text-center py-5 d-none text-muted"><i class="bi bi-people fs-1"></i><p>אין תלמידים</p></div>
    </div>`;
  document.getElementById('page-students').innerHTML = html;

  const r = await api('listStudents', []);
  _students = r.data || [];
  document.getElementById('s-status').value = _statusFilter;
  // Populate class dropdown
  const classes = [...new Set(_students.map(s => s['מחזור']).filter(Boolean))].sort();
  document.getElementById('s-class').innerHTML = '<option value="">כל הכיתות</option>' +
    classes.map(c => `<option>${escHtml(c)}</option>`).join('');
  // Round-11: debounce search input
  let _sDeb;
  document.getElementById('s-search').oninput = () => { clearTimeout(_sDeb); _sDeb = setTimeout(applyStudentFilters, 150); };
  ['s-status','s-class','s-mood','s-quick'].forEach(id => { const el = document.getElementById(id); if (el) el.onchange = applyStudentFilters; });
  applyStudentFilters();
}

const STU_BULK_SEL = new Set();
function bulkClearSel() {
  STU_BULK_SEL.clear();
  document.querySelectorAll('.s-row-cb').forEach(cb => cb.checked = false);
  const ca = document.getElementById('s-checkall'); if (ca) ca.checked = false;
  updateBulkUI();
}
function bulkToggleAll(cb) {
  document.querySelectorAll('.s-row-cb').forEach(rcb => {
    rcb.checked = cb.checked;
    const sid = rcb.dataset.sid;
    if (cb.checked) STU_BULK_SEL.add(sid); else STU_BULK_SEL.delete(sid);
  });
  updateBulkUI();
}
function bulkToggleRow(cb) {
  const sid = cb.dataset.sid;
  if (cb.checked) STU_BULK_SEL.add(sid); else STU_BULK_SEL.delete(sid);
  updateBulkUI();
}
window.bulkClearSel = bulkClearSel;
window.bulkToggleAll = bulkToggleAll;
window.bulkToggleRow = bulkToggleRow;
function updateBulkUI() {
  const bar = document.getElementById('bulk-actions');
  const cnt = document.getElementById('bulk-count');
  if (!bar) return;
  if (STU_BULK_SEL.size > 0) {
    bar.classList.remove('d-none');
    if (cnt) cnt.textContent = STU_BULK_SEL.size;
  } else bar.classList.add('d-none');
}

async function bulkAddEvent() {
  if (!STU_BULK_SEL.size) return;
  const sids = Array.from(STU_BULK_SEL);
  const cats = ((await api('listCategories', [])).data || []);
  const stuNames = sids.map(sid => {
    const s = _students.find(x => String(x['מזהה']) === sid);
    return s ? `${s['שם פרטי']||''} ${s['שם משפחה']||''}` : sid;
  }).join(', ');
  const html = `<div class="modal fade" id="bulk-ev-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-clipboard-check"></i> אירוע משותף ל-${sids.length} תלמידים</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="small text-muted mb-2">${escHtml(stuNames)}</div>
      <div class="mb-2"><label class="form-label">קטגוריה</label>
        <select id="be-cat" class="form-select">${cats.map(c => `<option>${escHtml(c['קטגוריה'])}</option>`).join('')}</select>
      </div>
      <div class="mb-2"><label class="form-label">תיאור</label><textarea id="be-desc" class="form-control" rows="3"></textarea></div>
      <div class="mb-2"><label class="form-label">חומרה</label>
        <select id="be-sev" class="form-select"><option>נמוכה</option><option selected>בינונית</option><option>גבוהה</option></select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="bulkSaveEvent()">שמור לכולם</button>
    </div>
  </div></div></div>`;
  cleanupModal('bulk-ev-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('bulk-ev-modal')).show();
  document.getElementById('bulk-ev-modal').addEventListener('hidden.bs.modal', () => cleanupModal('bulk-ev-modal'), { once: true });
}
window.bulkAddEvent = bulkAddEvent;

async function bulkSaveEvent() {
  const cat = document.getElementById('be-cat').value;
  const desc = document.getElementById('be-desc').value.trim();
  const sev = document.getElementById('be-sev').value;
  if (!desc) return alert('חובה לכתוב תיאור');
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const reporter = sess.username || 'admin';
  let ok = 0, fail = 0;
  for (const sid of STU_BULK_SEL) {
    const s = _students.find(x => String(x['מזהה']) === sid);
    if (!s) { fail++; continue; }
    const now = new Date();
    const info = (typeof getHebrewInfo === 'function') ? getHebrewInfo(now) : { hdate:'', parsha:'' };
    const obj = {
      'תלמיד_מזהה': sid,
      'שם תלמיד': `${s['שם פרטי']||''} ${s['שם משפחה']||''}`,
      'קטגוריה': cat,
      'תיאור': desc,
      'חומרה': sev,
      'תאריך': now.toISOString(),
      'תאריך_עברי': info.hdate,
      'פרשה': info.parsha,
      'דווח_עי': reporter,
    };
    const r = await api('addBehavior', [obj]);
    if (r && r.ok) ok++; else fail++;
  }
  hideModal('bulk-ev-modal');
  if (typeof toast === 'function') toast(`נשמרו ${ok} אירועים${fail?', '+fail+' נכשלו':''}`, fail ? 'warn' : 'success');
  bulkClearSel();
  loadStats();
}
window.bulkSaveEvent = bulkSaveEvent;

const MOOD_META = {
  '✅': { color: 'success',   text: 'מצוין'  },
  '👍': { color: 'primary',   text: 'טוב'    },
  '🟡': { color: 'warning',   text: 'בסדר'   },
  '⚠️': { color: 'warning',   text: 'מודאג' },
  '🚨': { color: 'danger',    text: 'בעייתי'},
};

async function setStudentMood(id, mood) {
  const r = await api('updateStudent', [{ 'מזהה': id, 'מצב_כללי': mood }]);
  if (r && !r.ok) return alert(r.error || 'שגיאה');
  const stu = _students.find(x => String(x['מזהה']) === String(id));
  if (stu) stu['מצב_כללי'] = mood;
  applyStudentFilters();
}
window.setStudentMood = setStudentMood;

function applyStudentFilters() {
  const q = (document.getElementById('s-search')?.value || '').toLowerCase();
  _statusFilter = document.getElementById('s-status')?.value || 'active';
  const cls = document.getElementById('s-class')?.value || '';
  const mood = document.getElementById('s-mood')?.value || '';
  const quick = document.getElementById('s-quick')?.value || '';
  let list = _students;
  if (_statusFilter === 'active') list = list.filter(s => (s['סטטוס']||'פעיל') !== 'סיים');
  else if (_statusFilter === 'graduated') list = list.filter(s => s['סטטוס'] === 'סיים');
  if (cls) list = list.filter(s => s['מחזור'] === cls);
  if (mood) list = list.filter(s => s['מצב_כללי'] === mood);
  if (quick === 'bd_week') {
    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today.getTime() + 7 * 24 * 3600 * 1000);
    list = list.filter(s => {
      const d = parseAnyDate(s['תאריך לידה']);
      if (!d) return false;
      const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      if (next < today) next.setFullYear(today.getFullYear() + 1);
      return next >= today && next <= in7;
    });
  } else if (quick === 'attention') {
    list = list.filter(s => s['מצב_כללי'] === '⚠️' || s['מצב_כללי'] === '🚨');
  } else if (quick === 'no_recent_conv') {
    const data = getVisibleData();
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    const last = {};
    (data.conversations||[]).forEach(c => {
      const ms = dateMs(c['תאריך']); const sid = String(c['תלמיד_מזהה']);
      if (!last[sid] || ms > last[sid]) last[sid] = ms;
    });
    list = list.filter(s => !last[String(s['מזהה'])] || last[String(s['מזהה'])] < cutoff);
  }
  if (q) list = list.filter(s => Object.entries(s).some(([k, v]) => k !== 'תמונה' && String(v).toLowerCase().includes(q)));
  const cnt = document.getElementById('s-count'); if (cnt) cnt.textContent = list.length;
  drawStudents(list);
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
    const isGrad = s['סטטוס'] === 'סיים';
    const statusBadge = isGrad
      ? '<span class="badge bg-secondary">סיים</span>'
      : '<span class="badge bg-success">פעיל</span>';
    const promoteBtn = isGrad
      ? `<button class="btn btn-sm btn-outline-success me-1" onclick="reactivateStudent(${s['מזהה']})" title="החזר למוסד"><i class="bi bi-arrow-counterclockwise"></i></button>`
      : `<button class="btn btn-sm btn-outline-warning me-1" onclick="promoteStudent(${s['מזהה']})" title="העלה כיתה"><i class="bi bi-arrow-up"></i></button>
         <button class="btn btn-sm btn-outline-secondary me-1" onclick="deactivateStudent(${s['מזהה']})" title="הוצא מהמוסד"><i class="bi bi-box-arrow-right"></i></button>`;
    const grayed = isGrad ? 'style="opacity:.65"' : '';
    const mood = s['מצב_כללי'] || '';
    const moodCell = `<div class="dropdown">
      <button class="btn btn-sm btn-light dropdown-toggle" data-bs-toggle="dropdown" title="${escHtml((MOOD_META[mood]||{}).text||'הגדר מצב')}">${mood || '—'}</button>
      <ul class="dropdown-menu">
        ${['✅','👍','🟡','⚠️','🚨'].map(m => `<li><a class="dropdown-item" href="#" onclick="event.preventDefault();setStudentMood(${s['מזהה']},'${m}')">${m} ${escHtml(MOOD_META[m].text)}</a></li>`).join('')}
        ${mood ? `<li><hr class="dropdown-divider"></li><li><a class="dropdown-item text-muted" href="#" onclick="event.preventDefault();setStudentMood(${s['מזהה']},'')">נקה</a></li>` : ''}
      </ul>
    </div>`;
    const checked = STU_BULK_SEL.has(String(s['מזהה'])) ? ' checked' : '';
    return `<tr ${grayed}>
      <td><input type="checkbox" class="s-row-cb" data-sid="${s['מזהה']}" onclick="bulkToggleRow(this)"${checked}></td>
      <td onclick="viewStudent(${s['מזהה']})" style="cursor:pointer">${escHtml(s['מזהה']||'')}</td>
      <td onclick="viewStudent(${s['מזהה']})" style="cursor:pointer"><span class="avatar">${escHtml(initials)}</span>${escHtml(fullName)}</td>
      <td onclick="viewStudent(${s['מזהה']})" style="cursor:pointer">${escHtml(s['גיל']||'')}</td>
      <td onclick="viewStudent(${s['מזהה']})" style="cursor:pointer">${escHtml(s['מחזור']||'')}</td>
      <td>${moodCell}</td>
      <td onclick="viewStudent(${s['מזהה']})" style="cursor:pointer">${escHtml(s['טלפון אם']||'')}</td>
      <td>${statusBadge}</td>
      <td>
        <button class="btn btn-sm btn-outline-info me-1" onclick="viewStudent(${s['מזהה']})" title="צפייה"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editStudent(${s['מזהה']})" title="עריכה"><i class="bi bi-pencil"></i></button>
        ${promoteBtn}
        <button class="btn btn-sm btn-outline-danger" onclick="deleteStudent(${s['מזהה']})" title="מחיקה"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  updateBulkUI();
}

async function promoteStudent(id) {
  const data = getData();
  const stu = data.students.find(s => String(s['מזהה']) === String(id));
  if (!stu) return;
  if (!confirm(`להעלות את ${stu['שם פרטי']||''} ${stu['שם משפחה']||''} כיתה?`)) return;
  const r = await api('promoteStudent', [id]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  const newClass = r.data.newClass;
  const status = r.data.status;
  if (typeof toast === 'function') toast(status === 'סיים' ? 'התלמיד סיים את המוסד' : `הועלה לכיתה ${newClass}`, 'success');
  renderStudents();
  loadStats();
}

async function deactivateStudent(id) {
  const data = getData();
  const stu = data.students.find(s => String(s['מזהה']) === String(id));
  if (!stu) return;
  if (!confirm(`להוציא את ${stu['שם פרטי']||''} ${stu['שם משפחה']||''} מהמוסד?\n(התלמיד לא יימחק, רק יסומן כסיים)`)) return;
  const r = await api('deactivateStudent', [id]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  if (typeof toast === 'function') toast('התלמיד הוצא מהמוסד', 'success');
  renderStudents();
  loadStats();
}

async function reactivateStudent(id) {
  const r = await api('reactivateStudent', [id]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  if (typeof toast === 'function') toast('התלמיד הוחזר למוסד', 'success');
  renderStudents();
  loadStats();
}

function uploadStudentPhoto(studentId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Resize to ~150px to keep storage small
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        const max = 200;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        const w = img.width * ratio, h = img.height * ratio;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        const r = await api('updateStudent', [{ 'מזהה': studentId, 'תמונה': dataUrl }]);
        if (r.ok) {
          notify('התמונה הועלתה', 'success');
          const old = document.getElementById('viewStuModal');
          if (old) bootstrap.Modal.getInstance(old).hide();
          setTimeout(() => viewStudent(studentId), 250);
        } else alert(r.error || 'שגיאה');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function getHebrewBirthday(s) {
  if (!s || !s['תאריך לידה']) return '';
  if (typeof hebrewBirthday === 'function') return hebrewBirthday(s['תאריך לידה']);
  if (typeof hebcal === 'undefined') return '';
  try {
    const d = parseAnyDate(s['תאריך לידה']);
    if (!d) return '';
    return new hebcal.HDate(d).renderGematriya('he');
  } catch (e) { return ''; }
}

function getSortedActiveStudents() {
  return _students.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').sort((a,b) =>
    String(a['מחזור']).localeCompare(String(b['מחזור'])) ||
    (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
}

function navigateStudent(currentId, dir) {
  const list = getSortedActiveStudents();
  const idx = list.findIndex(s => String(s['מזהה']) === String(currentId));
  if (idx < 0) return;
  const nextIdx = (idx + dir + list.length) % list.length;
  const old = document.getElementById('viewStuModal');
  if (old) bootstrap.Modal.getInstance(old).hide();
  setTimeout(() => viewStudent(list[nextIdx]['מזהה']), 250);
}

async function viewStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const events = ((await api('listBehavior', [])).data || [])
    .filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const conversations = ((await api('listConversations', [])).data || [])
    .filter(c => String(c['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const hebBd = getHebrewBirthday(s);
  const waButtons = (phone, name, parent) => {
    if (!phone) return '';
    const clean = phone.replace(/\D/g,'');
    if (!clean) return '';
    const intl = clean.startsWith('0') ? '972' + clean.slice(1) : clean;
    const msg = encodeURIComponent(`שלום, מבית התלמוד בנוגע ל${name.trim()}`);
    return `<a href="https://wa.me/${intl}?text=${msg}" target="_blank" class="btn btn-sm btn-success p-1 ms-1" title="WhatsApp ${parent}"><i class="bi bi-whatsapp"></i></a><a href="tel:${phone}" class="btn btn-sm btn-outline-primary p-1" title="חיוג ${parent}"><i class="bi bi-telephone"></i></a>`;
  };
  const eventsHtml = events.length ? events.map(e => {
    const sev = e['חומרה'] === 'גבוהה' ? 'severity-high' : e['חומרה'] === 'נמוכה' ? 'severity-low' : 'severity-mid';
    const dt = e['תאריך'] ? formatDateBoth(e['תאריך']) : '';
    let hdate = e['תאריך_עברי'] || '';
    let parsha = e['פרשה'] || '';
    if ((!hdate || !parsha) && e['תאריך'] && typeof getHebrewInfo === 'function') {
      const info = getHebrewInfo(new Date(e['תאריך']));
      if (!hdate) hdate = info.hdate;
      if (!parsha) parsha = info.parsha;
    }
    const parshaBadge = parsha ? `<span class="badge bg-light text-dark border me-1">פר' ${escHtml(parsha)}</span>` : '';
    const hdateBadge = hdate ? `<span class="badge bg-light text-dark border me-1">${escHtml(hdate)}</span>` : '';
    const reporter = e['דווח_עי'] || '';
    return `<div class="card p-2 mb-2 ${sev}">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
        <div>
          <span class="cat-badge">${escHtml(e['קטגוריה']||'')}</span>
          ${parshaBadge}${hdateBadge}
        </div>
        <div class="d-flex align-items-center gap-1">
          <small class="text-muted">${escHtml(dt)}</small>
          <button class="btn btn-sm btn-outline-primary p-1" onclick="editEventInStudent(${e['מזהה']||0}, ${id})" title="עריכה"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger p-1" onclick="deleteEventInStudent(${e['מזהה']||0}, ${id})" title="מחיקה"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      <p class="mb-0 mt-1 small">${escHtml(e['תיאור']||'')}</p>
      ${reporter ? `<div class="mt-1"><small class="text-muted"><i class="bi bi-person-fill"></i> ${escHtml(reporter)}</small></div>` : ''}
    </div>`;
  }).join('') : '<p class="text-muted">אין אירועים מתועדים</p>';

  const html = `<div class="modal fade" id="viewStuModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header">
      <button class="btn btn-sm btn-outline-secondary p-1 ms-2" onclick="navigateStudent(${id}, -1)" title="הקודם (←)"><i class="bi bi-chevron-right"></i></button>
      <div class="d-flex align-items-center gap-2 flex-grow-1">
        ${s['תמונה'] ? `<img src="${escHtml(s['תמונה'])}" alt="" style="width:48px;height:48px;border-radius:50%;object-fit:cover;cursor:pointer" onclick="uploadStudentPhoto(${id})">` : `<span class="avatar bg-primary text-white rounded-circle d-inline-flex align-items-center justify-content-center" style="width:48px;height:48px;cursor:pointer" onclick="uploadStudentPhoto(${id})" title="העלה תמונה">${escHtml(((s['שם פרטי']||' ')[0] + (s['שם משפחה']||' ')[0]).trim() || '?')}</span>`}
        <h5 class="mb-0"><i class="bi bi-person"></i> ${escHtml(fullName)}</h5>
      </div>
      <button class="btn btn-sm btn-outline-secondary p-1 me-2" onclick="navigateStudent(${id}, 1)" title="הבא (→)"><i class="bi bi-chevron-left"></i></button>
      <button class="btn-close ms-auto" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="row g-2 mb-3">
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${escHtml(s['גיל']||'-')}</strong><div class="small text-muted">גיל</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${escHtml(s['מחזור']||'-')}</strong><div class="small text-muted">כיתה</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.length}</strong><div class="small text-muted">אירועים</div></div></div>
        <div class="col-md-3"><div class="card p-2 text-center"><strong>${events.filter(e=>e['חומרה']==='גבוהה').length}</strong><div class="small text-muted">חומרה גבוהה</div></div></div>
      </div>
      <h6>פרטים אישיים</h6>
      <table class="table table-sm">
        <tr><td><strong>תאריך לידה</strong></td><td>${escHtml(formatGreg(s['תאריך לידה'])||'-')} ${hebBd ? `<br><small class="text-muted">${escHtml(hebBd)}</small>` : ''}</td><td><strong>ת.ז.</strong></td><td>${escHtml(s['מספר זהות']||'-')}</td></tr>
        <tr><td><strong>שם אם</strong></td><td>${escHtml(s['שם אם']||'-')}</td><td><strong>טלפון אם</strong></td><td>${escHtml(s['טלפון אם']||'-')} ${waButtons(s['טלפון אם'], fullName, 'אמא')}</td></tr>
        <tr><td><strong>שם אב</strong></td><td>${escHtml(s['שם אב']||'-')}</td><td><strong>טלפון אב</strong></td><td>${escHtml(s['טלפון אב']||'-')} ${waButtons(s['טלפון אב'], fullName, 'אבא')}</td></tr>
        <tr><td><strong>כתובת</strong></td><td colspan="3">${escHtml(s['כתובת']||'-')}${s['עיר'] ? ', ' + escHtml(s['עיר']) : ''}</td></tr>
        ${s['הערות'] ? `<tr><td><strong>הערות</strong></td><td colspan="3">${escHtml(s['הערות'])}</td></tr>` : ''}
      </table>
      <div class="card p-3 mb-3">
        <h6><i class="bi bi-graph-up"></i> מגמת התנהגות (14 ימים)</h6>
        <canvas id="stu-trend-chart" style="max-height:120px"></canvas>
      </div>
      <ul class="nav nav-tabs mt-3" id="stu-tabs">
        <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#stu-tab-behavior">התנהגות (${events.length})</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#stu-tab-conversations">שיחות (${conversations.length})</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#stu-tab-profile">פרופיל אישי</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#stu-tab-timeline">טיים-ליין</a></li>
      </ul>
      <div class="tab-content pt-2">
        <div class="tab-pane fade show active" id="stu-tab-behavior">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span></span>
            <button class="btn btn-sm btn-success" onclick="addEventForStudent(${id})"><i class="bi bi-plus"></i> אירוע חדש</button>
          </div>
          ${eventsHtml}
        </div>
        <div class="tab-pane fade" id="stu-tab-conversations">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <span></span>
            <button class="btn btn-sm btn-success" onclick="addConversationForStudent(${id})"><i class="bi bi-plus"></i> שיחה חדשה</button>
          </div>
          <div id="stu-conv-list">${conversations.length ? conversations.map(c => {
            const dt = c['תאריך'] ? formatDateBoth(c['תאריך']) : '';
            let hdate = c['תאריך_עברי'] || ((typeof formatHebrewShort === 'function' && c['תאריך']) ? formatHebrewShort(c['תאריך']) : '');
            let parsha = c['פרשה'] || ((typeof getParshaFor === 'function' && c['תאריך']) ? getParshaFor(c['תאריך']) : '');
            return `<div class="card p-2 mb-2 border-info">
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
                <div>
                  ${c['רב'] ? `<span class="badge bg-info-subtle text-info-emphasis border me-1"><i class="bi bi-person-fill"></i> ${escHtml(c['רב'])}</span>` : ''}
                  ${c['קטגוריה'] ? `<span class="badge bg-primary-subtle text-primary-emphasis border me-1">${escHtml(c['קטגוריה'])}</span>` : ''}
                  ${c['אירוע_מקושר'] ? `<span class="badge bg-warning-subtle text-warning-emphasis border me-1"><i class="bi bi-link"></i> אירוע #${escHtml(c['אירוע_מקושר'])}</span>` : ''}
                  ${c['נושא'] ? `<strong>${escHtml(c['נושא'])}</strong>` : ''}
                </div>
                <div class="d-flex align-items-center gap-1 flex-wrap">
                  ${parsha ? `<span class="badge bg-light text-dark border">פר' ${escHtml(parsha)}</span>` : ''}
                  ${hdate ? `<span class="badge bg-light text-dark border">${escHtml(hdate)}</span>` : ''}
                  <small class="text-muted">${escHtml(dt)}</small>
                  <button class="btn btn-sm btn-outline-primary p-1" onclick="editConvInStudent(${c['מזהה']}, ${id})" title="עריכה"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-outline-danger p-1" onclick="deleteConvInStudent(${c['מזהה']}, ${id})" title="מחיקה"><i class="bi bi-trash"></i></button>
                </div>
              </div>
              ${c['תוכן'] ? `<p class="mb-0 mt-1 small" style="white-space:pre-wrap;line-height:1.6">${escHtml(c['תוכן'])}</p>` : ''}
              ${c['הערות'] ? `<div class="mt-1 small text-muted">${escHtml(c['הערות'])}</div>` : ''}
            </div>`;
          }).join('') : '<p class="text-muted">אין שיחות מתועדות</p>'}</div>
        </div>
        <div class="tab-pane fade" id="stu-tab-profile">
          <div class="d-flex justify-content-end mb-2">
            <button class="btn btn-sm btn-primary" onclick="saveStudentProfile(${id})"><i class="bi bi-save"></i> שמור</button>
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold"><i class="bi bi-file-earmark-text"></i> דוח אישי</label>
            <textarea id="sp-report" class="form-control" rows="4" placeholder="דוח כללי על התלמיד...">${escHtml(s['דוח_אישי']||'')}</textarea>
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold"><i class="bi bi-people"></i> הורים</label>
            <textarea id="sp-parents" class="form-control" rows="3" placeholder="מצב במשפחה, יחס לחינוך...">${escHtml(s['פרופיל_הורים']||'')}</textarea>
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold"><i class="bi bi-emoji-smile"></i> אישיות</label>
            <textarea id="sp-personality" class="form-control" rows="3" placeholder="תכונות אופי, מצבי רוח...">${escHtml(s['פרופיל_אישיות']||'')}</textarea>
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold"><i class="bi bi-activity"></i> התנהגותי</label>
            <textarea id="sp-behavior" class="form-control" rows="3" placeholder="התנהגות בכיתה, ביחסי חברה...">${escHtml(s['פרופיל_התנהגותי']||'')}</textarea>
          </div>
          <div class="mb-2">
            <label class="form-label fw-bold"><i class="bi bi-book"></i> לימודי</label>
            <textarea id="sp-learning" class="form-control" rows="3" placeholder="הישגים, קשיים, מוטיבציה...">${escHtml(s['פרופיל_לימודי']||'')}</textarea>
          </div>
        </div>
        <div class="tab-pane fade" id="stu-tab-timeline">
          <div id="stu-timeline-content"><div class="text-center py-3 text-muted"><i class="bi bi-hourglass"></i> טוען...</div></div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-outline-warning" onclick="shareParentPortal(${id})"><i class="bi bi-link-45deg"></i> קישור להורים</button>
      <button class="btn btn-outline-info" onclick="emailParentSummary(${id})"><i class="bi bi-envelope"></i> מייל</button>
      <button class="btn btn-outline-success" onclick="printStudentReport(${id})"><i class="bi bi-printer"></i> הדפס</button>
      <button class="btn btn-outline-primary" onclick="hideModal('viewStuModal'); editStudent(${id})"><i class="bi bi-pencil"></i> ערוך</button>
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  cleanupModal('viewStuModal');
  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById('viewStuModal');
  new bootstrap.Modal(modalEl).show();
  modalEl.addEventListener('hidden.bs.modal', () => cleanupModal('viewStuModal'), { once: true });
  // Trend chart for last 14 days
  setTimeout(() => drawStudentTrendChart(id, events), 200);
  // Lazy-load timeline when tab clicked
  const tlTab = modalEl.querySelector('a[href="#stu-tab-timeline"]');
  if (tlTab) tlTab.addEventListener('shown.bs.tab', () => drawStudentTimeline(id), { once: true });
  // Keyboard navigation
  const onKey = (e) => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'ArrowRight') { navigateStudent(id, -1); }
    else if (e.key === 'ArrowLeft') { navigateStudent(id, 1); }
  };
  document.addEventListener('keydown', onKey);
  modalEl.addEventListener('hidden.bs.modal', () => document.removeEventListener('keydown', onKey), { once: true });
}

async function saveStudentProfile(studentId) {
  const obj = {
    'מזהה': studentId,
    'דוח_אישי': document.getElementById('sp-report').value.trim(),
    'פרופיל_הורים': document.getElementById('sp-parents').value.trim(),
    'פרופיל_אישיות': document.getElementById('sp-personality').value.trim(),
    'פרופיל_התנהגותי': document.getElementById('sp-behavior').value.trim(),
    'פרופיל_לימודי': document.getElementById('sp-learning').value.trim(),
  };
  const r = await api('updateStudent', [obj]);
  if (r.ok) notify('הפרופיל נשמר ומסונכרן לשיטס', 'success');
  else alert(r.error || 'שגיאה');
}

async function drawStudentTimeline(studentId) {
  const el = document.getElementById('stu-timeline-content');
  if (!el) return;
  const data = getVisibleData();
  const items = [];
  // Behavior
  (data.behavior||[]).filter(e => String(e['תלמיד_מזהה']) === String(studentId)).forEach(e => {
    items.push({
      date: e['תאריך'],
      type: 'התנהגות',
      icon: 'bi-clipboard-check',
      color: e['חומרה']==='גבוהה'?'danger':e['חומרה']==='נמוכה'?'success':'warning',
      title: e['קטגוריה'] || 'אירוע',
      body: e['תיאור'] || '',
      extra: e['דווח_עי'] ? `דווח ע"י ${e['דווח_עי']}` : '',
    });
  });
  // Tests
  (data.tests||[]).filter(t => String(t['תלמיד_מזהה']) === String(studentId)).forEach(t => {
    if (!t['תאריך']) return;
    const score = parseFloat(t['ציון']) || 0;
    items.push({
      date: t['תאריך'],
      type: 'מבחן',
      icon: 'bi-pencil-square',
      color: score >= 85 ? 'success' : score >= 70 ? 'warning' : 'danger',
      title: `${t['סוג']||''} · ${t['פרשה']||''}`,
      body: `ציון: ${score}`,
      extra: '',
    });
  });
  // Functioning
  (data.functioning||[]).filter(f => String(f['תלמיד_מזהה']) === String(studentId)).slice(0, 50).forEach(f => {
    items.push({
      date: f['תאריך'],
      type: 'תפקוד',
      icon: 'bi-bar-chart-line',
      color: 'info',
      title: `${f['קטגוריה']||''}: ${f['פרמטר']||''}`,
      body: `ציון: ${f['ציון']||'-'} (${f['תקופה']||''})`,
      extra: '',
    });
  });
  // Meetings
  (data.meetings||[]).filter(m => String(m['תלמיד_מזהה']) === String(studentId)).forEach(m => {
    const extras = [];
    if (m['רב']) extras.push(`רב: ${m['רב']}`);
    if (m['משתתפים']) extras.push(`משתתפים: ${m['משתתפים']}`);
    items.push({
      date: m['תאריך'],
      type: 'אסיפה',
      icon: 'bi-people-fill',
      color: 'primary',
      title: m['נושא'] || 'אסיפת הורים',
      body: m['סיכום'] || '',
      extra: extras.join(' · '),
    });
  });
  // Conversations with student
  (data.conversations||[]).filter(c => String(c['תלמיד_מזהה']) === String(studentId)).forEach(c => {
    const tags = [];
    if (c['רב']) tags.push(`רב: ${c['רב']}`);
    if (c['קטגוריה']) tags.push(c['קטגוריה']);
    if (c['אירוע_מקושר']) tags.push(`אירוע #${c['אירוע_מקושר']}`);
    items.push({
      date: c['תאריך'],
      type: 'שיחה',
      icon: 'bi-chat-dots',
      color: 'info',
      title: c['נושא'] || 'שיחה עם תלמיד',
      body: c['תוכן'] || '',
      extra: tags.join(' · '),
    });
  });
  // Attendance
  (data.attendance||[]).filter(a => String(a['תלמיד_מזהה']) === String(studentId)).slice(0, 50).forEach(a => {
    if (!a['תאריך']) return;
    items.push({
      date: a['תאריך'],
      type: 'נוכחות',
      icon: 'bi-check2-square',
      color: a['סטטוס']==='נוכח'?'success':a['סטטוס']==='איחור'?'info':'warning',
      title: a['סטטוס'] || '',
      body: '',
      extra: '',
    });
  });
  // Medication updates
  (data.medications||[]).filter(m => String(m['תלמיד_מזהה']) === String(studentId)).forEach(m => {
    items.push({
      date: m['תאריך_עדכון'],
      type: 'רפואי',
      icon: 'bi-capsule',
      color: 'secondary',
      title: m['תרופה'] || 'מעקב רפואי',
      body: m['מצב_כיום'] || m['שיחת_הורים'] || '',
      extra: '',
    });
  });

  items.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
  if (!items.length) {
    el.innerHTML = '<p class="text-muted text-center py-3">אין נתונים בטיים-ליין</p>';
    return;
  }
  el.innerHTML = `<div class="timeline">${items.slice(0, 100).map(item => {
    const dt = item.date ? formatDateBoth(item.date) : '?';
    return `<div class="d-flex gap-2 align-items-start py-2 border-bottom">
      <i class="bi ${item.icon} text-${item.color}" style="font-size:1.25rem;margin-top:.15rem"></i>
      <div class="flex-grow-1">
        <div class="d-flex justify-content-between align-items-center">
          <strong>${escHtml(item.title)}</strong>
          <small class="text-muted">${escHtml(dt)} · ${escHtml(item.type)}</small>
        </div>
        ${item.body ? `<div class="small mt-1" style="white-space:pre-wrap">${escHtml(item.body)}</div>` : ''}
        ${item.extra ? `<div class="small text-muted mt-1">${escHtml(item.extra)}</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

function drawStudentTrendChart(studentId, events) {
  const el = document.getElementById('stu-trend-chart');
  if (!el || typeof Chart === 'undefined') return;
  const data = getVisibleData();
  const tests = (data.tests||[]).filter(t => String(t['תלמיד_מזהה']) === String(studentId));
  const funcs = (data.functioning||[]).filter(f => String(f['תלמיד_מזהה']) === String(studentId));
  // 90-day rolling window of all 3 datasets
  const DAYS = 60;
  const labels = [], evCounts = [], testScores = [], funcScores = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    labels.push(d.toLocaleDateString('he-IL', {day:'numeric', month:'numeric'}));
    evCounts.push(events.filter(e => {
      const ed = new Date(e['תאריך']); return ed.toDateString() === d.toDateString();
    }).length);
    const tToday = tests.filter(t => { const td = new Date(t['תאריך']||0); return td.toDateString() === d.toDateString(); });
    testScores.push(tToday.length ? tToday.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / tToday.length : null);
    const fToday = funcs.filter(f => { const fd = new Date(f['תאריך']||0); return fd.toDateString() === d.toDateString(); });
    funcScores.push(fToday.length ? fToday.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / fToday.length * 20 : null);  // scale 1-5 → 20-100
  }
  if (window._stuChart) window._stuChart.destroy();
  window._stuChart = new Chart(el, {
    data: {
      labels,
      datasets: [
        { type: 'bar', label: 'אירועי התנהגות', data: evCounts, backgroundColor: 'rgba(220,38,38,0.6)', yAxisID: 'yLeft' },
        { type: 'line', label: 'מבחנים', data: testScores, borderColor: '#0066cc', backgroundColor: 'rgba(0,102,204,0.1)', yAxisID: 'yRight', spanGaps: true, tension: 0.3 },
        { type: 'line', label: 'תפקוד (×20)', data: funcScores, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', yAxisID: 'yRight', spanGaps: true, tension: 0.3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } } },
      scales: {
        yLeft: { type: 'linear', position: 'right', beginAtZero: true, ticks: { stepSize: 1, font: { size: 9 } }, title: { display: false } },
        yRight: { type: 'linear', position: 'left', beginAtZero: true, max: 100, ticks: { font: { size: 9 } }, grid: { drawOnChartArea: false } },
        x: { ticks: { font: { size: 9 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
      },
    },
  });
}

function editStudent(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  addStudentModal();
  const modalEl = document.getElementById('addStudentModal');
  const populate = () => {
    document.getElementById('ns-fname').value = s['שם פרטי']||'';
    document.getElementById('ns-lname').value = s['שם משפחה']||'';
    document.getElementById('ns-age').value = s['גיל']||'';
    const cycleSelect = document.getElementById('ns-cycle');
    const cur = s['מחזור']||'';
    if (cur && cycleSelect && !cycleSelect.querySelector(`option[value="${CSS.escape(cur)}"]`)) {
      const opt = document.createElement('option');
      opt.value = cur; opt.textContent = cur + ' (לא ברשימה)';
      cycleSelect.appendChild(opt);
    }
    if (cycleSelect) cycleSelect.value = cur;
    document.getElementById('ns-mname').value = s['שם אם']||'';
    document.getElementById('ns-mphone').value = s['טלפון אם']||'';
    document.getElementById('ns-fname2').value = s['שם אב']||'';
    document.getElementById('ns-fphone').value = s['טלפון אב']||'';
    document.getElementById('ns-addr').value = s['כתובת']||'';
    modalEl.dataset.editId = id;
    const headerH5 = modalEl.querySelector('.modal-header h5');
    if (headerH5) headerH5.innerHTML = '<i class="bi bi-pencil"></i> עריכת תלמיד';
  };
  modalEl.addEventListener('shown.bs.modal', populate, { once: true });
}

async function deleteStudent(id) {
  if (!confirm('בטוח למחוק את התלמיד?')) return;
  const r = await api('deleteStudent', [id]);
  if (r && !r.ok) return alert(r.error || 'שגיאה במחיקה');
  renderStudents();
  loadStats();
}

async function addEventForStudent(studentId, existingEvent) {
  const s = _students.find(x => String(x['מזהה']) === String(studentId));
  if (!s) return;
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const cats = ((await api('listCategories', [])).data || []);
  const e = existingEvent || {};
  const html = `<div class="modal fade" id="stu-ev-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-clipboard-check"></i> ${existingEvent ? 'עריכת' : 'אירוע חדש —'} ${escHtml(fullName)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">קטגוריה</label>
        <select id="sev-cat" class="form-select">
          ${cats.map(c => `<option ${c['קטגוריה']===e['קטגוריה']?'selected':''}>${escHtml(c['קטגוריה'])}</option>`).join('')}
        </select>
      </div>
      <div class="mb-2">
        <label class="form-label">תבניות מהירות</label>
        <div class="d-flex flex-wrap gap-1">
          ${[
            ['איחור לתפילה','התנהגות','נמוכה'],
            ['דיבור בתפילה','תפילה','בינונית'],
            ['שיחה עם הורים','דיבור עם הורים','בינונית'],
            ['התנהגות מצוינת','חינוך','נמוכה'],
            ['קושי לימודי','לימודים','בינונית'],
            ['אירוע חמור','התנהגות','גבוהה'],
          ].map(([txt,cat,sev]) => `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="applyQuickTemplate('${txt}','${cat}','${sev}')">${txt}</button>`).join('')}
        </div>
      </div>
      <div class="mb-2"><label class="form-label">תיאור</label><textarea id="sev-desc" class="form-control" rows="4">${escHtml(e['תיאור']||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">חומרה</label>
        <select id="sev-sev" class="form-select">
          <option ${e['חומרה']==='נמוכה'?'selected':''}>נמוכה</option>
          <option ${(!e['חומרה']||e['חומרה']==='בינונית')?'selected':''}>בינונית</option>
          <option ${e['חומרה']==='גבוהה'?'selected':''}>גבוהה</option>
        </select>
      </div>
      <div class="mb-2"><label class="form-label">שיעור (אופציונלי)</label><input id="sev-lesson" class="form-control" value="${escHtml(e['שיעור']||'')}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveEventForStudent(${studentId}, ${existingEvent ? e['מזהה'] : 'null'})"><i class="bi bi-check"></i> שמור</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('stu-ev-modal');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  const m = new bootstrap.Modal(document.getElementById('stu-ev-modal'));
  m.show();
  document.getElementById('stu-ev-modal').addEventListener('hidden.bs.modal', ev => ev.target.remove());
}

async function editEventInStudent(eventId, studentId) {
  const events = (await api('listBehavior', [])).data || [];
  const ev = events.find(e => String(e['מזהה']) === String(eventId));
  if (!ev) return alert('האירוע לא נמצא');
  addEventForStudent(studentId, ev);
}

async function deleteEventInStudent(eventId, studentId) {
  if (!confirm('בטוח למחוק את האירוע?')) return;
  const r = await api('deleteBehavior', [eventId]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  if (typeof toast === 'function') toast('האירוע נמחק', 'success');
  // Refresh the student card modal
  const old = document.getElementById('viewStuModal');
  if (old) bootstrap.Modal.getInstance(old).hide();
  setTimeout(() => viewStudent(studentId), 250);
  loadStats();
}

async function addConversationForStudent(studentId, existingConv) {
  const s = _students.find(x => String(x['מזהה']) === String(studentId));
  if (!s) return;
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const c = existingConv || {};
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const defaultRabbi = c['רב'] || sess.username || '';
  // Load this student's recent behavior events for the "linked event" dropdown
  const allEvents = (await api('listBehavior', [])).data || [];
  const studentEvents = allEvents
    .filter(e => String(e['תלמיד_מזהה']) === String(studentId))
    .sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0))
    .slice(0, 30);
  const cats = (typeof CONV_CATEGORIES !== 'undefined') ? CONV_CATEGORIES : ['שיחה אישית','חיזוק','מעקב','גבולות','רגשי','לימודי','התנהגותי','חברתי','מצב משפחתי','אחר'];
  const templates = (typeof CONV_TEMPLATES !== 'undefined') ? CONV_TEMPLATES : [
    ['חיזוק חיובי','חיזוק','שיחה לחיזוק על '],
    ['שיחה אישית','שיחה אישית',''],
    ['מעקב אחרי אירוע','מעקב','בעקבות האירוע: '],
    ['קביעת גבולות','גבולות','שיחה בנושא גבולות: '],
  ];
  const html = `<div class="modal fade" id="stu-conv-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-chat-dots"></i> ${existingConv ? 'עריכת שיחה —' : 'שיחה חדשה עם'} ${escHtml(fullName)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2 mb-2">
        <div class="col-md-4"><label class="form-label">תאריך</label><input id="scv-date" type="date" class="form-control" value="${c['תאריך'] ? String(c['תאריך']).slice(0,10) : new Date().toISOString().slice(0,10)}"></div>
        <div class="col-md-4"><label class="form-label">רב</label><input id="scv-rabbi" class="form-control" value="${escHtml(defaultRabbi)}"></div>
        <div class="col-md-4"><label class="form-label">קטגוריה</label>
          <select id="scv-cat" class="form-select">
            <option value="">—</option>
            ${cats.map(cat => `<option ${c['קטגוריה']===cat?'selected':''}>${escHtml(cat)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="mb-2"><label class="form-label">אירוע התנהגות מקושר (אופציונלי)</label>
        <select id="scv-linked" class="form-select">
          <option value="">— ללא —</option>
          ${studentEvents.map(ev => {
            const dt = ev['תאריך'] ? formatGreg(ev['תאריך']) : '';
            const txt = `${dt} · ${ev['קטגוריה']||''}${ev['חומרה']?' ('+ev['חומרה']+')':''}`;
            const sel = String(c['אירוע_מקושר']||'') === String(ev['מזהה']) ? ' selected' : '';
            return `<option value="${ev['מזהה']}"${sel}>${escHtml(txt)}</option>`;
          }).join('')}
        </select>
      </div>
      <div class="mb-2">
        <label class="form-label">תבניות מהירות</label>
        <div class="d-flex flex-wrap gap-1">
          ${templates.map(([lbl, cat, txt]) => `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="stuConvApplyTemplate('${escHtml(lbl)}','${escHtml(cat)}','${escHtml(txt)}')">${escHtml(lbl)}</button>`).join('')}
        </div>
      </div>
      <div class="mb-2"><label class="form-label">נושא</label><input id="scv-topic" class="form-control" value="${escHtml(c['נושא']||'')}" placeholder="כותרת קצרה"></div>
      <div class="mb-2">
        <div class="d-flex justify-content-between align-items-center">
          <label class="form-label">תוכן השיחה</label>
          <button type="button" class="btn btn-sm btn-outline-primary" id="scv-mic-btn" onclick="stuConvToggleMic()" title="הכתבה קולית"><i class="bi bi-mic"></i> הכתבה</button>
        </div>
        <textarea id="scv-content" class="form-control" rows="6">${escHtml(c['תוכן']||'')}</textarea>
      </div>
      <div class="mb-2"><label class="form-label">הערות</label><textarea id="scv-notes" class="form-control" rows="2">${escHtml(c['הערות']||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveConversationForStudent(${studentId}, ${existingConv ? c['מזהה'] : 'null'})"><i class="bi bi-check"></i> שמור</button>
    </div>
  </div></div></div>`;
  cleanupModal('stu-conv-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const m = new bootstrap.Modal(document.getElementById('stu-conv-modal'));
  m.show();
  document.getElementById('stu-conv-modal').addEventListener('hidden.bs.modal', () => { stuConvStopMic(); cleanupModal('stu-conv-modal'); }, { once: true });
}

function stuConvApplyTemplate(label, category, text) {
  const catSel = document.getElementById('scv-cat');
  if (catSel && category) catSel.value = category;
  const topic = document.getElementById('scv-topic');
  if (topic && !topic.value.trim()) topic.value = label;
  const content = document.getElementById('scv-content');
  if (content && text) {
    if (content.value.trim()) content.value = content.value + '\n' + text;
    else content.value = text;
    content.focus();
    content.selectionStart = content.selectionEnd = content.value.length;
  }
}

let _stuConvRecog = null;
let _stuConvRecogActive = false;

function stuConvToggleMic() {
  if (_stuConvRecogActive) return stuConvStopMic();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { notify('הדפדפן לא תומך בהכתבה קולית — נסה Chrome', 'warn'); return; }
  const recog = new SR();
  recog.lang = 'he-IL';
  recog.continuous = true;
  recog.interimResults = true;
  const ta = document.getElementById('scv-content');
  const baseText = ta.value;
  let finalSoFar = '';
  recog.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalSoFar += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    ta.value = (baseText ? baseText + (baseText.endsWith(' ')||baseText.endsWith('\n')?'':' ') : '') + finalSoFar + interim;
  };
  recog.onerror = e => { notify('שגיאה בהכתבה: ' + e.error, 'error'); stuConvStopMic(); };
  recog.onend = () => { if (_stuConvRecogActive) { try { recog.start(); } catch {} } };
  try { recog.start(); } catch { notify('לא ניתן להפעיל מיקרופון', 'error'); return; }
  _stuConvRecog = recog;
  _stuConvRecogActive = true;
  const btn = document.getElementById('scv-mic-btn');
  if (btn) { btn.classList.remove('btn-outline-primary'); btn.classList.add('btn-danger'); btn.innerHTML = '<i class="bi bi-mic-fill"></i> עצור'; }
}

function stuConvStopMic() {
  _stuConvRecogActive = false;
  if (_stuConvRecog) { try { _stuConvRecog.stop(); } catch {} _stuConvRecog = null; }
  const btn = document.getElementById('scv-mic-btn');
  if (btn) { btn.classList.remove('btn-danger'); btn.classList.add('btn-outline-primary'); btn.innerHTML = '<i class="bi bi-mic"></i> הכתבה'; }
}

async function saveConversationForStudent(studentId, editId) {
  stuConvStopMic();
  const dateStr = document.getElementById('scv-date').value;
  const obj = {
    'תלמיד_מזהה': parseInt(studentId),
    'תאריך': dateStr,
    'רב': document.getElementById('scv-rabbi').value.trim(),
    'קטגוריה': document.getElementById('scv-cat').value,
    'נושא': document.getElementById('scv-topic').value.trim(),
    'תוכן': document.getElementById('scv-content').value.trim(),
    'הערות': document.getElementById('scv-notes').value.trim(),
    'אירוע_מקושר': document.getElementById('scv-linked').value,
  };
  if (!obj['רב']) {
    const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
    obj['רב'] = sess.username || 'לא ידוע';
  }
  if (dateStr) {
    if (typeof formatHebrewShort === 'function') obj['תאריך_עברי'] = formatHebrewShort(dateStr);
    if (typeof getParshaFor === 'function') obj['פרשה'] = getParshaFor(dateStr);
  }
  if (editId) obj['מזהה'] = editId;
  const r = await api(editId ? 'updateConversation' : 'addConversation', [obj]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  if (typeof toast === 'function') toast(editId ? 'השיחה עודכנה' : 'השיחה נשמרה', 'success');
  hideModal('stu-conv-modal');
  const old = document.getElementById('viewStuModal');
  if (old) bootstrap.Modal.getInstance(old)?.hide();
  setTimeout(() => viewStudent(studentId), 250);
}

async function editConvInStudent(convId, studentId) {
  const list = (await api('listConversations', [])).data || [];
  const c = list.find(x => String(x['מזהה']) === String(convId));
  if (!c) return alert('השיחה לא נמצאה');
  addConversationForStudent(studentId, c);
}

async function deleteConvInStudent(convId, studentId) {
  if (!confirm('בטוח למחוק את השיחה?')) return;
  const r = await api('deleteConversation', [convId]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  if (typeof toast === 'function') toast('השיחה נמחקה', 'success');
  const old = document.getElementById('viewStuModal');
  if (old) bootstrap.Modal.getInstance(old)?.hide();
  setTimeout(() => viewStudent(studentId), 250);
}

function applyQuickTemplate(text, cat, sev) {
  const desc = document.getElementById('sev-desc');
  if (desc) {
    if (desc.value.trim()) desc.value = desc.value + '\n' + text;
    else desc.value = text;
  }
  const catSel = document.getElementById('sev-cat');
  if (catSel) {
    for (const opt of catSel.options) {
      if (opt.value === cat || opt.textContent === cat) { catSel.value = opt.value; break; }
    }
  }
  const sevSel = document.getElementById('sev-sev');
  if (sevSel) sevSel.value = sev;
}

async function saveEventForStudent(studentId, editId) {
  const s = _students.find(x => String(x['מזהה']) === String(studentId));
  if (!s) return;
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const reporter = sess.username || 'admin';
  // Bug #10 fix: only include שיעור when explicitly set, otherwise preserve existing
  const lesson = document.getElementById('sev-lesson').value.trim();
  const obj = {
    'תלמיד_מזהה': studentId,
    'שם תלמיד': (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''),
    'קטגוריה': document.getElementById('sev-cat').value,
    'תיאור': document.getElementById('sev-desc').value.trim(),
    'חומרה': document.getElementById('sev-sev').value,
  };
  if (lesson) obj['שיעור'] = lesson;
  if (!obj['קטגוריה'] || !obj['תיאור']) return alert('קטגוריה ותיאור חובה');
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    // Preserve original date & hebrew info
    const events = (await api('listBehavior', [])).data || [];
    const orig = events.find(e => String(e['מזהה']) === String(editId));
    if (orig) {
      if (orig['תאריך']) obj['תאריך'] = orig['תאריך'];
      if (orig['תאריך_עברי']) obj['תאריך_עברי'] = orig['תאריך_עברי'];
      if (orig['פרשה']) obj['פרשה'] = orig['פרשה'];
    }
    const r = await api('updateBehavior', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  } else {
    const now = new Date();
    obj['תאריך'] = now.toISOString();
    obj['דווח_עי'] = reporter;
    if (typeof getHebrewInfo === 'function') {
      const info = getHebrewInfo(now);
      obj['תאריך_עברי'] = info.hdate;
      obj['פרשה'] = info.parsha;
    }
    const r = await api('addBehavior', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  }
  hideModal('stu-ev-modal');
  if (typeof toast === 'function') toast(editId ? 'האירוע עודכן' : 'האירוע נוסף', 'success');
  // Refresh the student card to show updated events
  const oldModal = document.getElementById('viewStuModal');
  if (oldModal) bootstrap.Modal.getInstance(oldModal).hide();
  setTimeout(() => viewStudent(studentId), 250);
  loadStats();
}

async function copyParentUrl() {
  const input = document.getElementById('pl-url');
  const url = input.value;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      input.select(); input.setSelectionRange(0, url.length);
      document.execCommand('copy');
    }
    notify('הקישור הועתק', 'success');
  } catch {
    input.select();
    notify('סמן ולחץ Ctrl+C להעתקה', 'warn');
  }
}

async function shareParentPortal(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const msg = String(id) + '|BHT2026';
  const buf = new TextEncoder().encode(msg);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
  const token = hex.slice(0, 12);
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const url = `${base}parent.html?s=${id}&t=${token}`;
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const phone = (s['טלפון אם']||'').replace(/\D/g,'');
  const waUrl = phone ? `https://wa.me/${phone.startsWith('0') ? '972'+phone.slice(1) : phone}?text=${encodeURIComponent(`שלום, קישור לפורטל ההורים של ${fullName}: ${url}`)}` : '';
  const html = `<div class="modal fade" id="parent-link-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>קישור פורטל הורים — ${escHtml(fullName)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <p class="small text-muted">קישור פרטי לצפייה בלבד — ההורה יראה את הילד שלו בלבד.</p>
      <div class="input-group">
        <input id="pl-url" class="form-control" value="${escHtml(url)}" readonly>
        <button class="btn btn-primary" onclick="copyParentUrl()"><i class="bi bi-clipboard"></i> העתק</button>
      </div>
      ${waUrl ? `<div class="mt-3"><a href="${waUrl}" target="_blank" class="btn btn-success w-100"><i class="bi bi-whatsapp"></i> שלח ב-WhatsApp להורה</a></div>` : ''}
    </div>
  </div></div></div>`;
  const old = document.getElementById('parent-link-modal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('parent-link-modal')).show();
}

async function emailParentSummary(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const events = ((await api('listBehavior', [])).data || [])
    .filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const motherEmail = prompt('מייל ההורה:', s['אימייל אם'] || s['מייל אם'] || '');
  if (!motherEmail) return;
  const subject = `סיכום התנהגות — ${fullName}`;
  const lines = [`שלום,`, ``, `הנה סיכום עדכני של ${fullName}:`, ``];
  lines.push(`גיל: ${s['גיל']||'-'} | מחזור: ${s['מחזור']||'-'}`);
  lines.push(`סך כל אירועים: ${events.length} | חומרה גבוהה: ${events.filter(e=>e['חומרה']==='גבוהה').length}`);
  lines.push(``);
  if (events.length) {
    lines.push('אירועים אחרונים:');
    events.slice(0, 10).forEach(e => {
      const dt = formatDateBoth(e['תאריך']);
      lines.push(`- ${dt} | ${e['קטגוריה']||''} (${e['חומרה']||'-'}): ${e['תיאור']||''}`);
    });
  }
  lines.push(``, 'בברכה,', 'בית התלמוד · בית שמש');
  const body = lines.join('\n');
  const mailto = `mailto:${motherEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}

function exportStudentsCSV() {
  if (typeof XLSX === 'undefined') return _exportStudentsCSV();
  const cols = ['מזהה','שם פרטי','שם משפחה','גיל','תאריך לידה','מחזור','שם אם','טלפון אם','שם אב','טלפון אב','כתובת','עיר','מספר זהות','תז אב','תז אם','הערות'];
  const rows = _students.map(s => {
    const r = {};
    cols.forEach(c => r[c] = s[c] || '');
    return r;
  });
  const ws = XLSX.utils.json_to_sheet(rows, { header: cols });
  ws['!cols'] = cols.map(c => ({ wch: Math.max(10, c.length + 2) }));
  ws['!rtl'] = true;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'תלמידים');
  XLSX.writeFile(wb, `תלמידים_${new Date().toISOString().slice(0,10)}.xlsx`);
}

function _exportStudentsCSV() {
  let csv = '﻿';
  const cols = ['מזהה','שם פרטי','שם משפחה','גיל','תאריך לידה','מחזור','שם אם','טלפון אם','שם אב','טלפון אב','כתובת','הערות'];
  csv += cols.join(',') + '\n';
  _students.forEach(s => {
    csv += cols.map(f => `"${(s[f]||'').toString().replace(/"/g,'""')}"`).join(',') + '\n';
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
    const text = (await file.text()).replace(/^﻿/, '');
    const rows = parseCSV(text);
    if (rows.length < 2) return alert('הקובץ ריק או לא תקין');
    const headers = rows[0].map(h => h.trim());
    let added = 0;
    let maxId = _students.reduce((m,s) => Math.max(m, parseInt(s['מזהה'])||0), 0);
    for (let i = 1; i < rows.length; i++) {
      const values = rows[i];
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

// Bug #6 fix: streaming CSV parser that handles quoted multi-line fields
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(cur); cur = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i+1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some(v => v !== '')) rows.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some(v => v !== '')) rows.push(row); }
  return rows;
}

// Legacy helper kept for single-line use
function parseCSVLine(line) {
  const rows = parseCSV(line);
  return rows[0] || [];
}

function printStudentReport(id) {
  const s = _students.find(x => String(x['מזהה']) === String(id));
  if (!s) return;
  const w = window.open('', '_blank');
  if (!w) { alert('הדפדפן חוסם חלונות פופ-אפ — אפשר חלון פופ-אפ לאתר ונסה שוב'); return; }
  const data = getVisibleData();
  const events = (data.behavior||[]).filter(e => String(e['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fs = (data.functioning||[]).filter(f => String(f['תלמיד_מזהה']) === String(id));
  const tests = (data.tests||[]).filter(t => String(t['תלמיד_מזהה']) === String(id));
  const meds = (data.medications||[]).filter(m => String(m['תלמיד_מזהה']) === String(id));
  const meetings = (data.meetings||[]).filter(m => String(m['תלמיד_מזהה']) === String(id));
  const att = (data.attendance||[]).filter(a => String(a['תלמיד_מזהה']) === String(id))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fullName = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
  const today = formatDateBoth(new Date());
  const hebBd = (typeof hebrewBirthday === 'function') ? hebrewBirthday(s['תאריך לידה']) : '';
  const fAvg = fs.length ? (fs.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / fs.length).toFixed(2) : '-';
  const tAvg = tests.length ? (tests.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / tests.length).toFixed(1) : '-';
  const evHigh = events.filter(e => e['חומרה']==='גבוהה').length;
  const evMid = events.filter(e => e['חומרה']==='בינונית').length;
  const evLow = events.filter(e => e['חומרה']==='נמוכה').length;
  const attPresent = att.filter(a => a['סטטוס']==='נוכח').length;
  const attAbsent = att.filter(a => a['סטטוס']==='חיסר').length;
  const attLate = att.filter(a => a['סטטוס']==='איחור').length;
  // Functioning by category
  const fnByCat = {};
  fs.forEach(f => {
    const c = f['קטגוריה'] || 'אחר';
    if (!fnByCat[c]) fnByCat[c] = { sum: 0, n: 0 };
    fnByCat[c].sum += parseFloat(f['ציון']) || 0;
    fnByCat[c].n += 1;
  });
  // Tests by type
  const testsByType = {};
  tests.forEach(t => {
    const type = t['סוג'] || 'אחר';
    if (!testsByType[type]) testsByType[type] = { sum: 0, n: 0, items: [] };
    testsByType[type].sum += parseFloat(t['ציון']) || 0;
    testsByType[type].n += 1;
    testsByType[type].items.push(t);
  });
  const titleSafe = String(fullName).replace(/[<>&"']/g,' ');

  const photoBlock = s['תמונה']
    ? `<img src="${escHtml(s['תמונה'])}" alt="" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid #0066cc">`
    : `<div style="width:80px;height:80px;border-radius:50%;background:#0066cc;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28pt;font-weight:bold">${escHtml(((s['שם פרטי']||' ')[0] + (s['שם משפחה']||' ')[0]).trim() || '?')}</div>`;

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>כרטיס תלמיד — ${titleSafe}</title>
<style>
@page{size:A4;margin:1.2cm}
body{font-family:Arial,Heebo,sans-serif;direction:rtl;color:#1f2937;font-size:10.5pt;line-height:1.5}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:8pt;margin:0 0 4pt 0;font-size:20pt}
h2{color:#1e40af;margin:18pt 0 6pt 0;font-size:13pt;border-bottom:1px solid #cbd5e1;padding-bottom:3pt;page-break-after:avoid}
h3{color:#475569;margin:12pt 0 4pt 0;font-size:11pt}
.header-bar{display:flex;align-items:center;gap:15pt;margin-bottom:8pt}
.subtitle{color:#6b7280;margin:0;font-size:10pt}
table{width:100%;border-collapse:collapse;margin:6pt 0;font-size:9.5pt}
th{background:#f3f4f6;padding:5pt;border:1px solid #d1d5db;text-align:right;white-space:nowrap}
td{padding:5pt;border:1px solid #e5e7eb;vertical-align:top}
.profile-section{background:#fafafa;border-right:3px solid #0066cc;padding:8pt 12pt;margin:6pt 0;border-radius:4px}
.profile-label{font-weight:bold;color:#0066cc;font-size:9.5pt}
.event{margin:5pt 0;padding:6pt 8pt;border-right:3px solid #0066cc;background:#f9fafb;page-break-inside:avoid}
.event.high{border-color:#dc2626;background:#fef2f2}
.event.mid{border-color:#f59e0b;background:#fffbeb}
.event.low{border-color:#16a34a;background:#f0fdf4}
.event-meta{color:#6b7280;font-size:8.5pt;margin-bottom:3pt}
.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6pt;margin:8pt 0}
.kpi{background:#eff6ff;padding:6pt;border-radius:4px;text-align:center}
.kpi strong{font-size:14pt;color:#0066cc;display:block}
.kpi-label{font-size:8pt;color:#6b7280}
.print-btn{background:#0066cc;color:#fff;border:none;padding:8pt 16pt;border-radius:6px;cursor:pointer;font-size:11pt;margin-bottom:10pt}
@media print{.no-print{display:none!important}}
</style></head><body>
<button class="no-print print-btn" onclick="window.print()">🖨 הדפס / שמור PDF</button>
<div class="header-bar">
  ${photoBlock}
  <div>
    <h1>${escHtml(fullName)}</h1>
    <p class="subtitle">כיתה ${escHtml(s['מחזור']||'-')} · גיל ${escHtml(s['גיל']||'-')} · ת.ז ${escHtml(s['מספר זהות']||'-')}</p>
    <p class="subtitle">בית התלמוד · בית שמש · ${escHtml(today)}</p>
  </div>
</div>

<h2>פרטים אישיים</h2>
<table>
  <tr><th>שם פרטי</th><td>${escHtml(s['שם פרטי']||'-')}</td><th>שם משפחה</th><td>${escHtml(s['שם משפחה']||'-')}</td></tr>
  <tr><th>תאריך לידה</th><td>${escHtml(formatGreg(s['תאריך לידה'])||'-')}${hebBd ? `<br><small style="color:#6b7280">${escHtml(hebBd)}</small>` : ''}</td><th>גיל</th><td>${escHtml(s['גיל']||'-')}</td></tr>
  <tr><th>מספר זהות</th><td>${escHtml(s['מספר זהות']||'-')}</td><th>מחזור / כיתה</th><td>${escHtml(s['מחזור']||'-')}</td></tr>
  <tr><th>שם אם</th><td>${escHtml(s['שם אם']||'-')}</td><th>ת.ז. אם</th><td>${escHtml(s['תז אם']||'-')}</td></tr>
  <tr><th>טלפון אם</th><td>${escHtml(s['טלפון אם']||'-')}</td><th>טלפון בית</th><td>${escHtml(s['טלפון בית']||'-')}</td></tr>
  <tr><th>שם אב</th><td>${escHtml(s['שם אב']||'-')}</td><th>ת.ז. אב</th><td>${escHtml(s['תז אב']||'-')}</td></tr>
  <tr><th>טלפון אב</th><td>${escHtml(s['טלפון אב']||'-')}</td><th>עיר</th><td>${escHtml(s['עיר']||'-')}</td></tr>
  <tr><th>כתובת</th><td colspan="3">${escHtml(s['כתובת']||'-')}</td></tr>
  ${s['הערות'] ? `<tr><th>הערות</th><td colspan="3">${escHtml(s['הערות'])}</td></tr>` : ''}
</table>

<div class="kpi-grid">
  <div class="kpi"><strong>${events.length}</strong><div class="kpi-label">אירועים</div></div>
  <div class="kpi"><strong style="color:#dc2626">${evHigh}</strong><div class="kpi-label">חומרה גבוהה</div></div>
  <div class="kpi"><strong>${fAvg}</strong><div class="kpi-label">ממוצע תפקוד</div></div>
  <div class="kpi"><strong>${tAvg}</strong><div class="kpi-label">ממוצע מבחנים</div></div>
</div>

${(s['דוח_אישי'] || s['פרופיל_הורים'] || s['פרופיל_אישיות'] || s['פרופיל_התנהגותי'] || s['פרופיל_לימודי']) ? '<h2>פרופיל אישי</h2>' : ''}
${s['דוח_אישי'] ? `<div class="profile-section"><div class="profile-label">דוח אישי</div>${escHtml(s['דוח_אישי']).replace(/\n/g,'<br>')}</div>` : ''}
${s['פרופיל_הורים'] ? `<div class="profile-section"><div class="profile-label">הורים</div>${escHtml(s['פרופיל_הורים']).replace(/\n/g,'<br>')}</div>` : ''}
${s['פרופיל_אישיות'] ? `<div class="profile-section"><div class="profile-label">אישיות</div>${escHtml(s['פרופיל_אישיות']).replace(/\n/g,'<br>')}</div>` : ''}
${s['פרופיל_התנהגותי'] ? `<div class="profile-section"><div class="profile-label">התנהגותי</div>${escHtml(s['פרופיל_התנהגותי']).replace(/\n/g,'<br>')}</div>` : ''}
${s['פרופיל_לימודי'] ? `<div class="profile-section"><div class="profile-label">לימודי</div>${escHtml(s['פרופיל_לימודי']).replace(/\n/g,'<br>')}</div>` : ''}

<h2>היסטוריית התנהגות (${events.length})</h2>
${events.length ? events.map(e => {
  const c = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
  const rep = e['דווח_עי'] ? ` · ${escHtml(e['דווח_עי'])}` : '';
  const dt = formatDateBoth(e['תאריך']);
  const parsha = e['פרשה'] ? ` · פר' ${escHtml(e['פרשה'])}` : '';
  return `<div class="event ${c}"><div class="event-meta"><strong>${escHtml(e['קטגוריה']||'')}</strong> · ${escHtml(dt)}${parsha} · חומרה ${escHtml(e['חומרה']||'')}${rep}</div>${escHtml(e['תיאור']||'')}${e['הערות']?`<br><em style="color:#6b7280">הערה: ${escHtml(e['הערות'])}</em>`:''}</div>`;
}).join('') : '<p style="color:#6b7280">אין אירועים מתועדים</p>'}

${Object.keys(fnByCat).length ? `<h2>ציוני תפקוד — ממוצעים</h2><table><tr><th>קטגוריה</th><th>ממוצע</th><th>מספר ציונים</th></tr>${Object.entries(fnByCat).sort((a,b) => (b[1].sum/b[1].n) - (a[1].sum/a[1].n)).map(([c, d]) => `<tr><td>${escHtml(c)}</td><td><strong>${(d.sum/d.n).toFixed(2)}</strong></td><td>${d.n}</td></tr>`).join('')}</table>` : ''}

${Object.keys(testsByType).length ? `<h2>מבחנים</h2><table><tr><th>סוג</th><th>ממוצע</th><th>מספר מבחנים</th></tr>${Object.entries(testsByType).map(([t, d]) => `<tr><td>${escHtml(t)}</td><td><strong>${(d.sum/d.n).toFixed(1)}</strong></td><td>${d.n}</td></tr>`).join('')}</table>` : ''}

${tests.length ? `<h3>פירוט ציוני מבחנים</h3><table><tr><th>סוג</th><th>פרשה</th><th>ציון</th><th>תאריך</th></tr>${tests.slice(0, 50).map(t => `<tr><td>${escHtml(t['סוג']||'')}</td><td>${escHtml(t['פרשה']||'')}</td><td><strong>${t['ציון']||'-'}</strong></td><td>${escHtml(formatDateBoth(t['תאריך'])||'-')}</td></tr>`).join('')}</table>` : ''}

${meds.length ? `<h2>מעקב רפואי / כדורים</h2>${meds.map(m => `<div class="event"><div class="event-meta">${m['תרופה'] ? `<strong>${escHtml(m['תרופה'])}</strong> · ` : ''}${escHtml(formatDateBoth(m['תאריך_עדכון'])||'-')}</div>${m['מצב_כיום'] ? `<strong>מצב כיום:</strong> ${escHtml(m['מצב_כיום'])}<br>` : ''}${m['שיחת_הורים'] ? `<strong>שיחת הורים:</strong> ${escHtml(m['שיחת_הורים'])}` : ''}${m['הערות'] ? `<br><em>${escHtml(m['הערות'])}</em>` : ''}</div>`).join('')}` : ''}

${meetings.length ? `<h2>אסיפות הורים</h2>${meetings.map(m => `<div class="event"><div class="event-meta"><strong>${escHtml(m['נושא']||'פגישה')}</strong> · ${escHtml(formatDateBoth(m['תאריך'])||'')}${m['תקופה']?` · ${escHtml(m['תקופה'])}`:''}</div>${m['משתתפים'] ? `<strong>משתתפים:</strong> ${escHtml(m['משתתפים'])}<br>` : ''}${escHtml(m['סיכום']||'')}${m['הערות']?`<br><em style="color:#6b7280">${escHtml(m['הערות'])}</em>`:''}</div>`).join('')}` : ''}

${att.length ? `<h2>נוכחות</h2><table><tr><th>נוכחויות</th><td style="color:#16a34a"><strong>${attPresent}</strong></td><th>חיסור</th><td style="color:#f59e0b">${attAbsent}</td><th>איחורים</th><td style="color:#0891b2">${attLate}</td><th>אחוז נוכחות</th><td><strong>${att.length ? Math.round(attPresent/att.length*100) : 0}%</strong></td></tr></table>${att.slice(0, 30).length ? `<h3>30 הרישומים האחרונים</h3><table><tr><th>תאריך</th><th>סטטוס</th></tr>${att.slice(0, 30).map(a => `<tr><td>${escHtml(formatDateBoth(a['תאריך'])||'')}</td><td>${escHtml(a['סטטוס']||'')}</td></tr>`).join('')}</table>` : ''}` : ''}

<p style="margin-top:20pt;color:#6b7280;font-size:9pt;border-top:1px solid #e5e7eb;padding-top:8pt">דוח מלא · בית התלמוד · בית שמש · ${escHtml(today)}</p>
<script>
const _doPrint = () => window.print();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => setTimeout(_doPrint, 200));
} else {
  window.addEventListener('load', () => setTimeout(_doPrint, 600));
}
</script>
</body></html>`;
  w.document.write(html);
  w.document.close();
}

function addStudentModal() {
  const data = getData();
  const classOpts = (data.classes||[]).slice().sort((a,b)=>parseInt(a['סדר'])-parseInt(b['סדר']))
    .map(c => `<option value="${escHtml(c['שם'])}">${escHtml(c['שם'])}</option>`).join('');
  const html = `
    <div class="modal fade" id="addStudentModal" tabindex="-1">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header"><h5><i class="bi bi-person-plus"></i> תלמיד חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body">
            <div class="row g-2">
              <div class="col-6"><label class="form-label small">שם פרטי</label><input id="ns-fname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם משפחה</label><input id="ns-lname" class="form-control"></div>
              <div class="col-4"><label class="form-label small">גיל</label><input id="ns-age" type="number" class="form-control"></div>
              <div class="col-8"><label class="form-label small">כיתה</label>
                <select id="ns-cycle" class="form-select">
                  <option value="">— בחר כיתה —</option>
                  ${classOpts}
                </select>
              </div>
              <div class="col-6"><label class="form-label small">שם אם</label><input id="ns-mname" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אם</label><input id="ns-mphone" class="form-control"></div>
              <div class="col-6"><label class="form-label small">שם אב</label><input id="ns-fname2" class="form-control"></div>
              <div class="col-6"><label class="form-label small">טלפון אב</label><input id="ns-fphone" class="form-control"></div>
              <div class="col-12"><label class="form-label small">כתובת</label><input id="ns-addr" class="form-control"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
            <button class="btn btn-primary" onclick="saveStudent()"><i class="bi bi-check"></i> שמור</button>
          </div>
        </div>
      </div>
    </div>`;
  cleanupModal('addStudentModal');
  document.body.insertAdjacentHTML('beforeend', html);
  const modalEl = document.getElementById('addStudentModal');
  new bootstrap.Modal(modalEl).show();
  modalEl.addEventListener('hidden.bs.modal', () => cleanupModal('addStudentModal'), { once: true });
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
  if (typeof validateStudent === 'function') {
    const v = validateStudent(obj);
    if (!v.ok) return alert('שגיאות validation:\n' + v.errors.join('\n'));
  } else if (!obj['שם פרטי']) return alert('שם פרטי חובה');
  const editId = document.getElementById('addStudentModal').dataset.editId;
  let r;
  if (editId) {
    obj['מזהה'] = parseInt(editId);
    r = await api('updateStudent', [obj]);
  } else {
    r = await api('addStudent', [obj]);
  }
  if (r && !r.ok) return alert(r.error || 'שגיאה בשמירה');  // Bug fix: check ok
  hideModal('addStudentModal');
  renderStudents();
  loadStats();
}
