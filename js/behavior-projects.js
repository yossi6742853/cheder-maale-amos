// behavior-projects.js — ניהול פרויקטים מקצועי במעקב התנהגות. 2026-05-21.
// פרויקט = יוזמה כללית שמכילה כמה משימות. כל פרויקט: שם, תיאור,
// סטטוס (פעיל/הושעה/הושלם), אחראי, התחלה, יעד, התקדמות %.

// Sbb 46 fix: use window._projects for cross-module access
window._projects = window._projects || [];
const _PROJ_STATUSES = ['חדש', 'בתהליך', 'הושלם'];
var _projects = window._projects;

async function renderProjectsTab(rootEl) {
  rootEl.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <div class="btn-group" role="group">
        <button class="btn btn-sm btn-outline-primary active" id="pv-cards" onclick="projSwitchView('cards')"><i class="bi bi-grid"></i> כרטיסים</button>
        <button class="btn btn-sm btn-outline-primary" id="pv-board" onclick="projSwitchView('board')"><i class="bi bi-kanban"></i> Kanban</button>
        <button class="btn btn-sm btn-outline-primary" id="pv-list" onclick="projSwitchView('list')"><i class="bi bi-list-ul"></i> רשימה</button>
      </div>
      <div class="d-flex gap-2 align-items-center">
        <select id="pf-status" class="form-select form-select-sm">
          <option value="">כל הסטטוסים</option>
          ${_PROJ_STATUSES.map(s => `<option>${escHtml(s)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="proj-container"></div>`;

  const r = await api('listProjects', []);
  _projects = window._projects = (r && r.data) ? r.data : [];

  document.getElementById('pf-status').onchange = projRedraw;
  const savedView = sessionStorage.getItem('proj_view') || 'cards';
  projSwitchView(savedView);
}

function projSwitchView(view) {
  sessionStorage.setItem('proj_view', view);
  ['cards', 'board', 'list'].forEach(v => {
    const btn = document.getElementById('pv-' + v);
    if (btn) btn.classList.toggle('active', v === view);
  });
  projRedraw();
}

function projFiltered() {
  let list = _projects.slice();
  const status = document.getElementById('pf-status').value;
  if (status) list = list.filter(p => p['סטטוס'] === status);
  list.sort((a, b) => {
    const so = { 'חדש': 0, 'בתהליך': 1, 'הושלם': 2 };
    const sa = so[a['סטטוס']] ?? 3, sb = so[b['סטטוס']] ?? 3;
    if (sa !== sb) return sa - sb;
    return new Date(b['תאריך_יצירה']||0) - new Date(a['תאריך_יצירה']||0);
  });
  return list;
}

function projRedraw() {
  const view = sessionStorage.getItem('proj_view') || 'cards';
  const list = projFiltered();
  const c = document.getElementById('proj-container');
  if (!list.length) {
    c.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-kanban fs-1"></i><p>אין פרויקטים. לחץ "פרויקט חדש" להתחלה.</p></div>';
    return;
  }
  if (view === 'cards') c.innerHTML = projCardsHtml(list);
  else if (view === 'board') c.innerHTML = projBoardHtml(list);
  else c.innerHTML = projListHtml(list);
}

function projTaskStats(projId) {
  // Tasks linked to this project — assumes optional פרויקט_מזהה column on tasks
  const linked = (_tasks || []).filter(t => String(t['פרויקט_מזהה']||'') === String(projId));
  const total = linked.length;
  const done = linked.filter(t => t['סטטוס'] === 'הושלם').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return { total, done, pct };
}

function projCardHtml(p) {
  const stats = projTaskStats(p['מזהה']);
  const sBadge = p['סטטוס'] === 'חדש' ? 'bg-info' : p['סטטוס'] === 'בתהליך' ? 'bg-warning text-dark' : p['סטטוס'] === 'הושלם' ? 'bg-success' : 'bg-secondary';
  const due = p['תאריך_יעד'] ? (typeof formatGreg === 'function' ? formatGreg(p['תאריך_יעד']) : p['תאריך_יעד']) : '';
  const overdue = p['תאריך_יעד'] && new Date(p['תאריך_יעד']) < new Date() && p['סטטוס'] !== 'הושלם';
  return `<div class="card p-3 mb-2" style="${overdue ? 'border-right:4px solid #dc2626' : ''}">
    <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
      <div class="flex-grow-1">
        <div class="d-flex gap-2 align-items-center flex-wrap mb-1">
          <h6 class="mb-0">${escHtml(p['שם']||'(ללא שם)')}</h6>
          <span class="badge ${sBadge}">${escHtml(p['סטטוס']||'פעיל')}</span>
          ${overdue ? '<span class="badge bg-danger">פג תוקף</span>' : ''}
        </div>
        ${p['תיאור'] ? `<div class="small mb-2">${escHtml(p['תיאור'])}</div>` : ''}
        <div class="d-flex gap-3 flex-wrap small text-muted">
          ${p['אחראי'] ? `<span><i class="bi bi-person"></i> ${escHtml(p['אחראי'])}</span>` : ''}
          ${due ? `<span class="${overdue?'text-danger fw-bold':''}"><i class="bi bi-calendar"></i> ${escHtml(due)}</span>` : ''}
          <span><i class="bi bi-list-check"></i> ${stats.done}/${stats.total} משימות</span>
        </div>
      </div>
      <div class="d-flex gap-1">
        <button class="btn btn-sm btn-outline-primary" onclick="projEdit(${p['מזהה']})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-success" onclick="projAddTask(${p['מזהה']})"><i class="bi bi-plus"></i> משימה</button>
        <button class="btn btn-sm btn-outline-danger" onclick="projDelete(${p['מזהה']})"><i class="bi bi-trash"></i></button>
      </div>
    </div>
    ${stats.total ? `<div class="progress mt-2" style="height:6px"><div class="progress-bar bg-success" style="width:${stats.pct}%"></div></div>` : ''}
  </div>`;
}

function projCardsHtml(list) {
  return list.map(projCardHtml).join('');
}

function projBoardHtml(list) {
  return `<div class="row g-3">` + _PROJ_STATUSES.map(status => {
    const subset = list.filter(p => p['סטטוס'] === status);
    return `<div class="col-md-4">
      <div class="card p-2" style="background:#f8fafc">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>${escHtml(status)}</strong>
          <span class="badge bg-secondary">${subset.length}</span>
        </div>
        <div>${subset.map(p => {
          const stats = projTaskStats(p['מזהה']);
          return `<div class="card p-2 mb-2" style="cursor:pointer" onclick="projEdit(${p['מזהה']})">
            <strong class="small">${escHtml(p['שם']||'')}</strong>
            ${p['אחראי']?`<div class="small text-muted"><i class="bi bi-person"></i> ${escHtml(p['אחראי'])}</div>`:''}
            ${stats.total?`<div class="progress mt-1" style="height:4px"><div class="progress-bar bg-success" style="width:${stats.pct}%"></div></div>`:''}
          </div>`;
        }).join('') || '<div class="text-muted text-center small py-3">ריק</div>'}</div>
      </div>
    </div>`;
  }).join('') + `</div>`;
}

function projListHtml(list) {
  return `<table class="table table-sm align-middle"><thead><tr><th>שם</th><th>סטטוס</th><th>אחראי</th><th>יעד</th><th>התקדמות</th><th></th></tr></thead><tbody>${
    list.map(p => {
      const stats = projTaskStats(p['מזהה']);
      const due = p['תאריך_יעד'] ? (typeof formatGreg === 'function' ? formatGreg(p['תאריך_יעד']) : p['תאריך_יעד']) : '';
      return `<tr>
        <td><strong>${escHtml(p['שם']||'')}</strong>${p['תיאור']?`<div class="small text-muted">${escHtml(p['תיאור'].substring(0,60))}</div>`:''}</td>
        <td><span class="badge bg-secondary">${escHtml(p['סטטוס']||'')}</span></td>
        <td>${escHtml(p['אחראי']||'-')}</td>
        <td>${escHtml(due)}</td>
        <td>${stats.total}<div class="progress" style="height:4px;width:80px"><div class="progress-bar bg-success" style="width:${stats.pct}%"></div></div></td>
        <td><button class="btn btn-sm btn-outline-primary" onclick="projEdit(${p['מזהה']})"><i class="bi bi-pencil"></i></button> <button class="btn btn-sm btn-outline-danger" onclick="projDelete(${p['מזהה']})"><i class="bi bi-trash"></i></button></td>
      </tr>`;
    }).join('')
  }</tbody></table>`;
}

window.addProjectModal = function(prefill) {
  const e = prefill || {};
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const html = `<div class="modal fade" id="proj-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5>${e['מזהה'] ? 'עריכת' : 'פרויקט חדש —'} פרויקט</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">שם הפרויקט</label><input id="p-name" class="form-control" value="${escHtml(e['שם']||'')}"></div>
      <div class="mb-2"><label class="form-label">תיאור</label><textarea id="p-desc" class="form-control" rows="3">${escHtml(e['תיאור']||'')}</textarea></div>
      <div class="mb-2"><label class="form-label">סוג פרויקט</label>
        <select id="p-type" class="form-select">
          <option value="כלל מכינה" ${e['סוג']==='כלל מכינה' || !e['סוג']?'selected':''}>🏛 כלל מכינה</option>
          <option value="צוות" ${e['סוג']==='צוות'?'selected':''}>👥 צוות / הנהלה</option>
          <option value="כיתה" ${e['סוג']==='כיתה'?'selected':''}>🎓 כיתה ספציפית</option>
          <option value="אירוע" ${e['סוג']==='אירוע'?'selected':''}>🎉 אירוע חד-פעמי</option>
          <option value="אחר" ${e['סוג']==='אחר'?'selected':''}>🔹 אחר</option>
        </select>
      </div>
      <div class="row g-2">
        <div class="col-md-4"><label class="form-label">סטטוס</label><select id="p-status" class="form-select">${_PROJ_STATUSES.map(s => `<option ${e['סטטוס']===s?'selected':''}>${escHtml(s)}</option>`).join('')}</select></div>
        <div class="col-md-4"><label class="form-label">אחראי</label><input id="p-owner" class="form-control" value="${escHtml(e['אחראי']||sess.username||'')}"></div>
        <div class="col-md-4"><label class="form-label">תאריך יעד</label><input id="p-due" type="date" class="form-control" value="${e['תאריך_יעד']?String(e['תאריך_יעד']).slice(0,10):''}"></div>
      </div>
      ${e['מזהה'] ? `<div class="mt-3"><h6>משימות בפרויקט (${projTaskStats(e['מזהה']).total})</h6><div class="small">
        ${(_tasks||[]).filter(t => String(t['פרויקט_מזהה']||'')===String(e['מזהה'])).map(t => `<div>• ${escHtml(t['כותרת']||'')} <span class="badge bg-${t['סטטוס']==='הושלם'?'success':'secondary'}">${escHtml(t['סטטוס']||'')}</span></div>`).join('') || '<span class="text-muted">אין משימות מקושרות</span>'}
      </div></div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="projSave(${e['מזהה']||'null'})">שמור</button>
    </div>
  </div></div></div>`;
  cleanupModal('proj-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const _m = document.getElementById('proj-modal');
  new bootstrap.Modal(_m).show();
  _m.addEventListener('hidden.bs.modal', () => cleanupModal('proj-modal'), { once: true });
};

window.projEdit = function(id) {
  const p = _projects.find(x => String(x['מזהה']) === String(id));
  if (p) addProjectModal(p);
};

window.projSave = async function(editId) {
  const obj = {
    'שם': document.getElementById('p-name').value.trim(),
    'תיאור': document.getElementById('p-desc').value.trim(),
    'סטטוס': document.getElementById('p-status').value,
    'סוג': document.getElementById('p-type')?.value || 'כלל מכינה',
    'אחראי': document.getElementById('p-owner').value.trim(),
    'תאריך_יעד': document.getElementById('p-due').value || '',
  };
  if (!obj['שם']) return alert('הזן שם לפרויקט');
  if (editId) {
    obj['מזהה'] = editId;
    const r = await api('updateProject', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  } else {
    obj['תאריך_יצירה'] = new Date().toISOString();
    const r = await api('addProject', [obj]);
    if (!r.ok) return alert(r.error || 'שגיאה');
  }
  hideModal('proj-modal');
  if (typeof toast === 'function') toast('נשמר', 'success');
  renderActiveBehaviorTab();
};

window.projDelete = async function(id) {
  if (!confirm('למחוק את הפרויקט? המשימות המקושרות יישמרו.')) return;
  const r = await api('deleteProject', [id]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  renderActiveBehaviorTab();
};

window.projAddTask = function(projId) {
  // Open task modal with project pre-linked
  if (typeof addTaskModal === 'function') {
    addTaskModal({ 'פרויקט_מזהה': projId });
  }
};
