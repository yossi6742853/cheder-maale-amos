// behavior-forms.js — שילוב מלא של parent-signature/admin.html ו-signatures.js
// בתוך טאב "טפסים וחתימות" של מעקב התנהגות. אין סיסמה (כניסה דרך login של cheder).
// נכתב 2026-05-21.

const BF_TEMPLATES = {
  trip: {
    title: 'אישור יציאה לטיול', icon: '🚌',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'cycle', label:'מחזור / כיתה', type:'text', required:true },
      { id:'parent_name', label:'שם ההורה', type:'text', required:true },
      { id:'parent_phone', label:'טלפון ההורה', type:'tel', required:true },
      { id:'trip_date', label:'תאריך הטיול', type:'date', required:true },
      { id:'trip_destination', label:'יעד הטיול', type:'text', required:true },
      { id:'medical_notes', label:'הערות רפואיות / רגישויות', type:'textarea', rows:2 },
    ],
  },
  photo: {
    title: 'אישור פרסום תמונות', icon: '📷',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'parent_name', label:'שם ההורה', type:'text', required:true },
      { id:'parent_phone', label:'טלפון ההורה', type:'tel', required:true },
      { id:'notes', label:'הערות', type:'textarea', rows:2 },
    ],
  },
  medical: {
    title: 'אישור טיפול רפואי', icon: '🏥',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'student_id', label:'תעודת זהות התלמיד', type:'text', required:true },
      { id:'parent_name', label:'שם ההורה', type:'text', required:true },
      { id:'parent_phone', label:'טלפון ההורה', type:'tel', required:true },
      { id:'allergies', label:'אלרגיות / רגישויות', type:'textarea', rows:2 },
      { id:'medications', label:'תרופות קבועות', type:'textarea', rows:2 },
    ],
  },
  general: {
    title: 'אישור הורים כללי', icon: '📄',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'parent_name', label:'שם ההורה', type:'text', required:true },
      { id:'parent_phone', label:'טלפון ההורה', type:'tel', required:true },
      { id:'subject', label:'נושא האישור', type:'text', required:true },
      { id:'content', label:'תוכן האישור', type:'textarea', rows:5, required:true },
    ],
  },
  payment: {
    title: 'הצהרת תשלום', icon: '💰',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'parent_name', label:'שם ההורה', type:'text', required:true },
      { id:'parent_phone', label:'טלפון ההורה', type:'tel', required:true },
      { id:'amount', label:'סכום (₪)', type:'number', required:true },
      { id:'purpose', label:'מטרת התשלום', type:'text', required:true },
    ],
  },
  emergency: {
    title: 'עדכון פרטי חירום', icon: '☎️',
    fields: [
      { id:'student_name', label:'שם התלמיד', type:'text', required:true },
      { id:'cycle', label:'מחזור / כיתה', type:'text', required:true },
      { id:'mother_phone', label:'טלפון האם', type:'tel' },
      { id:'father_phone', label:'טלפון האב', type:'tel' },
      { id:'emergency_contact_phone', label:'טלפון איש קשר חירום', type:'tel' },
      { id:'address', label:'כתובת מגורים', type:'text' },
    ],
  },
};

const BF_BASE = 'https://beit-hatalmud.github.io/parent-signature/';
const BF_AGENT_TOKEN = 'BHT_AGENT_2026';
const BF_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
const BF_CUSTOM_KEY = 'bht_behavior_custom_forms_v1';
const BF_SETTINGS_KEY = 'bht_behavior_forms_settings_v1';

function bfLoadCustomForms() {
  try { return JSON.parse(localStorage.getItem(BF_CUSTOM_KEY) || '{}'); } catch { return {}; }
}
function bfSaveCustomForms(d) { localStorage.setItem(BF_CUSTOM_KEY, JSON.stringify(d)); }

function bfLoadSettings() {
  try { return JSON.parse(localStorage.getItem(BF_SETTINGS_KEY) || '{}'); } catch { return {}; }
}
function bfSaveSettings(s) { localStorage.setItem(BF_SETTINGS_KEY, JSON.stringify(s)); }

function bfAllForms() {
  return Object.assign({}, BF_TEMPLATES, bfLoadCustomForms());
}

async function renderFormsTab(rootEl) {
  rootEl.innerHTML = `
    <div class="card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h5 class="mb-0"><i class="bi bi-magic"></i> תבניות טפסים לחתימה דיגיטלית</h5>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-info" onclick="bfShowCustomBuilder()"><i class="bi bi-plus-square"></i> טופס מותאם</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="bfShowSettings()"><i class="bi bi-gear"></i> הגדרות</button>
        </div>
      </div>
      <p class="text-muted small mb-2">בחר תבנית — הקישור ייווצר אוטומטית. ההורה ימלא + יחתום בנייד. החתימה תישלח למייל ותישמר ב-Drive.</p>
      <div class="row g-2" id="bf-templates"></div>
    </div>

    <div id="bf-custom-builder" class="card p-3 mb-3 d-none">
      <h5><i class="bi bi-plus-square"></i> בונה טופס מותאם אישית</h5>
      <input id="bf-cb-title" class="form-control mb-2" placeholder="כותרת הטופס (לדוגמה: אישור הפעלה מיוחדת)">
      <h6 class="mt-2">שדות הטופס</h6>
      <div id="bf-cb-fields"></div>
      <div class="d-flex gap-2 mt-2 flex-wrap">
        <button class="btn btn-sm btn-outline-primary" onclick="bfAddCustomField()"><i class="bi bi-plus"></i> הוסף שדה</button>
        <button class="btn btn-sm btn-success" onclick="bfSaveCustomForm()"><i class="bi bi-save"></i> שמור תבנית</button>
        <button class="btn btn-sm btn-link" onclick="bfHideCustomBuilder()">ביטול</button>
      </div>
    </div>

    <div id="bf-settings-panel" class="card p-3 mb-3 d-none">
      <h5><i class="bi bi-gear"></i> הגדרות מערכת</h5>
      <div class="mb-2">
        <label class="form-label small">מייל יעד ברירת מחדל</label>
        <input id="bf-set-recipient" class="form-control form-control-sm">
      </div>
      <div class="mb-2">
        <label class="form-label small">חתימת המוסד (תופיע בתחתית כל טופס)</label>
        <input id="bf-set-org" class="form-control form-control-sm" placeholder="בית התלמוד · בית שמש">
      </div>
      <button class="btn btn-sm btn-primary" onclick="bfSaveSettingsForm()">שמור</button>
      <button class="btn btn-sm btn-link" onclick="bfHideSettings()">סגור</button>
    </div>

    <div class="card p-3 mb-3">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <h5 class="mb-0"><i class="bi bi-list-ul"></i> חתימות, טפסים והודעות</h5>
        <button class="btn btn-sm btn-outline-primary" onclick="bfNewManualSig()"><i class="bi bi-plus"></i> חתימה ידנית</button>
      </div>
      <div class="row g-2">
        <div class="col-md-5"><input id="bf-search" class="form-control form-control-sm" placeholder="חיפוש (תלמיד, סוג, הערות)..."></div>
        <div class="col-md-3"><select id="bf-status" class="form-select form-select-sm"><option value="">כל הסטטוסים</option></select></div>
        <div class="col-md-4">
          <select id="bf-student" class="form-select form-select-sm">
            <option value="">כל התלמידים</option>
            ${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').map(s => `<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="bf-sig-list" class="mt-3"></div>
    </div>`;

  bfDrawTemplateGrid();

  const sigR = await api('listSignatures', []);
  window._bfSignatures = sigR.data || [];

  const statuses = [...new Set(window._bfSignatures.map(s => s['סטטוס']).filter(Boolean))];
  document.getElementById('bf-status').innerHTML = '<option value="">כל הסטטוסים</option>' +
    statuses.map(st => `<option>${escHtml(st)}</option>`).join('');

  ['bf-search','bf-status','bf-student'].forEach(id => {
    const el = document.getElementById(id);
    el.oninput = bfRefreshSigs;
    el.onchange = bfRefreshSigs;
  });
  bfRefreshSigs();
}

function bfDrawTemplateGrid() {
  const grid = document.getElementById('bf-templates');
  if (!grid) return;
  const forms = bfAllForms();
  grid.innerHTML = Object.entries(forms).map(([key, t]) => {
    const isCustom = key.startsWith('custom_');
    const delBtn = isCustom ? `<button class="btn btn-sm btn-outline-danger position-absolute" style="top:4px;right:4px;padding:1px 5px;font-size:.7rem" onclick="event.stopPropagation();bfDelCustom('${key}')"><i class="bi bi-x"></i></button>` : '';
    return `<div class="col-6 col-md-4 col-lg-3 position-relative">
      <button class="btn btn-outline-primary w-100 p-3 position-relative" style="min-height:120px" onclick="bfCreateLink('${key}')">
        <span style="font-size:2rem;display:block;line-height:1">${t.icon || '📋'}</span>
        <span class="small mt-2 d-block">${escHtml(t.title)}</span>
      </button>${delBtn}
    </div>`;
  }).join('');
}

function bfRefreshSigs() {
  const q = (document.getElementById('bf-search').value || '').toLowerCase();
  const status = document.getElementById('bf-status').value;
  const sid = document.getElementById('bf-student').value;
  let list = (window._bfSignatures || []).slice().sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0));
  if (status) list = list.filter(s => s['סטטוס'] === status);
  if (sid) list = list.filter(s => String(s['תלמיד_מזהה']) === String(sid));
  if (q) list = list.filter(s => Object.values(s).some(v => String(v||'').toLowerCase().includes(q)));

  const stuById = {};
  _allStudents.forEach(s => stuById[s['מזהה']] = s);

  const el = document.getElementById('bf-sig-list');
  if (!list.length) {
    el.innerHTML = '<div class="text-center py-4 text-muted"><i class="bi bi-pen-fill fs-3"></i><p class="mb-0 mt-2">אין חתימות תועדו עדיין</p></div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const stu = stuById[s['תלמיד_מזהה']];
    const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '?';
    const dt = s['תאריך'] ? (typeof formatDateBoth === 'function' ? formatDateBoth(s['תאריך']) : s['תאריך']) : '';
    const statusColor = s['סטטוס'] === 'חתום' ? 'bg-success-subtle text-success-emphasis' :
                       s['סטטוס'] === 'מחכה' ? 'bg-warning-subtle text-warning-emphasis' :
                       'bg-light text-dark';
    return `<div class="card p-3 mb-2">
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <strong>${escHtml(stuName)}</strong>
          ${stu ? `<span class="text-muted ms-2">כיתה ${escHtml(stu['מחזור']||'')}</span>` : ''}
          ${s['סוג'] ? `<span class="badge bg-light text-dark me-2">${escHtml(s['סוג'])}</span>` : ''}
          ${s['סטטוס'] ? `<span class="badge ${statusColor}">${escHtml(s['סטטוס'])}</span>` : ''}
        </div>
        <div class="d-flex gap-1 align-items-center">
          <small class="text-muted">${escHtml(dt)}</small>
          <button class="btn btn-sm btn-outline-success p-1" onclick="sigPrint(${s['מזהה']})" title="הדפסה / PDF"><i class="bi bi-printer"></i></button>
          <button class="btn btn-sm btn-outline-info p-1" onclick="sigEmailParents(${s['מזהה']})" title="שלח להורים"><i class="bi bi-envelope"></i></button>
          <button class="btn btn-sm btn-outline-primary p-1" onclick="bfEditSig(${s['מזהה']})"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger p-1" onclick="bfDeleteSig(${s['מזהה']})"><i class="bi bi-trash"></i></button>
        </div>
      </div>
      ${s['תיאור'] ? `<div class="mt-2" style="white-space:pre-wrap;line-height:1.6">${escHtml(s['תיאור'])}</div>` : ''}
      ${s['הערות'] ? `<div class="mt-2 small text-muted">${escHtml(s['הערות'])}</div>` : ''}
    </div>`;
  }).join('');
  window._signaturesData = window._bfSignatures;
  window._signaturesStudents = _allStudents;
}

function bfNewManualSig(prefill) {
  window._signaturesStudents = _allStudents;
  window._signaturesData = window._bfSignatures || [];
  if (typeof sigAddModal === 'function') sigAddModal(prefill);
  else alert('signatures.js לא נטען');
}

function bfEditSig(id) {
  const s = (window._bfSignatures || []).find(x => String(x['מזהה']) === String(id));
  if (s) bfNewManualSig(s);
}

async function bfDeleteSig(id) {
  if (!confirm('למחוק את החתימה?')) return;
  const r = await api('deleteSignature', [id]);
  if (r.ok) {
    if (typeof toast === 'function') toast('נמחק', 'success');
    renderActiveBehaviorTab();
  } else alert(r.error || 'שגיאה');
}

async function bfCreateLink(tplKey, preEventId) {
  const forms = bfAllForms();
  const tpl = forms[tplKey];
  if (!tpl) return alert('תבנית לא נמצאה');
  const settings = bfLoadSettings();
  const defaultRecipient = settings.recipient || '6787012@gmail.com';
  const eventBound = preEventId ? _events.find(e => String(e['מזהה']) === String(preEventId)) : null;
  const html = `<div class="modal fade" id="bf-link-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-link-45deg"></i> ${escHtml(tpl.title)}</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="alert alert-info p-2 mb-3 small">
        <input type="checkbox" id="bf-l-broadcast" class="form-check-input me-2">
        <label for="bf-l-broadcast" class="form-check-label"><strong>📣 קישור פתוח לכל המכינה</strong> - כל הורה יוכל למלא, ללא בחירת תלמיד מראש (התלמיד יוקלד בטופס עצמו)</label>
      </div>
      <div class="row g-2 mb-3" id="bf-l-student-row">
        <div class="col-md-6">
          <label class="form-label">תלמיד</label>
          <select id="bf-l-student" class="form-select">
            <option value="">— בחר —</option>
            ${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').map(s => {
              const sid = s['מזהה'];
              const selected = eventBound && String(eventBound['תלמיד_מזהה']) === String(sid) ? 'selected' : '';
              return `<option value="${escHtml(sid)}" ${selected}>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label">מזהה (יופיע בכותרת המייל)</label>
          <input id="bf-l-ref" class="form-control" placeholder="לדוגמה: טיול ל ג בעומר תשפו" value="${eventBound ? escHtml((eventBound['קטגוריה']||'')) : ''}">
        </div>
      </div>
      <div class="row g-2 mb-3">
        <div class="col-md-6">
          <label class="form-label">מייל לקבלת חתימה (יעד)</label>
          <input id="bf-l-recipient" class="form-control" value="${escHtml(defaultRecipient)}">
        </div>
        <div class="col-md-6">
          <label class="form-label">מייל ההורה (מילוי מראש - אופציונלי)</label>
          <input id="bf-l-parent-email" type="email" class="form-control" placeholder="parent@example.com">
        </div>
      </div>
      <hr>
      <h6 class="text-muted small">מילוי מראש (אופציונלי) — ההורה יוכל לערוך</h6>
      <div id="bf-l-prefill" class="row g-2">
        ${(tpl.fields || []).filter(f => f.type !== 'checkbox').map(f => `
          <div class="col-md-6">
            <label class="form-label small">${escHtml(f.label)}</label>
            <input id="bf-l-pre-${f.id}" class="form-control form-control-sm" type="${f.type==='textarea'?'text':(f.type||'text')}">
          </div>
        `).join('')}
      </div>
      <div id="bf-l-output" class="d-none mt-3">
        <div class="alert alert-success">
          <div class="small fw-bold">הקישור מוכן:</div>
          <div id="bf-l-url" style="font-family:monospace;font-size:.78rem;word-break:break-all;direction:ltr;text-align:left;padding:8px;background:#fff;border-radius:4px;margin:8px 0"></div>
          <div class="d-flex gap-2 flex-wrap">
            <button class="btn btn-sm btn-outline-primary" onclick="bfCopyLink()"><i class="bi bi-clipboard"></i> העתק</button>
            <button class="btn btn-sm btn-outline-success" onclick="bfShareWhats()"><i class="bi bi-whatsapp"></i> WhatsApp</button>
            <button class="btn btn-sm btn-outline-info" onclick="bfShareSms()"><i class="bi bi-chat"></i> SMS</button>
            <button class="btn btn-sm btn-outline-secondary" onclick="bfOpenGmail()"><i class="bi bi-envelope"></i> טיוטת מייל</button>
            <a id="bf-l-open" class="btn btn-sm btn-outline-dark" target="_blank"><i class="bi bi-box-arrow-up-right"></i> פתח</a>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
      <button class="btn btn-primary" onclick="bfBuildLink('${tplKey}')"><i class="bi bi-magic"></i> צור קישור</button>
    </div>
  </div></div></div>`;
  cleanupModal('bf-link-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const _m = document.getElementById('bf-link-modal');
  new bootstrap.Modal(_m).show();
  _m.addEventListener('hidden.bs.modal', () => cleanupModal('bf-link-modal'), { once: true });
  // Toggle student row when broadcast checked
  const bc = document.getElementById('bf-l-broadcast');
  const sr = document.getElementById('bf-l-student-row');
  if (bc && sr) bc.addEventListener('change', () => { sr.style.display = bc.checked ? 'none' : ''; });
}

async function bfBuildLink(tplKey) {
  const forms = bfAllForms();
  const tpl = forms[tplKey];
  const broadcast = document.getElementById('bf-l-broadcast')?.checked;
  const sid = document.getElementById('bf-l-student').value;
  if (!broadcast && !sid) return alert('בחר תלמיד או סמן "קישור פתוח לכל המכינה"');
  const stu = sid ? _allStudents.find(s => String(s['מזהה']) === sid) : null;
  const ref = document.getElementById('bf-l-ref').value.trim();
  const recipient = document.getElementById('bf-l-recipient').value.trim();
  const params = new URLSearchParams({
    action: 'parent_form_create_link', token: BF_AGENT_TOKEN,
    tpl: tplKey, ref,
  });
  try {
    const r = await fetch(BF_SCRIPT_URL + '?' + params.toString());
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'שגיאה');
    const lt = d.token;
    const urlParams = new URLSearchParams({ tpl: tplKey, lt });
    if (ref) urlParams.set('ref', ref);
    if (recipient) urlParams.set('to', recipient);
    if (broadcast) {
      urlParams.set('broadcast', '1');
    } else if (stu) {
      const fullName = `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim();
      urlParams.set('student_name', fullName);
      if (stu['מחזור']) urlParams.set('cycle', stu['מחזור']);
    }
    (tpl.fields || []).forEach(f => {
      const el = document.getElementById('bf-l-pre-' + f.id);
      if (el && el.value) urlParams.set(f.id, el.value);
    });
    // parent_email pre-fill (always available via app.js auto-inject)
    const peEl = document.getElementById('bf-l-parent-email');
    if (peEl && peEl.value.trim()) urlParams.set('parent_email', peEl.value.trim());
    const url = BF_BASE + 'index.html?' + urlParams.toString();
    document.getElementById('bf-l-url').textContent = url;
    document.getElementById('bf-l-open').href = url;
    document.getElementById('bf-l-output').classList.remove('d-none');
    window._bfLastUrl = url;
    window._bfLastTpl = tplKey;
    window._bfLastRef = ref;
  } catch (e) {
    alert('שגיאה ביצירת הקישור: ' + e.message);
  }
}

function bfCopyLink() {
  if (!window._bfLastUrl) return;
  navigator.clipboard.writeText(window._bfLastUrl);
  if (typeof toast === 'function') toast('הועתק', 'success');
}
function bfShareWhats() {
  if (!window._bfLastUrl) return;
  const tpl = bfAllForms()[window._bfLastTpl] || { title: 'טופס חתימה' };
  window.open('https://wa.me/?text=' + encodeURIComponent(`${tpl.title}\n${window._bfLastUrl}`), '_blank');
}
function bfShareSms() {
  if (!window._bfLastUrl) return;
  const tpl = bfAllForms()[window._bfLastTpl] || { title: 'טופס חתימה' };
  window.open(`sms:?body=${encodeURIComponent(tpl.title + ' ' + window._bfLastUrl)}`);
}
function bfOpenGmail() {
  if (!window._bfLastUrl) return;
  const tpl = bfAllForms()[window._bfLastTpl] || { title: 'טופס חתימה' };
  const settings = bfLoadSettings();
  const org = settings.org || 'בית התלמוד · בית שמש';
  const subject = encodeURIComponent(tpl.title + (window._bfLastRef ? ' — ' + window._bfLastRef : ''));
  const body = encodeURIComponent(
    `שלום,\n\nנא למלא וחתום על הטופס:\n\n${tpl.title}\n` +
    (window._bfLastRef ? `מזהה: ${window._bfLastRef}\n` : '') +
    `\n${window._bfLastUrl}\n\nתודה,\n${org}`
  );
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
}

// === Custom form builder ===
let _bfCbCount = 0;

function bfShowCustomBuilder() {
  document.getElementById('bf-custom-builder').classList.remove('d-none');
  document.getElementById('bf-settings-panel').classList.add('d-none');
  document.getElementById('bf-cb-title').value = '';
  document.getElementById('bf-cb-fields').innerHTML = '';
  _bfCbCount = 0;
  bfAddCustomField();
}
function bfHideCustomBuilder() {
  document.getElementById('bf-custom-builder').classList.add('d-none');
}
function bfAddCustomField() {
  _bfCbCount++;
  const id = _bfCbCount;
  const html = `<div class="row g-2 mb-2 border rounded p-2" data-bfcb="${id}">
    <div class="col-md-4"><input class="form-control form-control-sm bfcb-label" placeholder="תווית השדה"></div>
    <div class="col-md-3"><select class="form-select form-select-sm bfcb-type">
      <option value="text">טקסט</option>
      <option value="number">מספר</option>
      <option value="date">תאריך</option>
      <option value="tel">טלפון</option>
      <option value="email">מייל</option>
      <option value="textarea">פסקה</option>
      <option value="checkbox">צ'קבוקס</option>
      <option value="select">בחירה מרשימה</option>
    </select></div>
    <div class="col-md-3"><input class="form-control form-control-sm bfcb-options" placeholder="אופציות (מופרד ב-|)"></div>
    <div class="col-md-1 form-check pt-1"><input type="checkbox" class="form-check-input bfcb-required" title="חובה?"></div>
    <div class="col-md-1"><button class="btn btn-sm btn-outline-danger" onclick="this.closest('[data-bfcb]').remove()"><i class="bi bi-x"></i></button></div>
  </div>`;
  document.getElementById('bf-cb-fields').insertAdjacentHTML('beforeend', html);
}
function bfSaveCustomForm() {
  const title = document.getElementById('bf-cb-title').value.trim();
  if (!title) return alert('הזן כותרת');
  const fields = [];
  document.querySelectorAll('[data-bfcb]').forEach((row, i) => {
    const label = row.querySelector('.bfcb-label').value.trim();
    if (!label) return;
    const type = row.querySelector('.bfcb-type').value;
    const opts = row.querySelector('.bfcb-options').value.trim();
    const req = row.querySelector('.bfcb-required').checked;
    const f = { id: 'cf_' + i + '_' + label.replace(/\s/g,'_'), label, type, required: req };
    if (type === 'select' && opts) f.options = opts.split('|').map(s => s.trim());
    if (type === 'textarea') f.rows = 3;
    fields.push(f);
  });
  if (!fields.length) return alert('הוסף לפחות שדה אחד');
  const key = 'custom_' + Date.now();
  const customs = bfLoadCustomForms();
  customs[key] = { title, icon: '🧾', fields };
  bfSaveCustomForms(customs);
  if (typeof toast === 'function') toast('הטופס נשמר', 'success');
  bfHideCustomBuilder();
  bfDrawTemplateGrid();
}
function bfDelCustom(key) {
  if (!confirm('למחוק את התבנית המותאמת?')) return;
  const customs = bfLoadCustomForms();
  delete customs[key];
  bfSaveCustomForms(customs);
  bfDrawTemplateGrid();
}

// === Settings ===
function bfShowSettings() {
  const s = bfLoadSettings();
  document.getElementById('bf-set-recipient').value = s.recipient || '6787012@gmail.com';
  document.getElementById('bf-set-org').value = s.org || 'בית התלמוד · בית שמש';
  document.getElementById('bf-settings-panel').classList.remove('d-none');
  document.getElementById('bf-custom-builder').classList.add('d-none');
}
function bfHideSettings() {
  document.getElementById('bf-settings-panel').classList.add('d-none');
}
function bfSaveSettingsForm() {
  bfSaveSettings({
    recipient: document.getElementById('bf-set-recipient').value.trim(),
    org: document.getElementById('bf-set-org').value.trim(),
  });
  if (typeof toast === 'function') toast('הגדרות נשמרו', 'success');
  bfHideSettings();
}

// Called from the events tab — open template picker pre-bound to event
window.newFormForEvent_impl = function(eventId) {
  const forms = bfAllForms();
  const html = `<div class="modal fade" id="bf-tpl-pick" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5>בחר תבנית טופס</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2">
        ${Object.entries(forms).map(([k,t]) => `
          <div class="col-6 col-md-4">
            <button class="btn btn-outline-primary w-100 p-3" onclick="bfPickedTpl('${k}', ${eventId||'null'})">
              <div style="font-size:1.8rem">${t.icon||'📋'}</div><div class="small mt-1">${escHtml(t.title)}</div>
            </button>
          </div>`).join('')}
      </div>
    </div>
  </div></div></div>`;
  cleanupModal('bf-tpl-pick');
  document.body.insertAdjacentHTML('beforeend', html);
  const _m = document.getElementById('bf-tpl-pick');
  new bootstrap.Modal(_m).show();
  _m.addEventListener('hidden.bs.modal', () => cleanupModal('bf-tpl-pick'), { once: true });
};
function bfPickedTpl(tplKey, eventId) {
  hideModal('bf-tpl-pick');
  setTimeout(() => bfCreateLink(tplKey, eventId === null ? undefined : eventId), 200);
}
window.newFormLink = function() { window.newFormForEvent_impl(null); };
