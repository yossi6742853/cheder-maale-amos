// Conversations with students page (שיחות עם תלמידים)
// Auto-tags the logged-in user as the rabbi who conducted the conversation.
// Auto-fills Hebrew date + parsha; supports categories, quick templates,
// voice-to-text via Web Speech API, and linking to a behavior event.

let _convData = [];
let _convStudents = [];
let _convEvents = [];

// Fixed list of common conversation categories (kept short and meaningful).
const CONV_CATEGORIES = [
  'שיחה אישית', 'חיזוק', 'מעקב', 'גבולות',
  'רגשי', 'לימודי', 'התנהגותי', 'חברתי',
  'מצב משפחתי', 'אחר',
];

// Quick templates — [label, suggested category, opening text]
const CONV_TEMPLATES = [
  ['חיזוק חיובי', 'חיזוק', 'שיחה לחיזוק על '],
  ['שיחה אישית', 'שיחה אישית', ''],
  ['מעקב אחרי אירוע', 'מעקב', 'בעקבות האירוע: '],
  ['קביעת גבולות', 'גבולות', 'שיחה בנושא גבולות: '],
  ['מצב רגשי', 'רגשי', 'התרשמות רגשית: '],
  ['קושי לימודי', 'לימודי', 'שיחה על הקושי הלימודי: '],
];

async function renderConversations() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h3 class="mb-0"><i class="bi bi-chat-dots"></i> שיחות עם תלמידים</h3>
      <button class="btn btn-primary" onclick="convAddModal()"><i class="bi bi-plus"></i> שיחה חדשה</button>
    </div>

    <div class="card p-3 mb-3">
      <div class="row g-2">
        <div class="col-md-4"><input id="co-search" class="form-control" placeholder="חיפוש לפי תלמיד, נושא, תוכן..."></div>
        <div class="col-md-3">
          <select id="co-rabbi" class="form-select"><option value="">כל הרבנים</option></select>
        </div>
        <div class="col-md-3">
          <select id="co-cat" class="form-select"><option value="">כל הקטגוריות</option></select>
        </div>
        <div class="col-md-2">
          <select id="co-student" class="form-select"><option value="">כל התלמידים</option></select>
        </div>
      </div>
    </div>

    <div id="co-list"></div>
    <div id="co-empty" class="text-center py-5 text-muted d-none">
      <i class="bi bi-chat-dots fs-1"></i>
      <p class="mb-0">אין שיחות מתועדות</p>
    </div>`;
  document.getElementById('page-conversations').innerHTML = html;

  const [sR, cR, eR] = await Promise.all([
    api('listStudents', []),
    api('listConversations', []),
    api('listBehavior', []),
  ]);
  _convStudents = sR.data || [];
  _convData = cR.data || [];
  _convEvents = eR.data || [];

  const rabbis = [...new Set(_convData.map(m => m['רב']).filter(Boolean))].sort();
  document.getElementById('co-rabbi').innerHTML = '<option value="">כל הרבנים</option>' +
    rabbis.map(p => `<option>${escHtml(p)}</option>`).join('');

  document.getElementById('co-cat').innerHTML = '<option value="">כל הקטגוריות</option>' +
    CONV_CATEGORIES.map(c => `<option>${escHtml(c)}</option>`).join('');

  const sortedStu = _convStudents.slice().sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  document.getElementById('co-student').innerHTML = '<option value="">כל התלמידים</option>' +
    sortedStu.map(s => `<option value="${s['מזהה']}">${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('');

  ['co-search','co-rabbi','co-cat','co-student'].forEach(id => document.getElementById(id).oninput = conversationsRefresh);
  ['co-rabbi','co-cat','co-student'].forEach(id => document.getElementById(id).onchange = conversationsRefresh);
  conversationsRefresh();
}

function conversationsRefresh() {
  const q = (document.getElementById('co-search').value || '').toLowerCase();
  const rabbi = document.getElementById('co-rabbi').value;
  const cat = document.getElementById('co-cat').value;
  const sid = document.getElementById('co-student').value;
  let list = _convData.slice().sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0));
  if (rabbi) list = list.filter(m => m['רב'] === rabbi);
  if (cat) list = list.filter(m => m['קטגוריה'] === cat);
  if (sid) list = list.filter(m => String(m['תלמיד_מזהה']) === sid);
  if (q) list = list.filter(m => Object.values(m).some(v => String(v||'').toLowerCase().includes(q)));

  const el = document.getElementById('co-list');
  document.getElementById('co-empty').classList.toggle('d-none', list.length > 0);
  const stuById = {};
  _convStudents.forEach(s => stuById[s['מזהה']] = s);
  el.innerHTML = list.map(m => convCardHtml(m, stuById)).join('');
}

function convCardHtml(m, stuById) {
  const stu = stuById[m['תלמיד_מזהה']];
  const stuName = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}`.trim() : '?';
  const dt = m['תאריך'] ? formatDateBoth(m['תאריך']) : '';
  let hdate = m['תאריך_עברי'] || '';
  let parsha = m['פרשה'] || '';
  if ((!hdate || !parsha) && m['תאריך']) {
    if (!hdate && typeof formatHebrewShort === 'function') hdate = formatHebrewShort(m['תאריך']);
    if (!parsha && typeof getParshaFor === 'function') parsha = getParshaFor(m['תאריך']);
  }
  const parshaBadge = parsha ? `<span class="badge bg-light text-dark border me-1">פר' ${escHtml(parsha)}</span>` : '';
  const hdateBadge = hdate ? `<span class="badge bg-light text-dark border me-1">${escHtml(hdate)}</span>` : '';
  const catBadge = m['קטגוריה'] ? `<span class="badge bg-primary-subtle text-primary-emphasis border me-1">${escHtml(m['קטגוריה'])}</span>` : '';
  const rabbiBadge = m['רב'] ? `<span class="badge bg-info-subtle text-info-emphasis border me-1"><i class="bi bi-person-fill"></i> ${escHtml(m['רב'])}</span>` : '';
  const linkedBadge = m['אירוע_מקושר'] ? `<span class="badge bg-warning-subtle text-warning-emphasis border me-1"><i class="bi bi-link"></i> אירוע #${escHtml(m['אירוע_מקושר'])}</span>` : '';
  return `<div class="card p-3 mb-2">
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div>
        <strong>${escHtml(stuName)}</strong>
        ${stu ? `<span class="text-muted ms-2">כיתה ${escHtml(stu['מחזור']||'')}</span>` : ''}
        ${rabbiBadge}${catBadge}${linkedBadge}
      </div>
      <div class="d-flex gap-1 align-items-center flex-wrap">
        ${parshaBadge}${hdateBadge}
        <small class="text-muted">${escHtml(dt)}</small>
        <button class="btn btn-sm btn-outline-primary p-1" onclick="convEdit(${m['מזהה']})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-danger p-1" onclick="convDelete(${m['מזהה']})"><i class="bi bi-trash"></i></button>
      </div>
    </div>
    ${m['נושא'] ? `<div class="mt-2"><strong>נושא:</strong> ${escHtml(m['נושא'])}</div>` : ''}
    ${m['תוכן'] ? `<div class="mt-2" style="white-space:pre-wrap;line-height:1.7">${escHtml(m['תוכן'])}</div>` : ''}
    ${m['הערות'] ? `<div class="mt-2 small text-muted">${escHtml(m['הערות'])}</div>` : ''}
  </div>`;
}

function convAddModal(existing) {
  const e = existing || {};
  const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
  const defaultRabbi = e['רב'] || sess.username || '';
  const sortedStu = _convStudents.slice().sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const html = `<div class="modal fade" id="co-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5>${existing ? 'עריכת' : ''} שיחה עם תלמיד</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="row g-2 mb-2">
        <div class="col-md-7"><label class="form-label">תלמיד</label>
          <select id="coa-student" class="form-select" onchange="convUpdateLinkedEvents(this.value)">
            <option value="">בחר תלמיד</option>
            ${sortedStu.map(s => `<option value="${s['מזהה']}" ${String(e['תלמיד_מזהה'])===String(s['מזהה'])?'selected':''}>${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-5"><label class="form-label">תאריך</label><input id="coa-date" type="date" class="form-control" value="${e['תאריך'] ? String(e['תאריך']).slice(0,10) : new Date().toISOString().slice(0,10)}"></div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-md-4"><label class="form-label">רב</label><input id="coa-rabbi" class="form-control" value="${escHtml(defaultRabbi)}"></div>
        <div class="col-md-4"><label class="form-label">קטגוריה</label>
          <select id="coa-cat" class="form-select">
            <option value="">—</option>
            ${CONV_CATEGORIES.map(c => `<option ${e['קטגוריה']===c?'selected':''}>${escHtml(c)}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-4"><label class="form-label">אירוע התנהגות מקושר</label>
          <select id="coa-linked" class="form-select">
            <option value="">— ללא —</option>
          </select>
        </div>
      </div>
      <div class="mb-2">
        <label class="form-label">תבניות מהירות</label>
        <div class="d-flex flex-wrap gap-1">
          ${CONV_TEMPLATES.map(([lbl, c, txt]) => `<button type="button" class="btn btn-sm btn-outline-secondary" onclick="convApplyTemplate('${escHtml(lbl)}','${escHtml(c)}','${escHtml(txt)}')">${escHtml(lbl)}</button>`).join('')}
        </div>
      </div>
      <div class="mb-2"><label class="form-label">נושא</label><input id="coa-topic" class="form-control" value="${escHtml(e['נושא']||'')}" placeholder="כותרת קצרה"></div>
      <div class="mb-2">
        <div class="d-flex justify-content-between align-items-center">
          <label class="form-label">תוכן השיחה</label>
          <button type="button" class="btn btn-sm btn-outline-primary" id="coa-mic-btn" onclick="convToggleMic()" title="הכתבה קולית"><i class="bi bi-mic"></i> הכתבה</button>
        </div>
        <textarea id="coa-content" class="form-control" rows="6">${escHtml(e['תוכן']||'')}</textarea>
      </div>
      <div class="mb-2"><label class="form-label">הערות</label><textarea id="coa-notes" class="form-control" rows="2">${escHtml(e['הערות']||'')}</textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="convSave(${existing ? e['מזהה'] : 'null'})">שמור</button>
    </div>
  </div></div></div>`;
  cleanupModal('co-modal');
  document.body.insertAdjacentHTML('beforeend', html);
  const _m = document.getElementById('co-modal');
  new bootstrap.Modal(_m).show();
  _m.addEventListener('hidden.bs.modal', () => { convStopMic(); cleanupModal('co-modal'); }, { once: true });
  // Pre-populate linked-event dropdown for the current student
  const curSid = document.getElementById('coa-student').value;
  if (curSid) convUpdateLinkedEvents(curSid, e['אירוע_מקושר']);
}

function convUpdateLinkedEvents(studentId, preselect) {
  const sel = document.getElementById('coa-linked');
  if (!sel) return;
  if (!studentId) { sel.innerHTML = '<option value="">— ללא —</option>'; return; }
  const recent = _convEvents
    .filter(e => String(e['תלמיד_מזהה']) === String(studentId))
    .sort((a,b) => new Date(b['תאריך']||0) - new Date(a['תאריך']||0))
    .slice(0, 30);
  sel.innerHTML = '<option value="">— ללא —</option>' + recent.map(ev => {
    const dt = ev['תאריך'] ? formatGreg(ev['תאריך']) : '';
    const sev = ev['חומרה'] ? ` (${ev['חומרה']})` : '';
    const txt = `${dt} · ${ev['קטגוריה']||''}${sev}`;
    const selAttr = String(preselect||'') === String(ev['מזהה']) ? ' selected' : '';
    return `<option value="${ev['מזהה']}"${selAttr}>${escHtml(txt)}</option>`;
  }).join('');
}

function convApplyTemplate(label, category, text) {
  const catSel = document.getElementById('coa-cat');
  if (catSel && category) catSel.value = category;
  const topic = document.getElementById('coa-topic');
  if (topic && !topic.value.trim()) topic.value = label;
  const content = document.getElementById('coa-content');
  if (content && text) {
    if (content.value.trim()) content.value = content.value + '\n' + text;
    else content.value = text;
    content.focus();
    content.selectionStart = content.selectionEnd = content.value.length;
  }
}

// ===== Voice-to-text (Web Speech API) =====
let _convRecog = null;
let _convRecogActive = false;

function convToggleMic() {
  if (_convRecogActive) return convStopMic();
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { notify('הדפדפן לא תומך בהכתבה קולית — נסה Chrome', 'warn'); return; }
  const recog = new SR();
  recog.lang = 'he-IL';
  recog.continuous = true;
  recog.interimResults = true;
  const ta = document.getElementById('coa-content');
  const baseText = ta.value;
  let finalSoFar = '';
  recog.onresult = ev => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalSoFar += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    const newText = (baseText ? baseText + (baseText.endsWith(' ')||baseText.endsWith('\n')?'':' ') : '') + finalSoFar + interim;
    ta.value = newText;
  };
  recog.onerror = (e) => {
    notify('שגיאה בהכתבה: ' + e.error, 'error');
    convStopMic();
  };
  recog.onend = () => {
    if (_convRecogActive) {
      // Auto-restart on temporary stops (common with Chrome continuous mode)
      try { recog.start(); } catch {}
    }
  };
  try { recog.start(); } catch (e) { notify('לא ניתן להפעיל מיקרופון', 'error'); return; }
  _convRecog = recog;
  _convRecogActive = true;
  const btn = document.getElementById('coa-mic-btn');
  if (btn) { btn.classList.remove('btn-outline-primary'); btn.classList.add('btn-danger'); btn.innerHTML = '<i class="bi bi-mic-fill"></i> עצור'; }
}

function convStopMic() {
  _convRecogActive = false;
  if (_convRecog) { try { _convRecog.stop(); } catch {} _convRecog = null; }
  const btn = document.getElementById('coa-mic-btn');
  if (btn) { btn.classList.remove('btn-danger'); btn.classList.add('btn-outline-primary'); btn.innerHTML = '<i class="bi bi-mic"></i> הכתבה'; }
}

function convEdit(id) {
  const m = _convData.find(x => String(x['מזהה']) === String(id));
  if (m) convAddModal(m);
}

async function convSave(editId) {
  convStopMic();
  const dateStr = document.getElementById('coa-date').value;
  const obj = {
    'תלמיד_מזהה': parseInt(document.getElementById('coa-student').value),
    'תאריך': dateStr,
    'רב': document.getElementById('coa-rabbi').value.trim(),
    'קטגוריה': document.getElementById('coa-cat').value,
    'נושא': document.getElementById('coa-topic').value.trim(),
    'תוכן': document.getElementById('coa-content').value.trim(),
    'הערות': document.getElementById('coa-notes').value.trim(),
    'אירוע_מקושר': document.getElementById('coa-linked').value,
  };
  if (!obj['תלמיד_מזהה']) return alert('בחר תלמיד');
  if (!obj['רב']) {
    const sess = JSON.parse(sessionStorage.getItem('user') || '{}');
    obj['רב'] = sess.username || 'לא ידוע';
  }
  // Auto-compute Hebrew date + parsha from the date field
  if (dateStr) {
    if (typeof formatHebrewShort === 'function') obj['תאריך_עברי'] = formatHebrewShort(dateStr);
    if (typeof getParshaFor === 'function') obj['פרשה'] = getParshaFor(dateStr);
  }
  if (editId) obj['מזהה'] = editId;
  const r = await api(editId ? 'updateConversation' : 'addConversation', [obj]);
  if (r.ok) {
    hideModal('co-modal');
    notify('נשמר', 'success');
    renderConversations();
  } else alert(r.error || 'שגיאה');
}

async function convDelete(id) {
  if (!confirm('למחוק את השיחה?')) return;
  const r = await api('deleteConversation', [id]);
  if (r.ok) { notify('נמחק', 'success'); renderConversations(); } else alert(r.error || 'שגיאה במחיקה');
}
