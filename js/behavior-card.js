// behavior-card.js — כרטיס תלמיד משופר בתוך מעקב התנהגות. נכתב 2026-05-21.
// תצוגה אחת מאוחדת לכל מידע התלמיד: פרטים אישיים, סטטיסטיקות התנהגות,
// היסטוריה, חתימות שהוגשו, משימות פתוחות, אירועים אחרונים.
// כפתור הדפסה עם פריסה מסודרת ל-A4 + אפשרות ייצוא PDF.

let _bcSelectedStudent = null;
let _bcSignatures = null;
let _bcTasks = null;

async function renderCardTab(rootEl) {
  rootEl.innerHTML = `
    <div class="card p-3 mb-3">
      <div class="row g-2 align-items-end">
        <div class="col-md-9">
          <label class="form-label">בחר תלמיד</label>
          <select id="bc-student" class="form-select">
            <option value="">— בחר תלמיד —</option>
            ${_allStudents.filter(s => (s['סטטוס']||'פעיל') !== 'סיים').sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'')).map(s => `<option value="${escHtml(s['מזהה'])}">${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}${s['מחזור']?' — כיתה ' + s['מחזור']:''}</option>`).join('')}
          </select>
        </div>
        <div class="col-md-3">
          <button class="btn btn-primary w-100" onclick="bcPrintCard()" id="bc-print-btn" disabled><i class="bi bi-printer"></i> הדפסה / PDF</button>
        </div>
      </div>
    </div>
    <div id="bc-content"></div>`;

  const restored = sessionStorage.getItem('bc_selected_student');
  if (restored) {
    document.getElementById('bc-student').value = restored;
  }
  document.getElementById('bc-student').onchange = () => bcLoadStudent(document.getElementById('bc-student').value);
  if (document.getElementById('bc-student').value) {
    bcLoadStudent(document.getElementById('bc-student').value);
  }
}

async function bcLoadStudent(sid) {
  sessionStorage.setItem('bc_selected_student', sid || '');
  const content = document.getElementById('bc-content');
  const printBtn = document.getElementById('bc-print-btn');
  if (!sid) {
    content.innerHTML = '<div class="text-center py-5 text-muted"><i class="bi bi-person-vcard fs-1"></i><p>בחר תלמיד מהרשימה</p></div>';
    printBtn.disabled = true;
    _bcSelectedStudent = null;
    return;
  }
  _bcSelectedStudent = _allStudents.find(s => String(s['מזהה']) === String(sid));
  if (!_bcSelectedStudent) {
    content.innerHTML = '<div class="alert alert-danger">התלמיד לא נמצא</div>';
    return;
  }
  printBtn.disabled = false;
  content.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary"></div></div>';

  // Lazy-load signatures + tasks (cached after first load)
  if (_bcSignatures === null) {
    const r = await api('listSignatures', []);
    _bcSignatures = r.data || [];
  }
  if (_bcTasks === null) {
    const r = await api('listTasks', []);
    _bcTasks = r.data || [];
  }
  bcRenderStudentDetails();
}

function bcRenderStudentDetails() {
  const stu = _bcSelectedStudent;
  if (!stu) return;
  const studentEvents = _events.filter(e => String(e['תלמיד_מזהה']) === String(stu['מזהה']));
  const studentSigs = _bcSignatures.filter(s => String(s['תלמיד_מזהה']) === String(stu['מזהה']));
  const studentTasks = _bcTasks.filter(t => String(t['תלמיד_מזהה']) === String(stu['מזהה']));

  const total = studentEvents.length;
  const high = studentEvents.filter(e => e['חומרה'] === 'גבוהה').length;
  const last30 = studentEvents.filter(e => e['תאריך'] && (Date.now() - new Date(e['תאריך']).getTime()) < 30 * 86400000).length;
  const openTasks = studentTasks.filter(t => t['סטטוס'] !== 'הושלם').length;
  const overdueTasks = studentTasks.filter(t => t['סטטוס'] !== 'הושלם' && t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date()).length;
  const pendingSigs = studentSigs.filter(s => s['סטטוס'] === 'מחכה').length;

  // Category breakdown
  const byCat = {};
  studentEvents.forEach(e => { byCat[e['קטגוריה']] = (byCat[e['קטגוריה']]||0) + 1; });
  const catList = Object.entries(byCat).sort((a,b) => b[1]-a[1]).slice(0, 8);

  document.getElementById('bc-content').innerHTML = `
    <div class="card p-3 mb-3">
      <div class="row g-2">
        <div class="col-md-8">
          <h3 class="mb-1">${escHtml((stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||''))}</h3>
          <div class="text-muted">${stu['מחזור']?'כיתה ' + escHtml(stu['מחזור']):''} ${stu['סטטוס']?' · ' + escHtml(stu['סטטוס']):''}</div>
        </div>
        <div class="col-md-4 text-md-end">
          ${stu['טלפון']?`<div class="small"><i class="bi bi-phone"></i> ${escHtml(stu['טלפון'])}</div>`:''}
          ${stu['הורה_אב']?`<div class="small"><i class="bi bi-person"></i> אב: ${escHtml(stu['הורה_אב'])}</div>`:''}
          ${stu['הורה_אם']?`<div class="small"><i class="bi bi-person"></i> אם: ${escHtml(stu['הורה_אם'])}</div>`:''}
        </div>
      </div>
    </div>

    <div class="row g-2 mb-3">
      <div class="col-6 col-md-3"><div class="card p-3 text-center"><div class="display-6 text-primary">${total}</div><div class="small text-muted">סך אירועים</div></div></div>
      <div class="col-6 col-md-3"><div class="card p-3 text-center"><div class="display-6 text-danger">${high}</div><div class="small text-muted">חומרה גבוהה</div></div></div>
      <div class="col-6 col-md-3"><div class="card p-3 text-center"><div class="display-6 text-warning">${last30}</div><div class="small text-muted">חודש אחרון</div></div></div>
      <div class="col-6 col-md-3"><div class="card p-3 text-center"><div class="display-6 ${overdueTasks?'text-danger':'text-success'}">${openTasks}</div><div class="small text-muted">משימות פתוחות${overdueTasks?` (${overdueTasks} פגי תוקף)`:''}</div></div></div>
    </div>

    <div class="row g-3">
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-bar-chart"></i> פיצול לפי קטגוריות</h6>
          ${catList.length ? catList.map(([cat, n]) => {
            const pct = Math.round(n / total * 100);
            return `<div class="mb-2">
              <div class="d-flex justify-content-between small"><span>${escHtml(cat||'(ללא)')}</span><strong>${n}</strong></div>
              <div class="progress" style="height:8px"><div class="progress-bar" style="width:${pct}%"></div></div>
            </div>`;
          }).join('') : '<div class="text-muted small">אין אירועים</div>'}
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-pen-fill"></i> חתימות הורים (${studentSigs.length})${pendingSigs?` <span class="badge bg-warning text-dark">${pendingSigs} ממתינות</span>`:''}</h6>
          ${studentSigs.length ? studentSigs.slice(0, 5).map(s => `<div class="small mb-1 d-flex justify-content-between">
            <span>${escHtml(s['סוג']||'-')}</span>
            <span class="text-muted">${s['תאריך']?(typeof formatGreg==='function'?formatGreg(s['תאריך']):s['תאריך']):''}</span>
            <span class="badge ${s['סטטוס']==='חתום'?'bg-success-subtle text-success-emphasis':'bg-warning-subtle text-warning-emphasis'}">${escHtml(s['סטטוס']||'')}</span>
          </div>`).join('') : '<div class="text-muted small">אין חתימות</div>'}
          ${studentSigs.length > 5 ? `<div class="small text-muted">+${studentSigs.length-5} נוספות</div>` : ''}
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-list-check"></i> משימות פתוחות (${openTasks})</h6>
          ${studentTasks.filter(t => t['סטטוס'] !== 'הושלם').slice(0, 6).map(t => {
            const overdue = t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date();
            return `<div class="small mb-1 d-flex justify-content-between">
              <span>${escHtml(t['כותרת']||'(ללא)')}</span>
              <span class="${overdue?'text-danger fw-bold':'text-muted'}">${t['תאריך_יעד']?(typeof formatGreg==='function'?formatGreg(t['תאריך_יעד']):t['תאריך_יעד']):''}</span>
            </div>`;
          }).join('') || '<div class="text-muted small">אין משימות פתוחות</div>'}
        </div>
      </div>
      <div class="col-md-6">
        <div class="card p-3 h-100">
          <h6><i class="bi bi-clock-history"></i> אירועים אחרונים</h6>
          ${studentEvents.slice(0, 6).map(e => {
            const sev = e['חומרה']==='גבוהה'?'text-danger':e['חומרה']==='נמוכה'?'text-success':'text-warning';
            return `<div class="small mb-1 d-flex justify-content-between">
              <span><span class="${sev}">●</span> ${escHtml(e['קטגוריה']||'')}</span>
              <span class="text-muted">${e['תאריך']?(typeof formatGreg==='function'?formatGreg(e['תאריך']):e['תאריך']):''}</span>
            </div>`;
          }).join('') || '<div class="text-muted small">אין אירועים</div>'}
        </div>
      </div>
    </div>`;
}

function bcPrintCard() {
  if (!_bcSelectedStudent) return alert('בחר תלמיד');
  const stu = _bcSelectedStudent;
  const studentEvents = _events.filter(e => String(e['תלמיד_מזהה']) === String(stu['מזהה'])).slice(0, 30);
  const studentSigs = _bcSignatures.filter(s => String(s['תלמיד_מזהה']) === String(stu['מזהה']));
  const studentTasks = _bcTasks.filter(t => String(t['תלמיד_מזהה']) === String(stu['מזהה']));

  const total = studentEvents.length;
  const high = studentEvents.filter(e => e['חומרה'] === 'גבוהה').length;
  const last30 = studentEvents.filter(e => e['תאריך'] && (Date.now() - new Date(e['תאריך']).getTime()) < 30 * 86400000).length;
  const openTasks = studentTasks.filter(t => t['סטטוס'] !== 'הושלם').length;

  const byCat = {};
  studentEvents.forEach(e => { byCat[e['קטגוריה']] = (byCat[e['קטגוריה']]||0) + 1; });

  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>כרטיס תלמיד — ${escHtml((stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||''))}</title>
<style>
@page{size:A4;margin:1.2cm}
body{font-family:Arial,Heebo,sans-serif;direction:rtl;color:#111;line-height:1.45;font-size:11pt}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:6pt;margin:0 0 12pt 0;font-size:20pt}
h2{color:#0066cc;border-bottom:1px solid #d1d5db;padding-bottom:3pt;margin:14pt 0 6pt;font-size:13pt}
.meta{color:#374151;margin:6pt 0;font-size:10pt}
.meta b{color:#111}
.stats{display:flex;gap:8pt;margin:8pt 0;flex-wrap:wrap}
.stat{flex:1;min-width:80pt;border:1px solid #d1d5db;border-radius:6px;padding:6pt 8pt;text-align:center;background:#f9fafb}
.stat .n{font-size:18pt;font-weight:bold;color:#0066cc}
.stat .l{font-size:8.5pt;color:#6b7280}
table{width:100%;border-collapse:collapse;font-size:10pt;margin-top:4pt}
th{background:#f3f4f6;text-align:right;padding:4pt 6pt;border:1px solid #d1d5db;font-weight:600}
td{padding:4pt 6pt;border:1px solid #e5e7eb;vertical-align:top}
.high{color:#dc2626;font-weight:bold}
.mid{color:#d97706}
.low{color:#16a34a}
.handled{background:#d1fae5}
.footer{margin-top:24pt;padding-top:8pt;border-top:1px solid #d1d5db;color:#6b7280;font-size:9pt;text-align:center}
@media print{button{display:none}}
</style></head><body>
<button onclick="window.print()" style="background:#0066cc;color:#fff;border:none;padding:8pt 16pt;border-radius:5px;cursor:pointer;font-size:11pt;margin-bottom:10pt">🖨 הדפס / שמור כ-PDF</button>
<h1>כרטיס תלמיד — ${escHtml((stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||''))}</h1>
<div class="meta">
  ${stu['מחזור']?`<b>כיתה:</b> ${escHtml(stu['מחזור'])} &nbsp; · &nbsp;`:''}
  ${stu['סטטוס']?`<b>סטטוס:</b> ${escHtml(stu['סטטוס'])} &nbsp; · &nbsp;`:''}
  <b>נוצר:</b> ${new Date().toLocaleDateString('he-IL')}
</div>
${stu['טלפון'] || stu['הורה_אב'] || stu['הורה_אם'] ? `
<div class="meta">
  ${stu['טלפון']?`<b>טלפון:</b> ${escHtml(stu['טלפון'])} &nbsp; · &nbsp;`:''}
  ${stu['הורה_אב']?`<b>אב:</b> ${escHtml(stu['הורה_אב'])} &nbsp; · &nbsp;`:''}
  ${stu['הורה_אם']?`<b>אם:</b> ${escHtml(stu['הורה_אם'])}`:''}
</div>` : ''}

<div class="stats">
  <div class="stat"><div class="n">${total}</div><div class="l">סך אירועים</div></div>
  <div class="stat"><div class="n" style="color:#dc2626">${high}</div><div class="l">חומרה גבוהה</div></div>
  <div class="stat"><div class="n" style="color:#d97706">${last30}</div><div class="l">חודש אחרון</div></div>
  <div class="stat"><div class="n">${studentSigs.length}</div><div class="l">חתימות הורים</div></div>
  <div class="stat"><div class="n">${openTasks}</div><div class="l">משימות פתוחות</div></div>
</div>

${Object.keys(byCat).length ? `<h2>פיצול לפי קטגוריה</h2>
<table><thead><tr><th>קטגוריה</th><th>כמות</th><th>אחוז</th></tr></thead><tbody>
${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,n]) => `<tr><td>${escHtml(cat||'(ללא)')}</td><td>${n}</td><td>${Math.round(n/total*100)}%</td></tr>`).join('')}
</tbody></table>` : ''}

${studentEvents.length ? `<h2>אירועים אחרונים</h2>
<table><thead><tr><th>תאריך</th><th>קטגוריה</th><th>חומרה</th><th>תיאור</th><th>טופל</th></tr></thead><tbody>
${studentEvents.map(e => {
  const sev = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
  const handled = String(e['טופל']||'') === 'כן' || e['טופל'] === true;
  return `<tr class="${handled?'handled':''}">
    <td>${e['תאריך']?(typeof formatGreg==='function'?formatGreg(e['תאריך']):e['תאריך']):''}</td>
    <td>${escHtml(e['קטגוריה']||'')}</td>
    <td class="${sev}">${escHtml(e['חומרה']||'')}</td>
    <td>${escHtml((e['תיאור']||'').slice(0,100))}</td>
    <td>${handled?'✓':''}</td>
  </tr>`;
}).join('')}
</tbody></table>` : ''}

${studentSigs.length ? `<h2>חתימות הורים</h2>
<table><thead><tr><th>תאריך</th><th>סוג</th><th>סטטוס</th><th>הערות</th></tr></thead><tbody>
${studentSigs.map(s => `<tr>
  <td>${s['תאריך']?(typeof formatGreg==='function'?formatGreg(s['תאריך']):s['תאריך']):''}</td>
  <td>${escHtml(s['סוג']||'')}</td>
  <td>${escHtml(s['סטטוס']||'')}</td>
  <td>${escHtml((s['הערות']||'').slice(0,80))}</td>
</tr>`).join('')}
</tbody></table>` : ''}

${studentTasks.length ? `<h2>משימות</h2>
<table><thead><tr><th>כותרת</th><th>סטטוס</th><th>עדיפות</th><th>יעד</th><th>אחראי</th></tr></thead><tbody>
${studentTasks.map(t => {
  const overdue = t['סטטוס']!=='הושלם' && t['תאריך_יעד'] && new Date(t['תאריך_יעד']) < new Date();
  return `<tr class="${overdue?'high':''}">
    <td>${escHtml(t['כותרת']||'')}</td>
    <td>${escHtml(t['סטטוס']||'')}</td>
    <td>${escHtml(t['עדיפות']||'')}</td>
    <td>${t['תאריך_יעד']?(typeof formatGreg==='function'?formatGreg(t['תאריך_יעד']):t['תאריך_יעד']):''}</td>
    <td>${escHtml(t['אחראי']||'')}</td>
  </tr>`;
}).join('')}
</tbody></table>` : ''}

<div class="footer">בית התלמוד · בית שמש — מעקב התנהגות · נוצר ${new Date().toLocaleString('he-IL')}</div>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return alert('הדפדפן חוסם פופ-אפ — אפשר אותו ונסה שוב');
  w.document.write(html);
  w.document.close();
}
