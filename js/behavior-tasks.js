// behavior-tasks.js — ניהול משימות חכם בתוך מעקב התנהגות. נכתב 2026-05-21.
// פיצ'רים: סטטוס, עדיפות, תאריך יעד, אחראי, קישור לאירוע/תלמיד,
// יצירה אוטומטית מאירועי חומרה גבוהה, board (Kanban) view, התראות.

// Sbb 46 fix: use window._tasks for cross-module access (let creates script-scope)
window._tasks = window._tasks || [];
const _TASKS_STATUSES = ['חדש', 'בתהליך', 'הושלם'];
const _TASKS_PRIORITY = ['רגיל', 'גבוה', 'דחוף'];
// alias for local use
var _tasks = window._tasks;

async function renderTasksTab(rootEl) {
  rootEl.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div class="btn-group" role="group">
        <button class="btn btn-sm btn-outline-primary active" id="tv-board" onclick="tasksSwitchView('board')"><i class="bi bi-kanban"></i> לוח</button>
        <button class="btn btn-sm btn-outline-primary" id="tv-list" onclick="tasksSwitchView('list')"><i class="bi bi-list-ul"></i> רשימה</button>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <select id="tf-student" class="form-select form-select-sm">
          <option value="">כל התלמידים</option>
          ${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').map(s => `<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`).join('')}
        </select>
        <select id="tf-status" class="form-select form-select-sm">
          <option value="">כל הסטטוסים</option>
          ${_TASKS_STATUSES.map(s => `<option>${escHtml(s)}</option>`).join('')}
        </select>
        <select id="tf-priority" class="form-select form-select-sm">
          <option value="">כל העדיפויות</option>
          ${_TASKS_PRIORITY.map(p => `<option>${escHtml(p)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="tasks-container"></div>`;

  const r = await api('listTasks', []);
  _tasks = window._tasks = (r && r.data) ? r.data : [];

  ['tf-student','tf-status','tf-priority'].forEach(id => {
    const el = document.getElementById(id);
    el.onchange = tasksRedraw;
  });
  const savedView = sessionStorage.getItem('tasks_view') || 'board';
  tasksSwitchView(savedView, true);
}

function tasksSwitchView(view, skipRedraw) {
  sessionStorage.setItem('tasks_view', view);
  document.getElementById('tv-board').classList.toggle('active', view === 'board');
  document.getElementById('tv-list').classList.toggle('active', view === 'list');
  if (!skipRedraw) tasksRedraw();
  else tasksRedraw();
}

function tasksFiltered() {
  let list = _tasks.slice();
  const sid = document.getElementById('tf-student').value;
  const status = document.getElementById('tf-status').value;
  const priority = document.getElementById('tf-priority').value;
  if (sid) list = list.filter(t => String(t['תלמיד_מזהה']) === String(sid));
  if (status) list = list.filter(t => t['סטטוס'] === status);
  if (priority) list = list.filter(t => t['עדיפות'] === priority);
  // sort: overdue first, then by due date, then by priority
  list.sort((a, b) => {
    const aOver = tasksIsOverdue(a) && a['סטטוס'] !== 'הושלם';
    const bOver = tasksIsOverdue(b) && b['סטטוס'] !== 'הושלם';
    if (aOver !== bOver) return aOver ? -1 : 1;
    const da = a['תאריך_יעד'] ? new Date(a['תאריך_יעד']).getTime() : Infinity;
    const db = b['תאריך_יעד'] ? new Date(b['תאריך_יעד']).getTime() : Infinity;
    if (da !== db) return da - db;
    const pa = _TASKS_PRIORITY.indexOf(a['עדיפות']);
    const pb = _TASKS_PRIORITY.indexOf(b['עדיפות']);
    return pb - pa;
  });
  return list;
}

function tasksIsOverdue(t) {
  if (!t['תאריך_יעד']) return false;
  return new Date(t['תאריך_יעד']) < new Date() && t['סטטוס'] !== 'הושלם';
}

function tasksRedraw() {
  const view = sessionStorage.getItem('tasks_view') || 'board';
  const container = document.getElementById('tasks-container');
  const list = tasksFiltered();
  if (view === 'board') container.innerHTML = tasksBoardHtml(list);
  else container.innerHTML = tasksListHtml(list);
}

function tasksBoardHtml(list) {
  const stuById = {};
  _allStudents.forEach(s => stuById[s['מזהה']] = s);
  return `<div class="row g-3">` + _TASKS_STATUSES.map(status => {
    const subset = list.filter(t => t['סטטוס'] === status);
    return `<div class="col-md-4">
      <div class="card p-2" style="background:#f8fafc">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>${escHtml(status)}</strong>
          <span class="badge bg-secondary">${subset.length}</span>
        </div>
        <div class="tasks-col" data-status="${escHtml(status)}" style="min-height:120px">
          ${subset.map(t => tasksCardHtml(t, stuById)).join('') || '<div class="text-muted text-center small py-3">אין משימות</div>'}
        </div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

function tasksCardHtml(t, stuById) {
  const stu = stuById[t['תלמיד_מזהה']];
  const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
  const pColor = t['עדיפות'] === 'דחוף' ? '#fee2e2' : t['עדיפות'] === 'גבוה' ? '#fef3c7' : '#fff';
  const pBadge = t['עדיפות'] === 'דחוף' ? '<span class="badge bg-danger">דחוף</span>' :
                 t['עדיפות'] === 'גבוה' ? '<span class="badge bg-warning text-dark">גבוה</span>' : '';
  const overdue = tasksIsOverdue(t);
  const dueText = t['תאריך_יעד'] ? (typeof formatGreg === 'function' ? formatGreg(t['תאריך_יעד']) : t['תאריך_יעד']) : '';
  const dueBadge = dueText
    ? `<span class="badge ${overdue ? 'bg-danger' : 'bg-light text-dark border'}"><i class="bi bi-calendar"></i> ${escHtml(dueText)}</span>`
    : '';
  return `<div class="card p-2 mb-2" style="background:${pColor};border-right:4px solid ${overdue ? '#dc2626' : '#94a3b8'};cursor:pointer" onclick="tasksEdit(${t['מזהה']})">
    <div class="d-flex justify-content-between align-items-start gap-2">
      <strong class="small">${escHtml(t['כותרת']||'(ללא כותרת)')}</strong>
      ${pBadge}
    </div>
    ${stuName ? `<div class="small text-muted mt-1"><i class="bi bi-person"></i> ${escHtml(stuName)}</div>` : ''}
    <div class="d-flex justify-content-between align-items-center mt-2 flex-wrap gap-1">
      ${dueBadge}
      <div class="btn-group btn-group-sm">
        ${_TASKS_STATUSES.filter(s => s !== t['סטטוס']).map(s => `<button class="btn btn-outline-secondary btn-sm py-0 px-1" style="font-size:.7rem" onclick="event.stopPropagation();tasksSetStatus(${t['מזהה']},'${s}')" title="העבר ל${s}">${s.charAt(0)}</button>`).join('')}
        <button class="btn btn-outline-danger btn-sm py-0 px-1" style="font-size:.7rem" onclick="event.stopPropagation();tasksDelete(${t['מזהה']})"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  </div>`;
}

function tasksListHtml(list) {
  if (!list.length) return '<div class="text-center py-5 text-muted"><i class="bi bi-list-check fs-1"></i><p>אין משימות</p></div>';
  const stuById = {};
  _allStudents.forEach(s => stuById[s['מזהה']] = s);
  return list.map(t => {
    const stu = stuById[t['תלמיד_מזהה']];
    const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '';
    const overdue = tasksIsOverdue(t);
    const dueText = t['תאריך_יעד'] ? (typeof formatGreg === 'function' ? formatGreg(t['תאריך_יעד']) : t['תאריך_יעד']) : '';
    const statusColor = t['סטטוס'] === 'הושלם' ? 'bg-success' : t['סטטוס'] === 'בתהליך' ? 'bg-primary' : 'bg-secondary';
    const pColor = t['עדיפות'] === 'דחוף' ? 'bg-danger' : t['עדיפות'] === 'גבוה' ? 'bg-warning text-dark' : 'bg-light text-dark border';
    return `<div class="card p-3 mb-2" style="${overdue ? 'border-right:4px solid #dc2626' : ''}">
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div class="flex-grow-1">
          <div class="d-flex gap-2 align-items-center flex-wrap mb-1">
            <strong>${escHtml(t['כותרת']||'(ללא כותרת)')}</strong>
            <span class="badge ${statusColor}">${escHtml(t['סטטוס']||'חדש')}</span>
            <span class="badge ${pColor}">${escHtml(t['עדיפות']||'רגיל')}</span>
            ${overdue ? '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle"></i> פג תוקף</span>' : ''}
          </div>
          ${stuName ? `<div class="small text-muted"><i class="bi bi-person"></i> ${escHtml(stuName)}</div>` : ''}
          ${t['תיאור'] ? `<div class="mt-2 small">${escHtml(t['תיאור'])}</div>` : ''}
        </div>
        <div class="text-end" style="min-width:160px">
          ${dueText ? `<div class="small ${overdue ? 'text-danger fw-bold' : 'text-muted'}"><i class="bi bi-calendar"></i> ${escHtml(dueText)}</div>` : ''}
          ${t['אחראי'] ? `<div class="small text-muted"><i class="bi bi-person-badge"></i> ${escHtml(t['אחראי'])}</div>` : ''}
          <div class="d-flex gap-1 mt-1 justify-content-end">
            <select class="form-select form-select-sm" style="width:auto" onchange="tasksSetStatus(${t['מזהה']}, this.value)">
              ${_TASKS_STATUSES.map(s => `<option ${t['סטטוס']===s?'selected':''}>${escHtml(s)}</option>`).join('')}
            </select>
            <button class="btn btn-sm btn-outline-primary" onclick="tasksEdit(${t['מזהה']})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="tasksDelete(${t['מזהה']})"><i class="bi bi-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.addTaskModal = function(prefill) {
  const e = prefill || {};
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const defaultOwner = e['אחראי'] || sess.username || '';
  const html = `<div class="modal fade" id="task-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>${e['מזהה'] ? 'עריכת' : 'משימה חדשה —'} משימה</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">כותרת</label><input id="t-title" class="form-control" value="${escHtml(e['כותרת']||'')}"></div>
      <div class="mb-2"><label class="form-label">תיאור</label><textarea id="t-desc" class="form-control" rows="2">${escHtml(e['תיאור']||'')}</textarea></div>
      <div class="mb-2">
        <label class="form-label">סוג משימה</label>
        <select id="t-type" class="form-select">
          <option value="הנהלה" ${e['סוג']==='הנהלה'?'selected':''}>🏢 הנהלה / צוות</option>
          <option value="הוראה" ${e['סוג']==='הוראה'?'selected':''}>📚 צוות הוראה</option>
          <option value="ניהול תלמיד" ${e['סוג']==='ניהול תלמיד'?'selected':''}>👤 ניהול תלמיד</option>
          <option value="כללי" ${e['סוג']==='כללי' || !e['סוג']?'selected':''}>🔹 כללי</option>
        </select>
      </div>
      <div class="row g-2">
        <div class="col-md-6">
          <label class="form-label">תלמיד (לקישור משימה לתלמיד ספציפי, אופציונלי)</label>
          <select id="t-student" class="form-select">
            <option value="">— ללא קישור לתלמיד —</option>
            ${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').map(s => {
              const sid = s['מזהה'];
              return `<option value="${escHtml(sid)}" ${String(e['תלמיד_מזהה'])===String(sid)?'selected':''}>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="col-md-6"><label class="form-label">תאריך יעד</label><input id="t-due" type="date" class="form-control" value="${e['תאריך_יעד']?String(e['תאריך_יעד']).slice(0,10):''}"></div>
      </div>
      <div class="row g-2 mt-1">
        <div class="col-md-4">
          <label class="form-label">סטטוס</label>
          <select id="t-status" class="form-select">${_TASKS_STATUSES.map(s => `<option ${e['סטטוס']===s?'selected':''}>${escHtml(s)}</option>`).join('')}</select>
        </div>
        <div class="col-md-4">
          <label class="form-label">עדיפות</label>
          <select id="t-priority" class="form-select">${_TASKS_PRIORITY.map(p => `<option ${e['עדיפות']===p?'selected':''}>${escHtml(p)}</option>`).join('')}</select>
        </div>
        <div class="col-md-4"><label class="form-label">אחראי</label><input id="t-owner" class="form-control" value="${escHtml(defaultOwner)}"></div>
      </div>
      ${e['אירוע_מזהה'] ? `<div class="mt-2 small text-muted"><i class="bi bi-link"></i> מקושר לאירוע מספר ${e['אירוע_מזהה']}</div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="tasksSave(${e['מזהה']||'null'})">שמור</button>
    </div>
  </div></div></div>`;
  cleanupModal('task-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const _m = document.getElementById('task-modal');
  new bootstrap.Modal(_m).show();
  _m.addEventListener('hidden.bs.modal', () => cleanupModal('task-modal'), { once: true });
};

window.tasksEdit = function(id) {
  const t = _tasks.find(x => String(x['מזהה']) === String(id));
  if (t) addTaskModal(t);
};

window.tasksSave = async function(editId) {
  const obj = {
    'כותרת': document.getElementById('t-title').value.trim(),
    'תיאור': document.getElementById('t-desc').value.trim(),
    'תלמיד_מזהה': document.getElementById('t-student').value || '',
    'סוג': document.getElementById('t-type')?.value || 'כללי',
    'תאריך_יעד': document.getElementById('t-due').value || '',
    'סטטוס': document.getElementById('t-status').value,
    'עדיפות': document.getElementById('t-priority').value,
    'אחראי': document.getElementById('t-owner').value.trim(),
  };
  if (!obj['כותרת']) return alert('הזן כותרת');
  if (editId) {
    obj['מזהה'] = editId;
    const r = await api('updateTask', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  } else {
    obj['תאריך_יצירה'] = new Date().toISOString();
    const r = await api('addTask', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  }
  hideModal('task-modal');
  if (typeof toast === 'function') toast('נשמר', 'success');
  renderActiveBehaviorTab();
};

window.tasksSetStatus = async function(id, status) {
  const t = _tasks.find(x => String(x['מזהה']) === String(id));
  if (!t) return;
  t['סטטוס'] = status;
  if (status === 'הושלם' && !t['תאריך_השלמה']) t['תאריך_השלמה'] = new Date().toISOString();
  const r = await api('updateTask', [t]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  renderActiveBehaviorTab();
};

window.tasksDelete = async function(id) {
  if (!confirm('למחוק את המשימה?')) return;
  const r = await api('deleteTask', [id]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  renderActiveBehaviorTab();
};

// Called from events tab — create a follow-up task from a high-severity event
window.createTaskFromEvent_impl = async function(eventId) {
  const ev = _events.find(e => String(e['מזהה']) === String(eventId));
  if (!ev) return alert('אירוע לא נמצא');
  const prefill = {
    'כותרת': `מעקב אחרי ${ev['קטגוריה']||''} — ${ev['שם תלמיד']||''}`,
    'תיאור': `אירוע התנהגות מ-${ev['תאריך']?new Date(ev['תאריך']).toLocaleDateString('he-IL'):''}: ${ev['תיאור']||''}`,
    'תלמיד_מזהה': ev['תלמיד_מזהה'] || '',
    'עדיפות': 'גבוה',
    'סטטוס': 'חדש',
    'אירוע_מזהה': ev['מזהה'],
    'תאריך_יעד': new Date(Date.now() + 3*24*3600*1000).toISOString().slice(0,10),  // due in 3 days
  };
  // If we're already on tasks tab, open modal directly; else switch first
  if (_activeBehaviorTab !== 'tasks') {
    switchBehaviorTab('tasks');
    setTimeout(() => addTaskModal(prefill), 400);
  } else {
    addTaskModal(prefill);
  }
};
