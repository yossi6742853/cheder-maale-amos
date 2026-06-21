// behavior-v2.js — task details + project details + permissions + audit
// 2026-05-24. Per-item ACL stored in 'הרשאות' JSON field.

function parseJsonField(v) { if(!v) return null; try { return typeof v==='string'?JSON.parse(v):v; } catch { return null; } }

window.userHasPerm = function(item, level) {
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  if (!sess.username) return false;
  if (sess.role === 'מנהל' || sess.permissions === 'all') return true;
  const acl = parseJsonField(item && item['הרשאות']);
  if (!acl) return level === 'view';
  const lvls = ['view','comment','edit','admin'];
  const cur = (acl.users||{})[sess.username] || (acl.roles||{})[sess.role] || 'view';
  return lvls.indexOf(cur) >= lvls.indexOf(level);
};
window.canEdit = i => userHasPerm(i,'edit');
window.canAdmin = i => userHasPerm(i,'admin');

window.auditLog = function(action, entity, id, details) {
  try {
    const sess = JSON.parse(sessionStorage.getItem('user')||'{}');
    let log = JSON.parse(localStorage.getItem('bht_audit_log')||'[]');
    log.unshift({ts:new Date().toISOString(), user:sess.username||'anon', action, entity, entityId:id, details:String(details||'').substring(0,200)});
    localStorage.setItem('bht_audit_log', JSON.stringify(log.slice(0,200)));
  } catch(_) {}
};
window.viewAuditLog = () => { console.table(JSON.parse(localStorage.getItem('bht_audit_log')||'[]')); };

// =============== TASK DETAILS MODAL ===============
window.renderTaskDetails = function(taskId) {
  const t = (window._tasks||[]).find(x => String(x['מזהה']) === String(taskId));
  if (!t) return alert('משימה לא נמצאה');
  const ce = canEdit(t);
  const comments = parseJsonField(t['comments']) || [];
  const subs = parseJsonField(t['subtasks']) || [];
  const html = `<div class="modal fade" id="td-m" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content">
    <div class="modal-header" style="background:linear-gradient(135deg,#0066cc,#007aff);color:#fff">
      <h5>${escHtml(t['כותרת']||'משימה')} <span class="badge bg-light text-dark ms-2">${escHtml(t['סטטוס']||'')}</span></h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">תיאור</label>
        ${ce?`<textarea id="td-desc" class="form-control" rows="4">${escHtml(t['תיאור']||'')}</textarea>`:`<div class="card p-2">${escHtml(t['תיאור']||'(ריק)')}</div>`}
      </div>
      <h6>תתי-משימות (${subs.length})</h6>
      <div>${subs.map((s,i)=>`<div class="d-flex gap-2 align-items-center mb-1">
        <input type="checkbox" ${s.done?'checked':''} ${ce?'':'disabled'} onchange="tdToggleSub(${taskId},${i})">
        <span class="${s.done?'text-muted text-decoration-line-through':''}">${escHtml(s.text)}</span>
        ${ce?`<button class="btn btn-sm btn-link text-danger p-0 ms-auto" onclick="tdRemSub(${taskId},${i})">×</button>`:''}
      </div>`).join('')||'<div class="text-muted small">אין</div>'}</div>
      ${ce?`<div class="input-group input-group-sm mt-2 mb-3">
        <input id="td-newst" class="form-control" placeholder="תת-משימה חדשה">
        <button class="btn btn-outline-primary" onclick="tdAddSub(${taskId})">+</button>
      </div>`:''}
      <h6>תגובות (${comments.length})</h6>
      <div style="max-height:200px;overflow:auto">${comments.map(c=>`<div class="card p-2 mb-1 bg-light">
        <div class="d-flex justify-content-between small"><strong>${escHtml(c.user||'')}</strong><span class="text-muted">${c.ts?new Date(c.ts).toLocaleString('he-IL'):''}</span></div>
        <div class="small">${escHtml(c.text||'')}</div>
      </div>`).join('')||'<div class="text-muted small">אין</div>'}</div>
      <div class="input-group input-group-sm mt-2">
        <input id="td-newc" class="form-control" placeholder="הוסף תגובה...">
        <button class="btn btn-outline-primary" onclick="tdAddCmt(${taskId})">שלח</button>
      </div>
      <hr>
      <details><summary>הרשאות</summary>
        ${renderPermsList(t['הרשאות'])}
        ${canAdmin(t)?`<div class="row g-2 mt-2">
          <div class="col-md-5"><input id="td-permu" class="form-control" placeholder="שם משתמש"></div>
          <div class="col-md-4"><select id="td-perml" class="form-select"><option value="view">צפייה</option><option value="comment">תגובות</option><option value="edit">עריכה</option><option value="admin">ניהול</option></select></div>
          <div class="col-md-3"><button class="btn btn-primary w-100" onclick="tdAddPerm(${taskId})">הוסף</button></div>
        </div>`:''}
      </details>
    </div>
    <div class="modal-footer">
      ${ce?`<button class="btn btn-primary" onclick="tdSave(${taskId})">שמור</button>`:''}
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  cleanupModal('td-m');
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('td-m')).show();
};
window.tdAddSub = async function(tid){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t||!canEdit(t))return;const text=document.getElementById('td-newst').value.trim();if(!text)return;const s=parseJsonField(t['subtasks'])||[];s.push({text,done:false});t['subtasks']=JSON.stringify(s);await api('updateTask',[t]);auditLog('subtask_add','task',tid,text);renderTaskDetails(tid);};
window.tdToggleSub = async function(tid,i){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t||!canEdit(t))return;const s=parseJsonField(t['subtasks'])||[];if(s[i]){s[i].done=!s[i].done;t['subtasks']=JSON.stringify(s);await api('updateTask',[t]);}};
window.tdRemSub = async function(tid,i){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t||!canEdit(t))return;const s=parseJsonField(t['subtasks'])||[];s.splice(i,1);t['subtasks']=JSON.stringify(s);await api('updateTask',[t]);renderTaskDetails(tid);};
window.tdAddCmt = async function(tid){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t)return;const text=document.getElementById('td-newc').value.trim();if(!text)return;const sess=JSON.parse(sessionStorage.getItem('user')||'{}');const c=parseJsonField(t['comments'])||[];c.push({user:sess.username||'anon',text,ts:Date.now()});t['comments']=JSON.stringify(c);await api('updateTask',[t]);auditLog('comment','task',tid,text.substring(0,50));renderTaskDetails(tid);};
window.tdSave = async function(tid){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t||!canEdit(t))return;const d=document.getElementById('td-desc')?.value;if(d!==undefined)t['תיאור']=d;await api('updateTask',[t]);auditLog('edit','task',tid);hideModal('td-m');if(typeof toast==='function')toast('נשמר','success');if(typeof renderActiveBehaviorTab==='function')renderActiveBehaviorTab();};
window.tdAddPerm = async function(tid){const t=(window._tasks||[]).find(x=>String(x['מזהה'])===String(tid));if(!t||!canAdmin(t))return alert('אין הרשאת ניהול');const u=document.getElementById('td-permu').value.trim();const l=document.getElementById('td-perml').value;if(!u)return;const acl=parseJsonField(t['הרשאות'])||{users:{},roles:{}};acl.users=acl.users||{};acl.users[u]=l;t['הרשאות']=JSON.stringify(acl);await api('updateTask',[t]);auditLog('perm_grant','task',tid,`${u}=${l}`);renderTaskDetails(tid);};

// =============== PROJECT DETAILS MODAL ===============
window.renderProjectDetails = function(pid) {
  const p = (window._projects||[]).find(x => String(x['מזהה']) === String(pid));
  if (!p) return alert('פרויקט לא נמצא');
  const ce = canEdit(p);
  const ms = parseJsonField(p['milestones']) || [];
  const mem = parseJsonField(p['members']) || [];
  const cf = parseJsonField(p['custom_fields']) || {};
  const linked = (window._tasks||[]).filter(t => String(t['פרויקט_מזהה']) === String(pid));
  const done = linked.filter(t => t['סטטוס'] === 'הושלם').length;
  const pct = linked.length ? Math.round(done/linked.length*100) : 0;
  const html = `<div class="modal fade" id="pd-m" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content">
    <div class="modal-header" style="background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff">
      <h5>📊 ${escHtml(p['שם']||'פרויקט')} <span class="badge bg-light text-dark">${escHtml(p['סטטוס']||'')}</span></h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="row g-2 mb-3">
        <div class="col"><div class="card p-2 text-center"><div class="h5">${linked.length}</div><small>משימות</small></div></div>
        <div class="col"><div class="card p-2 text-center"><div class="h5 text-success">${done}</div><small>הושלמו</small></div></div>
        <div class="col"><div class="card p-2 text-center"><div class="h5">${pct}%</div><div class="progress" style="height:4px"><div class="progress-bar" style="width:${pct}%"></div></div></div></div>
        <div class="col"><div class="card p-2 text-center"><div class="h5">${mem.length}</div><small>צוות</small></div></div>
        <div class="col"><div class="card p-2 text-center"><div class="h5">${ms.length}</div><small>אבני דרך</small></div></div>
      </div>
      <ul class="nav nav-tabs mb-3">
        <li class="nav-item"><a class="nav-link active" href="#pdt1" data-bs-toggle="tab">סקירה</a></li>
        <li class="nav-item"><a class="nav-link" href="#pdt2" data-bs-toggle="tab">משימות</a></li>
        <li class="nav-item"><a class="nav-link" href="#pdt3" data-bs-toggle="tab">אבני דרך</a></li>
        <li class="nav-item"><a class="nav-link" href="#pdt4" data-bs-toggle="tab">צוות</a></li>
        <li class="nav-item"><a class="nav-link" href="#pdt5" data-bs-toggle="tab">שדות מותאמים</a></li>
        <li class="nav-item"><a class="nav-link" href="#pdt6" data-bs-toggle="tab">הרשאות</a></li>
      </ul>
      <div class="tab-content">
        <div class="tab-pane fade show active" id="pdt1">
          <label class="form-label small">תיאור</label>
          ${ce?`<textarea id="pd-desc" class="form-control" rows="4">${escHtml(p['תיאור']||'')}</textarea>`:`<div class="card p-2">${escHtml(p['תיאור']||'(ריק)')}</div>`}
        </div>
        <div class="tab-pane fade" id="pdt2">
          ${linked.map(t=>`<div class="card p-2 mb-1" style="cursor:pointer" onclick="renderTaskDetails(${t['מזהה']})">
            <div><strong>${escHtml(t['כותרת']||'')}</strong> <span class="badge bg-secondary">${escHtml(t['סטטוס']||'')}</span></div>
          </div>`).join('') || '<div class="text-muted">אין</div>'}
          ${ce?`<button class="btn btn-sm btn-outline-primary mt-2" onclick="if(typeof addTaskModal===&quot;function&quot;)addTaskModal({'פרויקט_מזהה':${pid}})">+ משימה לפרויקט</button>`:''}
        </div>
        <div class="tab-pane fade" id="pdt3">
          ${ms.map((m,i)=>`<div class="card p-2 mb-1 d-flex flex-row justify-content-between">
            <div><input type="checkbox" ${m.done?'checked':''} ${ce?'':'disabled'} onchange="pdToggleMs(${pid},${i})"> <strong class="${m.done?'text-decoration-line-through':''}">${escHtml(m.title)}</strong>${m.date?` <small class="text-muted">${escHtml(m.date)}</small>`:''}</div>
            ${ce?`<button class="btn btn-sm btn-link text-danger" onclick="pdRemMs(${pid},${i})">×</button>`:''}
          </div>`).join('') || '<div class="text-muted">אין</div>'}
          ${ce?`<div class="input-group input-group-sm mt-2">
            <input id="ms-t" class="form-control" placeholder="אבן דרך">
            <input id="ms-d" type="date" class="form-control" style="max-width:150px">
            <button class="btn btn-outline-primary" onclick="pdAddMs(${pid})">+</button>
          </div>`:''}
        </div>
        <div class="tab-pane fade" id="pdt4">
          ${mem.map((m,i)=>`<div class="card p-2 mb-1 d-flex justify-content-between"><div><strong>${escHtml(m.name||m)}</strong>${m.role?` <small class="text-muted">- ${escHtml(m.role)}</small>`:''}</div>${ce?`<button class="btn btn-sm btn-link text-danger" onclick="pdRemMem(${pid},${i})">×</button>`:''}</div>`).join('') || '<div class="text-muted">אין</div>'}
          ${ce?`<div class="input-group input-group-sm mt-2">
            <input id="mem-n" class="form-control" placeholder="שם">
            <input id="mem-r" class="form-control" placeholder="תפקיד" style="max-width:150px">
            <button class="btn btn-outline-primary" onclick="pdAddMem(${pid})">+</button>
          </div>`:''}
        </div>
        <div class="tab-pane fade" id="pdt5">
          ${Object.entries(cf).map(([k,v])=>`<div class="row g-2 mb-1 align-items-center">
            <div class="col-md-4"><strong>${escHtml(k)}</strong></div>
            <div class="col-md-7">${ce?`<input class="form-control form-control-sm" value="${escHtml(v)}" onchange="pdUpdCf(${pid},'${escHtml(k)}',this.value)">`:`<span>${escHtml(v)}</span>`}</div>
            ${ce?`<div class="col-md-1"><button class="btn btn-sm btn-link text-danger" onclick="pdRemCf(${pid},'${escHtml(k)}')">×</button></div>`:''}
          </div>`).join('') || '<div class="text-muted">דוגמאות: תקציב, מספר תלמידים, מיקום, סגנון</div>'}
          ${ce?`<div class="input-group input-group-sm mt-2">
            <input id="cf-k" class="form-control" placeholder="שם השדה">
            <input id="cf-v" class="form-control" placeholder="ערך">
            <button class="btn btn-outline-primary" onclick="pdAddCf(${pid})">+ שדה</button>
          </div>`:''}
        </div>
        <div class="tab-pane fade" id="pdt6">
          <div class="small text-muted mb-2">ברירת מחדל: כולם צופים, רק מנהל עורך.</div>
          ${renderPermsList(p['הרשאות'])}
          ${canAdmin(p)?`<div class="row g-2 mt-2">
            <div class="col-md-5"><input id="pd-permu" class="form-control" placeholder="שם משתמש"></div>
            <div class="col-md-4"><select id="pd-perml" class="form-select"><option value="view">צפייה</option><option value="comment">תגובות</option><option value="edit">עריכה</option><option value="admin">ניהול</option></select></div>
            <div class="col-md-3"><button class="btn btn-primary w-100" onclick="pdAddPerm(${pid})">הוסף</button></div>
          </div>`:'<div class="alert alert-warning small mt-2">רק מנהל פרויקט יכול לשנות</div>'}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      ${ce?`<button class="btn btn-primary" onclick="pdSave(${pid})">שמור</button>`:''}
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  cleanupModal('pd-m');
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('pd-m')).show();
};

window.renderPermsList = function(aclStr) {
  const acl = parseJsonField(aclStr) || {};
  const users = acl.users || {};
  const roles = acl.roles || {};
  if (!Object.keys(users).length && !Object.keys(roles).length) return '<div class="text-muted small">ברירת מחדל פעילה</div>';
  return Object.entries(users).map(([u,l])=>`<div class="card p-2 mb-1">👤 ${escHtml(u)} - <strong>${escHtml(l)}</strong></div>`).join('') +
    Object.entries(roles).map(([r,l])=>`<div class="card p-2 mb-1">🏷 ${escHtml(r)} - <strong>${escHtml(l)}</strong></div>`).join('');
};

window.pdSave = async function(pid){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const d=document.getElementById('pd-desc')?.value;if(d!==undefined)p['תיאור']=d;await api('updateProject',[p]);auditLog('edit','project',pid);hideModal('pd-m');if(typeof toast==='function')toast('נשמר','success');if(typeof renderActiveBehaviorTab==='function')renderActiveBehaviorTab();};
window.pdAddMs = async function(pid){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const t=document.getElementById('ms-t').value.trim();if(!t)return;const d=document.getElementById('ms-d').value;const ms=parseJsonField(p['milestones'])||[];ms.push({title:t,date:d,done:false});p['milestones']=JSON.stringify(ms);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdToggleMs = async function(pid,i){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const ms=parseJsonField(p['milestones'])||[];if(ms[i]){ms[i].done=!ms[i].done;p['milestones']=JSON.stringify(ms);await api('updateProject',[p]);}};
window.pdRemMs = async function(pid,i){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const ms=parseJsonField(p['milestones'])||[];ms.splice(i,1);p['milestones']=JSON.stringify(ms);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdAddMem = async function(pid){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const n=document.getElementById('mem-n').value.trim();if(!n)return;const r=document.getElementById('mem-r').value.trim();const mem=parseJsonField(p['members'])||[];mem.push({name:n,role:r});p['members']=JSON.stringify(mem);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdRemMem = async function(pid,i){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const mem=parseJsonField(p['members'])||[];mem.splice(i,1);p['members']=JSON.stringify(mem);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdAddCf = async function(pid){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const k=document.getElementById('cf-k').value.trim();const v=document.getElementById('cf-v').value.trim();if(!k)return;const cf=parseJsonField(p['custom_fields'])||{};cf[k]=v;p['custom_fields']=JSON.stringify(cf);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdUpdCf = async function(pid,k,v){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const cf=parseJsonField(p['custom_fields'])||{};cf[k]=v;p['custom_fields']=JSON.stringify(cf);await api('updateProject',[p]);};
window.pdRemCf = async function(pid,k){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canEdit(p))return;const cf=parseJsonField(p['custom_fields'])||{};delete cf[k];p['custom_fields']=JSON.stringify(cf);await api('updateProject',[p]);renderProjectDetails(pid);};
window.pdAddPerm = async function(pid){const p=(window._projects||[]).find(x=>String(x['מזהה'])===String(pid));if(!p||!canAdmin(p))return alert('אין הרשאת ניהול');const u=document.getElementById('pd-permu').value.trim();const l=document.getElementById('pd-perml').value;if(!u)return;const acl=parseJsonField(p['הרשאות'])||{users:{},roles:{}};acl.users=acl.users||{};acl.users[u]=l;p['הרשאות']=JSON.stringify(acl);await api('updateProject',[p]);auditLog('perm_grant','project',pid,`${u}=${l}`);renderProjectDetails(pid);};

// Hook clicks on project edit buttons to open new modal
document.addEventListener('click', e => {
  const btn = e.target.closest('[onclick^="projEdit"]');
  if (btn) {
    const m = btn.getAttribute('onclick').match(/projEdit\((\d+)\)/);
    if (m) { e.preventDefault(); e.stopImmediatePropagation(); renderProjectDetails(m[1]); }
  }
}, true);

// Make task cards open details on body click
document.addEventListener('dblclick', e => {
  const card = e.target.closest('.tasks-col .card, #behavior-tab-content .card');
  if (!card) return;
  const idMatch = card.outerHTML.match(/tasksEdit\((\d+)\)/);
  if (idMatch) renderTaskDetails(idMatch[1]);
});

console.log('%c✅ behavior-v2 (perms+details) loaded', 'color:#16a34a;font-weight:bold');
