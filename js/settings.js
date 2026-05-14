async function renderSettings() {
  document.getElementById('page-settings').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3><i class="bi bi-gear"></i> הגדרות והרשאות</h3>
      <button class="btn btn-primary" onclick="addUserModal()"><i class="bi bi-plus"></i> משתמש חדש</button>
    </div>
    <div class="card p-3 mb-3">
      <h5>משתמשים</h5>
      <table class="table table-hover">
        <thead><tr><th>שם משתמש</th><th>תפקיד</th><th>הרשאות</th><th>כיתות</th><th>פעולות</th></tr></thead>
        <tbody id="users-tbody"></tbody>
      </table>
    </div>
    <div class="card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0"><i class="bi bi-mortarboard"></i> כיתות</h5>
        <button class="btn btn-primary btn-sm" onclick="addClassModal()"><i class="bi bi-plus"></i> כיתה חדשה</button>
      </div>
      <table class="table table-hover mb-0">
        <thead><tr><th style="width:50%">שם כיתה</th><th style="width:25%">סדר</th><th style="width:25%">פעולות</th></tr></thead>
        <tbody id="classes-tbody"></tbody>
      </table>
    </div>
    <div class="card p-3 mb-3">
      <h5><i class="bi bi-arrow-up-circle"></i> שנת לימודים</h5>
      <p class="text-muted small mb-2">מעבר לשנה הבאה: כל התלמידים הפעילים יועלו כיתה אחת. תלמידי הכיתה הגבוהה ביותר יסומנו כסיימו את המוסד.</p>
      <button class="btn btn-warning" onclick="promoteAllConfirm()">
        <i class="bi bi-arrow-up-square"></i> מעבר לשנה הבאה (כל התלמידים)
      </button>
    </div>
    <div class="card p-3 mb-3">
      <h5><i class="bi bi-tags"></i> קטגוריות התנהגות</h5>
      <p class="text-muted small mb-2">הקטגוריות שמופיעות בטופס דיווח אירוע</p>
      <div id="cats-list" class="d-flex flex-wrap gap-2 mb-2"></div>
      <div class="input-group">
        <input id="new-cat" class="form-control" placeholder="קטגוריה חדשה">
        <button class="btn btn-primary" onclick="addCategory()"><i class="bi bi-plus"></i> הוסף</button>
      </div>
    </div>
    <div class="card p-3 mb-3">
      <h5><i class="bi bi-database"></i> גיבוי ושחזור</h5>
      <p class="text-muted small mb-2">הורד גיבוי מלא של כל הנתונים (תלמידים, אירועים, תפקוד, מבחנים...) או שחזר מקובץ.</p>
      <div class="d-flex gap-2 flex-wrap">
        <button class="btn btn-outline-primary" onclick="downloadBackup()"><i class="bi bi-download"></i> הורד גיבוי JSON</button>
        <button class="btn btn-outline-warning" onclick="document.getElementById('restore-file').click()"><i class="bi bi-upload"></i> שחזר מקובץ</button>
        <input id="restore-file" type="file" accept=".json" class="d-none" onchange="restoreBackup(event)">
        <button class="btn btn-outline-info" onclick="clearLocalCache()"><i class="bi bi-arrow-clockwise"></i> רענן מהשרת (נקה cache)</button>
      </div>
    </div>
    <div class="card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h5 class="mb-0"><i class="bi bi-journal-text"></i> יומן פעולות</h5>
        <button class="btn btn-sm btn-outline-primary" onclick="loadAuditLog()"><i class="bi bi-arrow-clockwise"></i> רענן</button>
      </div>
      <div id="audit-log" class="small" style="max-height:300px;overflow-y:auto">
        <p class="text-muted small">לחץ "רענן" להצגת יומן הפעולות מהשיטס</p>
      </div>
    </div>
    <div class="card p-3 mb-3">
      <h5><i class="bi bi-cloud"></i> סטטוס סנכרון</h5>
      <div id="sync-status" class="small"></div>
    </div>
    <div class="card p-3">
      <h5><i class="bi bi-info-circle"></i> אודות המערכת</h5>
      <ul class="mb-2 small">
        <li>בית התלמוד · גרסה 1.1 · תשפ"ו</li>
        <li>Backend: Google Apps Script + Google Sheets (סנכרון אוטומטי כל 60 שניות)</li>
        <li>אחסון מקומי localStorage כ-cache</li>
        <li>תאריך עברי ופרשה דרך @hebcal/core</li>
        <li>תצוגת RTL עברית מלא</li>
      </ul>
      <a href="${SHEET_URL}" target="_blank" rel="noopener" class="btn btn-success btn-sm">
        <i class="bi bi-table"></i> פתח את קובץ הנתונים בגוגל שיטס
      </a>
    </div>`;
  renderClasses();
  renderCategories();
  renderSyncStatus();
  const r = await api('listUsers', []);
  const users = r.data || [];
  const tbody = document.getElementById('users-tbody');
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">אין משתמשים</td></tr>';
    return;
  }
  const PERM_LABELS = {students:'תלמידים', behavior:'התנהגות', reports:'דוחות', settings:'ניהול', all:'הכל'};
  tbody.innerHTML = users.map(u => {
    const role = u['תפקיד']||'';
    const cls = role === 'מנהל' ? 'role-admin' : role === 'רב' ? 'role-rabbi' : 'role-readonly';
    const perms = (u['הרשאות']||'').split(',').map(p => p.trim()).filter(Boolean);
    const permBadges = perms.map(p => `<span class="cat-badge me-1">${escHtml(PERM_LABELS[p]||p)}</span>`).join(' ');
    const isAdmin = u['שם משתמש'] === 'admin' || u['תפקיד'] === 'מנהל';
    const lastAdmin = users.filter(x => x['תפקיד'] === 'מנהל').length === 1 && isAdmin;
    const uname = u['שם משתמש']||'';
    const deleteBtn = lastAdmin ? '' :
      `<button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${jsAttr(uname)})"><i class="bi bi-trash"></i></button>`;
    const actions =
      `<button class="btn btn-sm btn-outline-primary me-1" onclick="editUser(${jsAttr(uname)})"><i class="bi bi-pencil"></i></button>
       ${deleteBtn}`;
    const vc = u['כיתות_מורשות'] || u.visible_classes || 'all';
    const classesBadge = (vc === 'all' || !vc) ? '<span class="text-muted small">הכל</span>' :
      vc.split(',').map(c => `<span class="badge bg-info text-dark me-1">${escHtml(c.trim())}</span>`).join('');
    return `<tr><td>${escHtml(uname)}</td><td><span class="badge ${cls}">${escHtml(role)}</span></td><td>${permBadges}</td><td>${classesBadge}</td><td>${actions}</td></tr>`;
  }).join('');
}

async function editUser(username) {
  const data = getData();
  const u = data.users.find(x => x.username === username);
  if (!u) return;
  addUserModal();
  const modalEl = document.getElementById('addUModal');
  const populate = () => {
    document.getElementById('nu-name').value = u.username;
    document.getElementById('nu-name').readOnly = false;
    document.getElementById('nu-name').dataset.originalUsername = u.username;
    document.getElementById('nu-pass').value = u.password_hash || '';
    if (document.getElementById('nu-fullname')) document.getElementById('nu-fullname').value = u['שם מלא'] || u.full_name || '';
    if (document.getElementById('nu-email')) document.getElementById('nu-email').value = u['אימייל'] || u.email || '';
    if (document.getElementById('nu-phone')) document.getElementById('nu-phone').value = u['טלפון'] || u.phone || '';
    if (document.getElementById('nu-notes')) document.getElementById('nu-notes').value = u['הערות_משתמש'] || u.notes || '';
    document.getElementById('nu-role').value = u.role || 'מורה';
    document.getElementById('nu-role').dispatchEvent(new Event('change'));
    const perms = (u.permissions || '').split(',').map(s=>s.trim());
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = u.permissions === 'all' || perms.includes(a.key);
    });
    const allStu = !u.visible_students || u.visible_students === 'all';
    document.getElementById('all-students').checked = allStu;
    document.getElementById('all-students').dispatchEvent(new Event('change'));
    if (!allStu) {
      const groupsToOpen = new Set();
      u.visible_students.split(',').map(s=>s.trim()).forEach(id => {
        const cb = document.getElementById('stu-' + id);
        if (cb) {
          cb.checked = true;
          // Find the parent group class & expand it
          const cls = Array.from(cb.classList).find(c => c.startsWith('stu-class-'));
          if (cls) groupsToOpen.add(cls.replace('stu-class-', ''));
        }
      });
      groupsToOpen.forEach(safe => {
        const el = document.getElementById('stu-group-' + safe);
        if (el && el.style.display === 'none') toggleStuClassGroup(safe);
      });
    }
    const allCat = !u.visible_categories || u.visible_categories === 'all';
    document.getElementById('all-cats').checked = allCat;
    document.getElementById('all-cats').dispatchEvent(new Event('change'));
    if (!allCat) {
      const wanted = u.visible_categories.split(',').map(s=>s.trim());
      document.querySelectorAll('.cat-cb').forEach(cb => {
        if (wanted.includes(cb.dataset.catName || cb.value)) cb.checked = true;
      });
    }
    const allCls = !u.visible_classes || u.visible_classes === 'all';
    document.getElementById('all-classes').checked = allCls;
    document.getElementById('all-classes').dispatchEvent(new Event('change'));
    if (!allCls) {
      const wantedC = u.visible_classes.split(',').map(s=>s.trim());
      document.querySelectorAll('.class-cb').forEach(cb => {
        if (wantedC.includes(cb.value)) cb.checked = true;
      });
    }
    modalEl.dataset.editMode = '1';
    const headerH5 = modalEl.querySelector('h5');
    if (headerH5) headerH5.textContent = 'עריכת משתמש: ' + username;
  };
  modalEl.addEventListener('shown.bs.modal', populate, { once: true });
}

async function deleteUser(username) {
  if (!confirm('בטוח למחוק את ' + username + '?')) return;
  const r = await api('deleteUser', [username]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  renderSettings();
}

async function renderClasses() {
  const r = await api('listClasses', []);
  const classes = r.data || [];
  const tbody = document.getElementById('classes-tbody');
  if (!tbody) return;
  if (!classes.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">אין כיתות מוגדרות</td></tr>';
    return;
  }
  const data = getData();
  tbody.innerHTML = classes.map(c => {
    const name = c['שם']||'';
    const count = data.students.filter(s => s['מחזור'] === name && s['סטטוס'] !== 'סיים').length;
    return `<tr>
      <td><strong>${escHtml(name)}</strong> ${count > 0 ? `<span class="badge bg-secondary me-1">${count} תלמידים</span>` : ''}</td>
      <td>${escHtml(c['סדר']||'')}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="editClassModal(${jsAttr(name)})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteClass(${jsAttr(name)})"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function addClassModal(existing) {
  const c = existing || { 'שם': '', 'סדר': '' };
  const isEdit = !!existing;
  const cn = c['שם']||'';
  const co = c['סדר']||'';
  const html = `<div class="modal fade" id="classModal"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-mortarboard"></i> ${isEdit ? 'עריכת כיתה: ' + escHtml(cn) : 'כיתה חדשה'}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3">
        <label class="form-label">שם כיתה</label>
        <input id="cls-name" class="form-control form-control-lg" value="${escHtml(cn)}" placeholder="לדוגמה: א, שיעור א, כיתה ב">
      </div>
      <div class="mb-3">
        <label class="form-label">סדר (קובע את סדר העלייה השנתית)</label>
        <input id="cls-order" type="number" class="form-control" value="${escHtml(co)}" placeholder="1, 2, 3...">
        <small class="text-muted">מספר נמוך יותר = כיתה נמוכה יותר. במעבר שנתי עוברים לסדר הבא.</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveClass(${isEdit ? '1' : '0'},${jsAttr(cn)})"><i class="bi bi-check"></i> שמור</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('classModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('classModal')).show();
}

async function editClassModal(name) {
  const data = getData();
  const c = data.classes.find(x => x['שם'] === name);
  if (!c) return;
  addClassModal(c);
}

async function saveClass(isEdit, originalName) {
  const name = document.getElementById('cls-name').value.trim();
  const order = parseInt(document.getElementById('cls-order').value) || 0;
  if (!name) return alert('שם כיתה חובה');
  if (!order) return alert('סדר חובה');
  let r;
  if (isEdit) {
    r = await api('updateClass', [{'שם': name, 'סדר': order, 'שם קודם': originalName}]);
  } else {
    r = await api('addClass', [{'שם': name, 'סדר': order}]);
  }
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  hideModal('classModal');
  renderClasses();
  if (typeof toast === 'function') toast(isEdit ? 'הכיתה עודכנה' : 'הכיתה נוספה', 'success');
}

async function deleteClass(name) {
  if (!confirm('בטוח למחוק את כיתה ' + name + '?')) return;
  const r = await api('deleteClass', [name]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  renderClasses();
  if (typeof toast === 'function') toast('הכיתה נמחקה', 'success');
}

async function promoteAllConfirm() {
  const data = getData();
  const active = data.students.filter(s => s['סטטוס'] !== 'סיים').length;
  if (!confirm(`לבצע מעבר שנתי ל${active} תלמידים פעילים?\n\nכל התלמידים יועלו כיתה אחת.\nתלמידי הכיתה הגבוהה ביותר יסומנו כסיימו את המוסד.\n\nפעולה זו לא ניתנת לביטול בקלות.`)) return;
  const r = await api('promoteAll', []);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  const d = r.data || {};
  alert(`בוצע מעבר שנתי:\n${d.promoted} תלמידים הועלו כיתה\n${d.graduated} תלמידים סיימו את המוסד\n${d.skipped} דולגו (לא מסווגים או כבר סיימו)`);
  if (typeof toast === 'function') toast('המעבר השנתי הושלם', 'success');
}

const PERMISSION_AREAS = [
  { key: 'students', label: 'תלמידים', icon: 'bi-people', desc: 'צפייה והוספה של תלמידים' },
  { key: 'behavior', label: 'מעקב התנהגות', icon: 'bi-clipboard-check', desc: 'תיעוד אירועי התנהגות' },
  { key: 'functioning', label: 'ציוני תפקוד', icon: 'bi-bar-chart-line', desc: 'ציוני תפקוד 1-5' },
  { key: 'tests', label: 'מבחנים', icon: 'bi-pencil-square', desc: 'ציוני מבחנים לפי פרשה' },
  { key: 'medications', label: 'כדורים ורפואי', icon: 'bi-capsule', desc: 'מעקב תרופות' },
  { key: 'attendance', label: 'נוכחות', icon: 'bi-check2-square', desc: 'נוכחות יומית' },
  { key: 'meetings', label: 'אסיפות הורים', icon: 'bi-people-fill', desc: 'תיעוד פגישות' },
  { key: 'conversations', label: 'שיחות עם תלמידים', icon: 'bi-chat-dots', desc: 'תיעוד שיחות אישיות עם תלמידים' },
  { key: 'calendar', label: 'לוח שנה', icon: 'bi-calendar3', desc: 'תצוגה חודשית' },
  { key: 'classview', label: 'תצוגת כיתה', icon: 'bi-grid-3x3-gap', desc: 'מבט-על על כיתה' },
  { key: 'reports', label: 'דוחות וייצוא', icon: 'bi-file-earmark-pdf', desc: 'דוחות, PDF, מייל להורים' },
  { key: 'settings', label: 'ניהול משתמשים', icon: 'bi-gear', desc: 'הוספה ועריכה של משתמשים' },
];

const ROLE_DEFAULTS = {
  'מנהל': ['students','behavior','functioning','tests','medications','attendance','meetings','conversations','calendar','classview','reports','settings'],
  'רב': ['students','behavior','functioning','tests','medications','attendance','meetings','conversations','calendar','classview','reports'],
  'מורה': ['students','behavior','functioning','attendance','conversations','classview','calendar'],
  'מזכירות': ['students','meetings','reports','attendance','calendar'],
  'קריאה בלבד': ['students','classview','calendar'],
  'מותאם אישית': [],
};

function addUserModal() {
  const data = getData();
  const checkboxes = PERMISSION_AREAS.map(a => `
    <div class="form-check d-flex align-items-center p-3 mb-2 border rounded" style="cursor:pointer">
      <input class="form-check-input ms-3 perm-cb" type="checkbox" value="${a.key}" id="perm-${a.key}">
      <label class="form-check-label flex-grow-1 ms-2" for="perm-${a.key}" style="cursor:pointer">
        <i class="bi ${a.icon} fs-4 text-primary"></i>
        <strong class="ms-2">${a.label}</strong>
        <div class="text-muted small">${a.desc}</div>
      </label>
    </div>
  `).join('');

  // Group students by class
  const studentsByClass = {};
  data.students.forEach(s => {
    const cls = s['מחזור'] || 'ללא כיתה';
    if (!studentsByClass[cls]) studentsByClass[cls] = [];
    studentsByClass[cls].push(s);
  });
  const sortedClasses = Object.keys(studentsByClass).sort((a,b) => {
    const ca = (data.classes || []).find(c => c['שם'] === a);
    const cb = (data.classes || []).find(c => c['שם'] === b);
    return (parseInt(ca?.['סדר']) || 99) - (parseInt(cb?.['סדר']) || 99);
  });
  const studentOpts = sortedClasses.map(cls => {
    const slist = studentsByClass[cls].slice().sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
    const safe = cls.replace(/[^א-תa-zA-Z0-9]/g, '_');
    return `<div class="border rounded mb-2">
      <div class="d-flex justify-content-between align-items-center p-2 bg-light" style="cursor:pointer" onclick="toggleStuClassGroup('${safe}')">
        <strong>כיתה ${escHtml(cls)} <span class="text-muted small">(${slist.length})</span></strong>
        <div>
          <button type="button" class="btn btn-sm btn-outline-primary me-1" onclick="event.stopPropagation();selectAllInClass('${safe}', true)">סמן הכל</button>
          <button type="button" class="btn btn-sm btn-outline-secondary me-1" onclick="event.stopPropagation();selectAllInClass('${safe}', false)">נקה</button>
          <i class="bi bi-chevron-down" id="stu-group-chevron-${safe}"></i>
        </div>
      </div>
      <div class="p-2" id="stu-group-${safe}" style="display:none">
        ${slist.map(s => `
          <div class="form-check">
            <input class="form-check-input student-cb stu-class-${safe}" type="checkbox" value="${escHtml(s['מזהה'])}" id="stu-${escHtml(s['מזהה'])}">
            <label class="form-check-label" for="stu-${escHtml(s['מזהה'])}">${escHtml(s['שם פרטי']||'')} ${escHtml(s['שם משפחה']||'')}</label>
          </div>`).join('')}
      </div>
    </div>`;
  }).join('');

  const catOpts = data.categories.map((c, i) => `
    <div class="form-check">
      <input class="form-check-input cat-cb" type="checkbox" value="${escHtml(c.name)}" id="cat-${i}" data-cat-name="${escHtml(c.name)}">
      <label class="form-check-label" for="cat-${i}">${escHtml(c.name)}</label>
    </div>`).join('');

  const html = `<div class="modal fade" id="addUModal"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-person-plus"></i> משתמש חדש</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">שם משתמש <span class="text-danger">*</span></label>
          <input id="nu-name" class="form-control" placeholder="לדוגמה: rabbi.cohen">
        </div>
        <div class="col-md-6">
          <label class="form-label">סיסמה <span class="text-danger">*</span></label>
          <input id="nu-pass" class="form-control" placeholder="לפחות 4 ספרות">
        </div>
        <div class="col-md-6">
          <label class="form-label">שם מלא</label>
          <input id="nu-fullname" class="form-control" placeholder="הרב פלוני אלמוני">
        </div>
        <div class="col-md-6">
          <label class="form-label">תפקיד <span class="text-danger">*</span></label>
          <select id="nu-role" class="form-select">
            ${Object.keys(ROLE_DEFAULTS).map(r => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">אימייל</label>
          <input id="nu-email" type="email" class="form-control" placeholder="user@example.com">
        </div>
        <div class="col-md-6">
          <label class="form-label">טלפון</label>
          <input id="nu-phone" class="form-control" placeholder="052-1234567">
        </div>
        <div class="col-12">
          <label class="form-label">הערות</label>
          <textarea id="nu-notes" class="form-control" rows="2" placeholder="הערות אופציונליות..."></textarea>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-shield-check"></i> מסכים שיוכל לראות:</h6>
          ${checkboxes}
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-mortarboard"></i> אילו כיתות יוכל לראות?</h6>
          <div class="border rounded p-2 mb-2">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="all-classes" checked>
              <label class="form-check-label fw-bold" for="all-classes">כל הכיתות</label>
            </div>
            <div id="class-list" class="d-none d-flex flex-wrap gap-3">
              ${(data.classes || []).slice().sort((a,b) => parseInt(a['סדר'])-parseInt(b['סדר'])).map(c => `
                <div class="form-check">
                  <input class="form-check-input class-cb" type="checkbox" value="${escHtml(c['שם'])}" id="cls-perm-${escHtml(c['שם'])}">
                  <label class="form-check-label" for="cls-perm-${escHtml(c['שם'])}">כיתה <strong>${escHtml(c['שם'])}</strong></label>
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-people"></i> אילו תלמידים יוכל לראות?</h6>
          <div class="border rounded p-2 mb-2">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="all-students" checked>
              <label class="form-check-label fw-bold" for="all-students">כל התלמידים</label>
            </div>
            <div id="student-list" class="d-none" style="max-height:200px;overflow-y:auto">
              ${studentOpts || '<small class="text-muted">אין תלמידים</small>'}
            </div>
          </div>
        </div>
        <div class="col-12">
          <h6 class="mt-2"><i class="bi bi-tag"></i> אילו קטגוריות התנהגות יוכל לראות?</h6>
          <div class="border rounded p-2">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="all-cats" checked>
              <label class="form-check-label fw-bold" for="all-cats">כל הקטגוריות</label>
            </div>
            <div id="cat-list" class="d-none">
              ${catOpts}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="saveUser()"><i class="bi bi-check"></i> שמור משתמש</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('addUModal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('addUModal')).show();

  function updatePerms(){
    const role = document.getElementById('nu-role').value;
    const defaults = ROLE_DEFAULTS[role] || [];
    PERMISSION_AREAS.forEach(a => {
      document.getElementById('perm-' + a.key).checked = defaults.includes(a.key);
    });
  }
  document.getElementById('nu-role').addEventListener('change', updatePerms);
  updatePerms();

  // Toggle "all students" / individual list
  document.getElementById('all-students').addEventListener('change', e => {
    document.getElementById('student-list').classList.toggle('d-none', e.target.checked);
  });
  document.getElementById('all-cats').addEventListener('change', e => {
    document.getElementById('cat-list').classList.toggle('d-none', e.target.checked);
  });
  document.getElementById('all-classes').addEventListener('change', e => {
    document.getElementById('class-list').classList.toggle('d-none', e.target.checked);
  });
}

function toggleStuClassGroup(safe) {
  const el = document.getElementById('stu-group-' + safe);
  const chev = document.getElementById('stu-group-chevron-' + safe);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  if (chev) chev.className = open ? 'bi bi-chevron-down' : 'bi bi-chevron-up';
}

function selectAllInClass(safe, check) {
  document.querySelectorAll('.stu-class-' + safe).forEach(cb => { cb.checked = check; });
  // Open the group when interacting with it
  const el = document.getElementById('stu-group-' + safe);
  if (el && el.style.display === 'none') toggleStuClassGroup(safe);
}

async function saveUser() {
  const checked = Array.from(document.querySelectorAll('.perm-cb:checked')).map(c => c.value);
  const allStudents = document.getElementById('all-students').checked;
  const allCats = document.getElementById('all-cats').checked;
  const allClasses = document.getElementById('all-classes').checked;
  const visibleStudents = allStudents ? 'all' :
    Array.from(document.querySelectorAll('.student-cb:checked')).map(c => c.value).join(',');
  const visibleCats = allCats ? 'all' :
    Array.from(document.querySelectorAll('.cat-cb:checked')).map(c => c.value).join(',');
  const visibleClasses = allClasses ? 'all' :
    Array.from(document.querySelectorAll('.class-cb:checked')).map(c => c.value).join(',');

  const obj = {
    'שם משתמש': document.getElementById('nu-name').value.trim(),
    'סיסמה': document.getElementById('nu-pass').value.trim(),
    'שם מלא': (document.getElementById('nu-fullname')?.value || '').trim(),
    'תפקיד': document.getElementById('nu-role').value,
    'אימייל': (document.getElementById('nu-email')?.value || '').trim(),
    'טלפון': (document.getElementById('nu-phone')?.value || '').trim(),
    'הערות_משתמש': (document.getElementById('nu-notes')?.value || '').trim(),
    'הרשאות': checked.length === PERMISSION_AREAS.length ? 'all' : checked.join(','),
    'תלמידים_מורשים': visibleStudents,
    'קטגוריות_מורשות': visibleCats,
    'כיתות_מורשות': visibleClasses,
  };
  if (!obj['שם משתמש'] || !obj['סיסמה']) return alert('שם וסיסמה חובה');
  if (!checked.length) return alert('יש לסמן לפחות מסך אחד');
  if (!allStudents && !visibleStudents) return alert('יש לבחור לפחות תלמיד אחד או לסמן "כל התלמידים"');
  const editMode = document.getElementById('addUModal').dataset.editMode === '1';
  const originalUsername = document.getElementById('nu-name').dataset.originalUsername;
  if (editMode && originalUsername) {
    obj['שם משתמש קודם'] = originalUsername;
  }
  const r = editMode ? await api('updateUser', [obj]) : await api('addUser', [obj]);
  if (!r.ok) { alert(r.error || 'שגיאה'); return; }
  hideModal('addUModal');
  // Refresh in-memory currentUser if user edited themselves (read fresh from _data.users)
  if (typeof currentUser !== 'undefined' && currentUser) {
    const editedSelf = editMode && (originalUsername === currentUser.username || obj['שם משתמש'] === currentUser.username);
    if (editedSelf) {
      const fresh = getData().users.find(u => u.username === obj['שם משתמש']);
      if (fresh) {
        currentUser.username = fresh.username;
        currentUser.role = fresh.role;
        currentUser.permissions = fresh.permissions;
        sessionStorage.setItem('user', JSON.stringify({username: fresh.username, role: fresh.role, permissions: fresh.permissions}));
        const ui = document.getElementById('user-info');
        if (ui) ui.innerHTML = escHtml(currentUser.username) + ' (' + escHtml(currentUser.role||'') + ') <button class="btn btn-sm btn-outline-light ms-2" onclick="logout()">יציאה</button>';
        if (typeof filterByPermissions === 'function') filterByPermissions();
      }
    }
  }
  renderSettings();
}

function renderCategories() {
  const el = document.getElementById('cats-list');
  if (!el) return;
  const data = getData();
  const cats = data.categories || [];
  if (!cats.length) {
    el.innerHTML = '<span class="text-muted small">אין קטגוריות מוגדרות</span>';
    return;
  }
  el.innerHTML = cats.map((c, i) => `
    <span class="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-2">
      <i class="bi bi-tag"></i>
      ${escHtml(c.name || c['קטגוריה'] || '')}
      <button class="btn-close btn-close-sm" style="font-size:.6rem" onclick="deleteCategory(${i})"></button>
    </span>
  `).join('');
}

async function addCategory() {
  const name = document.getElementById('new-cat').value.trim();
  if (!name) return;
  const r = await api('addCategory', [name]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  document.getElementById('new-cat').value = '';
  renderCategories();
  notify('הקטגוריה נוספה', 'success');
}

async function deleteCategory(idx) {
  const data = getData();
  const c = data.categories[idx];
  const name = c.name || c['קטגוריה'];
  if (!confirm(`למחוק את הקטגוריה "${name}"?`)) return;
  const r = await api('deleteCategory', [name]);
  if (!r.ok) return alert(r.error || 'שגיאה');
  renderCategories();
  notify('נמחק', 'success');
}

async function loadAuditLog() {
  const el = document.getElementById('audit-log');
  if (!el) return;
  el.innerHTML = '<div class="text-center py-2"><div class="spinner-border spinner-border-sm"></div> טוען...</div>';
  const r = await api('listAuditLog', []);
  if (!r.ok) {
    el.innerHTML = `<p class="text-danger small mb-0"><i class="bi bi-exclamation-triangle"></i> ${escHtml(r.error || 'שגיאה בטעינה')}</p>`;
    return;
  }
  const rows = (r.data || []).slice().reverse().slice(0, 50);
  if (!rows.length) {
    el.innerHTML = '<p class="text-muted small mb-0">אין פעולות מתועדות</p>';
    return;
  }
  el.innerHTML = '<table class="table table-sm mb-0"><thead><tr><th>תאריך</th><th>משתמש</th><th>פעולה</th><th>טאב</th><th>תיאור</th></tr></thead><tbody>' +
    rows.map(r => {
      const dt = r['תאריך'] ? new Date(r['תאריך']).toLocaleString('he-IL') : '';
      const actionColor = r['פעולה']==='מחיקה'?'text-danger':r['פעולה']==='הוספה'?'text-success':'text-primary';
      return `<tr>
        <td class="text-muted" style="white-space:nowrap">${escHtml(dt)}</td>
        <td><strong>${escHtml(r['משתמש']||'')}</strong></td>
        <td class="${actionColor}">${escHtml(r['פעולה']||'')}</td>
        <td><span class="badge bg-light text-dark">${escHtml(r['טאב']||'')}</span></td>
        <td class="small">${escHtml(r['תיאור']||'')}</td>
      </tr>`;
    }).join('') + '</tbody></table>';
}

function renderSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const data = getData();
  const counts = {
    'תלמידים': (data.students || []).length,
    'אירועי התנהגות': (data.behavior || []).length,
    'ציוני תפקוד': (data.functioning || []).length,
    'מבחנים': (data.tests || []).length,
    'כדורים': (data.medications || []).length,
    'אסיפות': (data.meetings || []).length,
    'נוכחות': (data.attendance || []).length,
    'משתמשים': (data.users || []).length,
    'כיתות': (data.classes || []).length,
    'קטגוריות': (data.categories || []).length,
  };
  el.innerHTML = '<div class="row g-2">' + Object.entries(counts).map(([k,v]) =>
    `<div class="col-md-3 col-sm-6"><strong>${escHtml(k)}:</strong> <span class="badge bg-primary">${v}</span></div>`
  ).join('') + '</div>';
}

function downloadBackup() {
  const data = getData();
  const backup = {
    version: '1.1',
    exportedAt: new Date().toISOString(),
    students: data.students,
    behavior: data.behavior,
    functioning: data.functioning,
    tests: data.tests,
    medications: data.medications,
    meetings: data.meetings,
    attendance: data.attendance,
    users: data.users,
    categories: data.categories,
    classes: data.classes,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cheder-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  notify('הגיבוי הורד', 'success');
}

function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!confirm('שחזור יחליף את הנתונים בדפדפן וידחוף הכל לשיטס. פעולה כבדה — להמשיך?')) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      const tabMap = {
        students: 'תלמידים', behavior: 'מעקב_התנהגות',
        functioning: 'תפקוד', tests: 'מבחנים',
        medications: 'כדורים', meetings: 'אסיפות',
        attendance: 'נוכחות', categories: 'קטגוריות',
      };
      const d = getData();
      let pushed = 0;
      for (const [k, tabName] of Object.entries(tabMap)) {
        const arr = backup[k];
        if (!Array.isArray(arr) || !arr.length) continue;
        d[k] = arr;
        // Bulk push to sheet
        try {
          const body = btoa(unescape(encodeURIComponent(JSON.stringify({ tab: tabName, rows: arr, replace: true }))));
          const form = new URLSearchParams({
            action: 'cheder_bulkAppend', token: AGENT_TOKEN, instance: INSTANCE, body_b64: body,
          });
          await fetch(APPS_SCRIPT_URL, { method: 'POST', body: form.toString(), headers: {'Content-Type':'application/x-www-form-urlencoded'} });
          pushed += arr.length;
        } catch (err) { console.error('Restore push failed for', tabName, err); }
      }
      saveStored(d);
      markLocalChange();
      notify(`הגיבוי שוחזר — ${pushed} שורות נדחפו לשיטס. רענן את הדף.`, 'success');
    } catch (err) {
      alert('שגיאה בקריאת הגיבוי: ' + err.message);
    }
  };
  reader.readAsText(file);
}

async function clearLocalCache() {
  if (!confirm('לנקות את ה-cache המקומי ולמשוך את הנתונים מחדש מהשרת?')) return;
  // Round-8 fix: clear all cheder-related localStorage keys, not just main
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('cheder_pending_writes');
    localStorage.removeItem('cheder_failed_writes');
    // Clean up any corrupt backups
    Object.keys(localStorage).filter(k => k.startsWith(STORAGE_KEY + '_corrupt_')).forEach(k => localStorage.removeItem(k));
  } catch {}
  notify('Cache נוקה. טוען מחדש...', 'success');
  setTimeout(() => location.reload(), 1000);
}

// Legacy advanced filter — accessed from reports page if needed
async function renderReportsAdvancedFilter() {
  const data = getData();
  const cycles = [...new Set(data.students.map(s => s['מחזור']).filter(Boolean))];
  const cats = data.categories.map(c => c.name);
  const sevs = ['גבוהה','בינונית','נמוכה'];

  document.getElementById('page-reports').innerHTML = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <h3 class="mb-3"><i class="bi bi-file-earmark-bar-graph"></i> דוחות וסינון</h3>

    <div class="card p-3 mb-3">
      <h6><i class="bi bi-funnel"></i> סינון</h6>
      <div class="row g-2">
        <div class="col-md-3">
          <label class="form-label small">תלמיד</label>
          <select id="r-student" class="form-select form-select-sm">
            <option value="">כל התלמידים</option>
            ${data.students.map(s => `<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">כיתה</label>
          <select id="r-cycle" class="form-select form-select-sm">
            <option value="">כל הכיתות</option>
            ${cycles.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">קטגוריית התנהגות</label>
          <select id="r-cat" class="form-select form-select-sm">
            <option value="">כל הקטגוריות</option>
            ${cats.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">חומרה</label>
          <select id="r-sev" class="form-select form-select-sm">
            <option value="">כל החומרות</option>
            ${sevs.map(s => `<option value="${escHtml(s)}">${escHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <label class="form-label small">מתאריך</label>
          <input id="r-from" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-3">
          <label class="form-label small">עד תאריך</label>
          <input id="r-to" type="date" class="form-control form-control-sm">
        </div>
        <div class="col-md-6 d-flex align-items-end gap-2">
          <button class="btn btn-primary btn-sm" onclick="applyReportFilters()"><i class="bi bi-search"></i> הצג דוח</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="resetReportFilters()"><i class="bi bi-arrow-counterclockwise"></i> איפוס</button>
          <button class="btn btn-outline-success btn-sm" onclick="exportFilteredCSV()"><i class="bi bi-file-earmark-spreadsheet"></i> CSV</button>
          <button class="btn btn-outline-danger btn-sm" onclick="printFiltered()"><i class="bi bi-printer"></i> הדפס</button>
        </div>
      </div>
    </div>

    <div id="report-results"></div>`;

  applyReportFilters();
}

let _filteredStudents = [], _filteredEvents = [];

function applyReportFilters() {
  const data = getData();
  const sId = document.getElementById('r-student').value;
  const cycle = document.getElementById('r-cycle').value;
  const cat = document.getElementById('r-cat').value;
  const sev = document.getElementById('r-sev').value;
  const from = document.getElementById('r-from').value;
  const to = document.getElementById('r-to').value;

  _filteredStudents = data.students.filter(s => {
    if (sId && String(s['מזהה']) !== sId) return false;
    if (cycle && s['מחזור'] !== cycle) return false;
    return true;
  });

  _filteredEvents = data.behavior.filter(e => {
    if (sId && String(e['תלמיד_מזהה']) !== sId) return false;
    if (cat && e['קטגוריה'] !== cat) return false;
    if (sev && e['חומרה'] !== sev) return false;
    const dt = new Date(e['תאריך']);
    if (from && dt < new Date(from)) return false;
    if (to && dt > new Date(to+'T23:59:59')) return false;
    if (cycle) {
      const stu = data.students.find(s => String(s['מזהה']) === String(e['תלמיד_מזהה']));
      if (!stu || stu['מחזור'] !== cycle) return false;
    }
    return true;
  });

  drawReportResults();
}

function drawReportResults() {
  const totalEvents = _filteredEvents.length;
  const high = _filteredEvents.filter(e => e['חומרה']==='גבוהה').length;
  const mid = _filteredEvents.filter(e => e['חומרה']==='בינונית').length;
  const low = _filteredEvents.filter(e => e['חומרה']==='נמוכה').length;

  let html = `
    <div class="row g-2 mb-3">
      <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-primary">${_filteredStudents.length}</div><div class="text-muted small">תלמידים</div></div></div>
      <div class="col-md-3"><div class="card p-3 text-center"><div class="display-6 text-info">${totalEvents}</div><div class="text-muted small">אירועים</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-danger">${high}</div><div class="text-muted small">גבוהה</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-warning">${mid}</div><div class="text-muted small">בינונית</div></div></div>
      <div class="col-md-2"><div class="card p-3 text-center"><div class="display-6 text-success">${low}</div><div class="text-muted small">נמוכה</div></div></div>
    </div>`;

  if (_filteredStudents.length) {
    html += '<div class="card p-3 mb-3"><h6><i class="bi bi-people"></i> תלמידים</h6><table class="table table-sm"><thead><tr><th>שם</th><th>כיתה</th><th>טלפון אם</th><th>אירועים</th></tr></thead><tbody>';
    _filteredStudents.forEach(s => {
      const cnt = _filteredEvents.filter(e => String(e['תלמיד_מזהה']) === String(s['מזהה'])).length;
      html += `<tr><td><strong>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</strong></td><td>${escHtml(s['מחזור']||'')}</td><td>${escHtml(s['טלפון אם']||'')}</td><td><span class="badge bg-secondary">${cnt}</span></td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  if (_filteredEvents.length) {
    html += '<div class="card p-3"><h6><i class="bi bi-clipboard-check"></i> אירועי התנהגות</h6>';
    const sorted = [..._filteredEvents].sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
    sorted.forEach(e => {
      const sev = e['חומרה']==='גבוהה' ? 'severity-high' : e['חומרה']==='נמוכה' ? 'severity-low' : 'severity-mid';
      const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
      const rep = e['דווח_עי'] ? `<small class="text-muted ms-2"><i class="bi bi-person-fill"></i> ${escHtml(e['דווח_עי'])}</small>` : '';
      html += `<div class="card p-2 mb-2 ${sev}">
        <div class="d-flex justify-content-between"><div><span class="cat-badge">${escHtml(e['קטגוריה']||'')}</span><strong class="mx-2">${escHtml(e['שם תלמיד']||'')}</strong></div><small class="text-muted">${escHtml(dt)}</small></div>
        <p class="mb-0 mt-2">${escHtml(e['תיאור']||'')}</p>
        ${rep ? `<div class="mt-1">${rep}</div>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  if (!_filteredStudents.length && !_filteredEvents.length) {
    html += '<div class="card p-5 text-center text-muted"><i class="bi bi-inbox fs-1"></i><p class="mt-2">אין נתונים בפילטר הנוכחי</p></div>';
  }

  document.getElementById('report-results').innerHTML = html;
}

function resetReportFilters() {
  ['r-student','r-cycle','r-cat','r-sev','r-from','r-to'].forEach(id => document.getElementById(id).value = '');
  applyReportFilters();
}

function exportFilteredCSV() {
  // Bug #35 fix: quote every field; prefix with ' if starts with =,+,-,@ (formula injection)
  const safe = (v) => {
    let s = String(v == null ? '' : v).replace(/"/g, '""');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s}"`;
  };
  let csv = '﻿';  // BOM for Excel Hebrew
  csv += 'תלמידים\n';
  csv += 'מזהה,שם,גיל,מחזור,טלפון אם,טלפון אב\n';
  _filteredStudents.forEach(s => {
    csv += [s['מזהה']||'', (s['שם פרטי']||'')+' '+(s['שם משפחה']||''), s['גיל']||'', s['מחזור']||'', s['טלפון אם']||'', s['טלפון אב']||''].map(safe).join(',') + '\n';
  });
  csv += '\nאירועי התנהגות\n';
  csv += 'תאריך,תלמיד,קטגוריה,חומרה,תיאור\n';
  _filteredEvents.forEach(e => {
    const dt = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
    csv += [dt, e['שם תלמיד']||'', e['קטגוריה']||'', e['חומרה']||'', e['תיאור']||''].map(safe).join(',') + '\n';
  });
  const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cheder_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

function printFiltered() {
  const today = new Date().toLocaleDateString('he-IL');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>דוח חדר</title>
<style>
@page{size:A4;margin:1.5cm}
body{font-family:Arial,'Heebo',sans-serif;direction:rtl;color:#1f2937}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:10px}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10pt}
th{background:#f3f4f6;padding:8px;border:1px solid #d1d5db;text-align:right}
td{padding:6px 8px;border:1px solid #e5e7eb}
.event{margin-bottom:8px;padding:8px;border-right:4px solid #0066cc;background:#f9fafb}
.event.high{border-color:#dc2626}.event.mid{border-color:#f59e0b}.event.low{border-color:#16a34a}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()" style="background:#0066cc;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;margin-bottom:20px">🖨 הדפס</button>
<h1>דוח בית התלמוד - ${escHtml(today)}</h1>
<p>תלמידים: ${_filteredStudents.length} · אירועים: ${_filteredEvents.length}</p>
${_filteredStudents.length ? `<h2>תלמידים</h2><table><tr><th>שם</th><th>גיל</th><th>כיתה</th><th>טלפון</th></tr>${_filteredStudents.map(s=>`<tr><td>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</td><td>${escHtml(s['גיל']||'')}</td><td>${escHtml(s['מחזור']||'')}</td><td>${escHtml(s['טלפון אם']||'')}</td></tr>`).join('')}</table>` : ''}
${_filteredEvents.length ? `<h2>אירועי התנהגות</h2>${_filteredEvents.map(e=>{const c=e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';const rep=e['דווח_עי']?` · דווח ע"י ${escHtml(e['דווח_עי'])}`:'';return `<div class="event ${c}"><strong>${escHtml(e['שם תלמיד']||'')}</strong> · ${escHtml(e['קטגוריה']||'')} · ${escHtml(new Date(e['תאריך']).toLocaleString('he-IL'))}${rep}<br>${escHtml(e['תיאור']||'')}</div>`}).join('')}` : ''}
<script>
const _doPrint=()=>window.print();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>setTimeout(_doPrint,200));
else window.addEventListener('load',()=>setTimeout(_doPrint,500));
</script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('הדפדפן חוסם חלונות פופ-אפ — אפשר חלון פופ-אפ לאתר ונסה שוב'); return; }
  w.document.write(html);
  w.document.close();
}

function generateReport(type) {
  const data = getData();
  const today = new Date().toLocaleDateString('he-IL');
  const time = new Date().toLocaleTimeString('he-IL', {hour:'2-digit',minute:'2-digit'});

  let title, content;
  if (type === 'students') {
    title = 'רשימת תלמידים';
    content = renderStudentsReport(data.students);
  } else if (type === 'behavior') {
    title = 'מעקב התנהגות';
    content = renderBehaviorReport(data.behavior, data.students);
  } else {
    title = 'דוח מלא - בית התלמוד';
    content = renderStudentsReport(data.students) + '<div style="page-break-after:always"></div>' + renderBehaviorReport(data.behavior, data.students);
  }

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@page{size:A4;margin:1.5cm}
body{font-family:Arial,'Heebo',sans-serif;direction:rtl;color:#1f2937;padding:0}
.header{border-bottom:3px solid #0066cc;padding-bottom:15px;margin-bottom:25px}
.header h1{margin:0;color:#0066cc;font-size:24pt}
.header .subtitle{color:#6b7280;font-size:11pt;margin-top:5px}
.section{margin-top:25px}
.section h2{color:#0066cc;border-bottom:1px solid #e5e7eb;padding-bottom:5px;font-size:16pt}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:10pt}
th{background:#f3f4f6;text-align:right;padding:8px;border:1px solid #d1d5db;font-weight:700}
td{padding:6px 8px;border:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#fafafa}
.event{margin-bottom:12px;padding:10px;border-right:4px solid #0066cc;background:#f9fafb;border-radius:4px}
.event.high{border-color:#dc2626;background:#fef2f2}
.event.mid{border-color:#f59e0b;background:#fffbeb}
.event.low{border-color:#16a34a;background:#f0fdf4}
.event-meta{color:#6b7280;font-size:9pt;margin-bottom:4px}
.stats{display:flex;justify-content:space-around;background:#f3f4f6;padding:15px;border-radius:8px;margin:15px 0}
.stat{text-align:center}
.stat-num{font-size:24pt;color:#0066cc;font-weight:700}
.stat-label{font-size:10pt;color:#6b7280}
.print-btn{position:fixed;top:20px;left:20px;background:#0066cc;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-size:14pt;box-shadow:0 4px 12px rgba(0,0,0,.2);z-index:100}
@media print{.print-btn{display:none}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨 הדפס/שמור PDF</button>
<div class="header">
  <h1>${escHtml(title)}</h1>
  <div class="subtitle">בית התלמוד · הופק ב-${escHtml(today)} בשעה ${escHtml(time)}</div>
</div>
${content}
<script>
const _doPrint=()=>window.print();
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>setTimeout(_doPrint,200));
else window.addEventListener('load',()=>setTimeout(_doPrint,500));
</script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('הדפדפן חוסם חלונות פופ-אפ — אפשר חלון פופ-אפ לאתר ונסה שוב'); return; }
  w.document.write(html);
  w.document.close();
}

function renderStudentsReport(students) {
  if (!students.length) return '<div class="section"><p>אין תלמידים רשומים.</p></div>';
  const stats = `<div class="stats">
    <div class="stat"><div class="stat-num">${students.length}</div><div class="stat-label">תלמידים</div></div>
    <div class="stat"><div class="stat-num">${new Set(students.map(s=>s['מחזור'])).size}</div><div class="stat-label">מחזורים</div></div>
  </div>`;
  let table = '<table><thead><tr><th>מזהה</th><th>שם מלא</th><th>גיל</th><th>כיתה</th><th>שם אם</th><th>טלפון אם</th><th>שם אב</th><th>טלפון אב</th><th>כתובת</th></tr></thead><tbody>';
  students.forEach(s => {
    table += `<tr>
      <td>${escHtml(s['מזהה']||'')}</td>
      <td><strong>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</strong></td>
      <td>${escHtml(s['גיל']||'')}</td>
      <td>${escHtml(s['מחזור']||'')}</td>
      <td>${escHtml(s['שם אם']||'')}</td>
      <td>${escHtml(s['טלפון אם']||'')}</td>
      <td>${escHtml(s['שם אב']||'')}</td>
      <td>${escHtml(s['טלפון אב']||'')}</td>
      <td>${escHtml(s['כתובת']||'')}</td>
    </tr>`;
  });
  table += '</tbody></table>';
  return `<div class="section">${stats}<h2>רשימת תלמידים</h2>${table}</div>`;
}

function renderBehaviorReport(events, students) {
  if (!events.length) return '<div class="section"><p>אין אירועים רשומים.</p></div>';
  const sorted = [...events].sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const high = sorted.filter(e => e['חומרה'] === 'גבוהה').length;
  const mid = sorted.filter(e => e['חומרה'] === 'בינונית').length;
  const low = sorted.filter(e => e['חומרה'] === 'נמוכה').length;
  const stats = `<div class="stats">
    <div class="stat"><div class="stat-num">${sorted.length}</div><div class="stat-label">סה"כ אירועים</div></div>
    <div class="stat"><div class="stat-num" style="color:#dc2626">${high}</div><div class="stat-label">חומרה גבוהה</div></div>
    <div class="stat"><div class="stat-num" style="color:#f59e0b">${mid}</div><div class="stat-label">בינונית</div></div>
    <div class="stat"><div class="stat-num" style="color:#16a34a">${low}</div><div class="stat-label">נמוכה</div></div>
  </div>`;
  let evs = '';
  sorted.forEach(e => {
    const sevCls = e['חומרה'] === 'גבוהה' ? 'high' : e['חומרה'] === 'נמוכה' ? 'low' : 'mid';
    const date = e['תאריך'] ? new Date(e['תאריך']).toLocaleString('he-IL') : '';
    const rep = e['דווח_עי'] ? ` · דווח ע"י ${escHtml(e['דווח_עי'])}` : '';
    evs += `<div class="event ${sevCls}">
      <div class="event-meta"><strong>${escHtml(e['שם תלמיד']||'')}</strong> · ${escHtml(e['קטגוריה']||'')} · ${escHtml(date)} · חומרה ${escHtml(e['חומרה']||'')}${rep}</div>
      <div>${escHtml(e['תיאור']||'')}</div>
    </div>`;
  });
  return `<div class="section">${stats}<h2>אירועי התנהגות</h2>${evs}</div>`;
}
