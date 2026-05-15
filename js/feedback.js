// Feedback / bug-report / feature-request page (admin only)

async function renderFeedback() {
  const cu = currentUser || {};
  if (cu.role !== 'מנהל' && cu.permissions !== 'all') {
    document.getElementById('page-feedback').innerHTML = `
      <div class="alert alert-warning">דף זה זמין רק למנהל הכללי.</div>
      <button class="btn btn-link" onclick="goto('home')">חזרה</button>`;
    return;
  }
  const root = document.getElementById('page-feedback');
  root.innerHTML = `
    <div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
      <div>
        <h3 class="mb-0">📮 בקשות תיקון / שדרוג</h3>
        <div class="text-muted small">בקשות לסוכן — שלח כאן באג, רעיון, או בקשה כללית. תקבל תשובה במייל כשבוצע.</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-secondary" onclick="loadFeedbackList()"><i class="bi bi-arrow-clockwise"></i> רענן</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="goto('home')"><i class="bi bi-house"></i></button>
      </div>
    </div>

    <div class="card p-3 mb-3 shadow-sm">
      <h6><i class="bi bi-pencil-square text-primary"></i> בקשה חדשה</h6>
      <div class="row g-2">
        <div class="col-md-3"><label class="form-label small mb-1">סוג</label>
          <select class="form-select form-select-sm" id="fb-kind">
            <option value="באג">🐞 באג / משהו לא עובד</option>
            <option value="שדרוג">⚡ שדרוג / שיפור</option>
            <option value="פיצ'ר חדש">✨ פיצ'ר חדש</option>
            <option value="שאלה">❓ שאלה</option>
          </select>
        </div>
        <div class="col-md-3"><label class="form-label small mb-1">דחיפות</label>
          <select class="form-select form-select-sm" id="fb-urgency">
            <option value="רגיל">🟢 רגיל</option>
            <option value="דחוף">🟡 דחוף</option>
            <option value="קריטי">🔴 קריטי - לא עובד בכלל</option>
          </select>
        </div>
        <div class="col-md-6"><label class="form-label small mb-1">כותרת קצרה</label>
          <input class="form-control form-control-sm" id="fb-title" placeholder="לדוגמה: ייבוא תלמידים לא מציג כפתור אישור">
        </div>
        <div class="col-12"><label class="form-label small mb-1">תיאור מפורט</label>
          <textarea class="form-control" id="fb-desc" rows="5" placeholder="תספר בדיוק מה קרה / מה שאתה רוצה.&#10;&#10;לדוגמה:&#10;• באיזה דף היית?&#10;• על איזה כפתור לחצת?&#10;• מה ראית?&#10;• מה ציפית שיקרה?"></textarea>
        </div>
        <div class="col-12 d-flex gap-2 align-items-center">
          <button class="btn btn-primary" id="fb-submit-btn" onclick="submitFeedback()">
            <i class="bi bi-send"></i> שלח בקשה
          </button>
          <span class="text-muted small">הבקשה תישלח גם במייל לסוכן (יוסי) ותתקבל תשובה כשהיא תטופל.</span>
        </div>
      </div>
    </div>

    <div class="card p-3 shadow-sm">
      <h6><i class="bi bi-list-check text-success"></i> בקשות אחרונות</h6>
      <div id="feedback-list">טוען…</div>
    </div>
  `;
  loadFeedbackList();
}
window.renderFeedback = renderFeedback;

async function submitFeedback() {
  const kind = document.getElementById('fb-kind').value;
  const urgency = document.getElementById('fb-urgency').value;
  const title = document.getElementById('fb-title').value.trim();
  const desc = document.getElementById('fb-desc').value.trim();
  if (!title || !desc) { alert('צריך למלא כותרת ותיאור'); return; }
  const cu = currentUser || {};
  const senderName = cu.full_name || cu.username || '(לא ידוע)';
  const senderEmail = cu.email || (cu.username + '@' + (location.hostname));
  const btn = document.getElementById('fb-submit-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> שולח…';
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        action: 'cheder_submitFeedback', token: AGENT_TOKEN, instance: INSTANCE,
        sender: senderName, senderEmail, kind, urgency, title, desc
      }).toString()
    });
    const d = await r.json();
    if (d.ok) {
      alert('✅ הבקשה נשלחה!\n\nמזהה: ' + d.id + '\n\nתקבל מייל כאשר היא תטופל.');
      document.getElementById('fb-title').value = '';
      document.getElementById('fb-desc').value = '';
      loadFeedbackList();
    } else {
      alert('שגיאה: ' + (d.error || 'לא ידוע'));
    }
  } catch (e) {
    alert('שגיאת רשת: ' + e.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-send"></i> שלח בקשה';
  }
}
window.submitFeedback = submitFeedback;

async function loadFeedbackList() {
  const el = document.getElementById('feedback-list');
  el.innerHTML = '<div class="text-muted">טוען…</div>';
  try {
    const params = new URLSearchParams({
      action: 'cheder_listRows', token: AGENT_TOKEN, instance: INSTANCE, tab: 'בקשות',
    });
    const r = await fetch(APPS_SCRIPT_URL + '?' + params.toString());
    const d = await r.json();
    if (!d.ok) {
      if (String(d.error||'').indexOf('tab not found') >= 0) {
        el.innerHTML = '<div class="text-muted text-center py-3">עוד אין בקשות. תהיה הראשון!</div>';
        return;
      }
      el.innerHTML = `<div class="text-danger">${escHtml(d.error||'שגיאה')}</div>`;
      return;
    }
    const rows = (d.rows || []).reverse().slice(0, 20);
    if (!rows.length) {
      el.innerHTML = '<div class="text-muted text-center py-3">עוד אין בקשות.</div>';
      return;
    }
    el.innerHTML = '<table class="table table-sm table-hover mb-0"><thead><tr>' +
      '<th>תאריך</th><th>סוג</th><th>דחיפות</th><th>כותרת</th><th>שולח</th><th>סטטוס</th><th>סיכום תיקון</th><th>פעולות</th>' +
      '</tr></thead><tbody>' + rows.map(r => {
        const ts = r['חותמת זמן'];
        const tsStr = ts ? new Date(ts).toLocaleString('he-IL') : '';
        const status = String(r['סטטוס']||'פתוח');
        const statusBadge = status === 'תוקן' ? '<span class="badge bg-success">✅ תוקן</span>'
                          : status === 'בטיפול' ? '<span class="badge bg-warning text-dark">🔧 בטיפול</span>'
                          : status === 'נדחה' ? '<span class="badge bg-secondary">🚫 נדחה</span>'
                          : '<span class="badge bg-primary">📮 פתוח</span>';
        const urgIcon = r['דחיפות']==='קריטי' ? '🔴' : r['דחיפות']==='דחוף' ? '🟡' : '🟢';
        const fid = r['מזהה'];
        const isOpen = (status === 'פתוח' || status === 'בטיפול');
        const actionsHtml = isOpen ? `
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-success" onclick="resolveFeedbackPrompt('${fid}','${(r['כותרת']||'').replace(/'/g,'&#39;')}','תוקן')" title="סמן כתוקן">✓</button>
            <button class="btn btn-outline-warning" onclick="resolveFeedbackPrompt('${fid}','${(r['כותרת']||'').replace(/'/g,'&#39;')}','בטיפול')" title="בטיפול">🔧</button>
            <button class="btn btn-outline-secondary" onclick="resolveFeedbackPrompt('${fid}','${(r['כותרת']||'').replace(/'/g,'&#39;')}','נדחה')" title="דחה">✗</button>
          </div>` : `<span class="text-muted small">סגור</span>`;
        return `<tr>
          <td class="small">${escHtml(tsStr)}</td>
          <td class="small">${escHtml(r['סוג']||'')}</td>
          <td class="small">${urgIcon} ${escHtml(r['דחיפות']||'')}</td>
          <td><strong>${escHtml(r['כותרת']||'')}</strong><br><small class="text-muted">${escHtml((r['תיאור']||'').slice(0,80))}${(r['תיאור']||'').length>80?'...':''}</small></td>
          <td class="small">${escHtml(r['שולח']||'')}</td>
          <td>${statusBadge}</td>
          <td class="small">${escHtml((r['סיכום תיקון']||'').slice(0,120))}</td>
          <td>${actionsHtml}</td>
        </tr>`;
      }).join('') + '</tbody></table>';
  } catch (e) {
    el.innerHTML = `<div class="text-danger">שגיאה: ${escHtml(e.message)}</div>`;
  }
}
window.loadFeedbackList = loadFeedbackList;

async function resolveFeedbackPrompt(feedbackId, title, status) {
  const labels = {'תוקן':'תוקן (יישלח מייל למבקש)', 'בטיפול':'בטיפול', 'נדחה':'נדחה'};
  const summary = prompt(`עדכון לבקשה: "${title}"\nסטטוס חדש: ${labels[status]||status}\n\nכתוב סיכום (יישלח למבקש במייל אם הסטטוס "תוקן"):`, '');
  if (summary === null) return;  // user cancelled
  try {
    const r = await fetch(APPS_SCRIPT_URL, {
      method: 'POST', mode: 'cors',
      headers: {'Content-Type':'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        action: 'cheder_resolveFeedback',
        token: AGENT_TOKEN,
        instance: INSTANCE,
        feedbackId, status,
        summary: summary || '(ללא סיכום)',
        handler: (currentUser && currentUser.username) || 'admin',
      }).toString()
    });
    const d = await r.json();
    if (d.ok) {
      alert(`✅ הסטטוס עודכן ל"${status}".${status==='תוקן' ? '\nנשלח מייל למבקש.' : ''}`);
      loadFeedbackList();
    } else {
      alert('שגיאה: ' + (d.error||'לא ידוע'));
    }
  } catch (e) {
    alert('שגיאת רשת: ' + e.message);
  }
}
window.resolveFeedbackPrompt = resolveFeedbackPrompt;
