// Reports page — weekly/monthly/class reports + PDF + Gmail

async function renderReports() {
  const html = `
    <div class="mb-3"><button class="btn btn-link p-0" onclick="goto('home')"><i class="bi bi-arrow-right"></i> חזרה לתפריט</button></div>
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="mb-0"><i class="bi bi-file-earmark-pdf"></i> דוחות</h3>
    </div>
    <div class="row g-3">
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportWeekly()">
          <h5><i class="bi bi-calendar-week text-primary"></i> דוח שבועי</h5>
          <p class="text-muted small mb-0">סיכום אירועי ההתנהגות והפעילות מה‑7 ימים האחרונים</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportMonthly()">
          <h5><i class="bi bi-calendar-month text-info"></i> דוח חודשי</h5>
          <p class="text-muted small mb-0">סיכום החודש עם ממוצעי תפקוד, מבחנים ומגמות</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportQuarterly()">
          <h5><i class="bi bi-calendar2-range text-primary"></i> דוח רבעוני</h5>
          <p class="text-muted small mb-0">סיכום 3 חודשים מלא — כל הנתונים, מגמות, השוואה</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportAnnual()">
          <h5><i class="bi bi-calendar-event text-success"></i> דוח שנתי</h5>
          <p class="text-muted small mb-0">דוח מלא של תשפ"ו — כל הנתונים מכל המודולים</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportRange()">
          <h5><i class="bi bi-funnel text-warning"></i> טווח מותאם</h5>
          <p class="text-muted small mb-0">בחר תקופה כלשהי וקבל דוח מלא</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportClass()">
          <h5><i class="bi bi-grid-3x3-gap text-success"></i> דוח כיתתי</h5>
          <p class="text-muted small mb-0">בחר כיתה ותצוגה מפורטת של כל התלמידים בה</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportParent()">
          <h5><i class="bi bi-envelope-fill text-warning"></i> דוח להורים — PDF</h5>
          <p class="text-muted small mb-0">בחר תלמיד, צור PDF מעוצב ושלח להורים ב‑Gmail</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportFlags()">
          <h5><i class="bi bi-flag-fill text-danger"></i> דוח דגלים</h5>
          <p class="text-muted small mb-0">תלמידים עם אירועי חומרה גבוהה השבוע</p>
        </div>
      </div>
      <div class="col-md-6 col-lg-4">
        <div class="card p-4 h-100" style="cursor:pointer" onclick="genReportTests()">
          <h5><i class="bi bi-pencil-square text-info"></i> דוח מבחנים</h5>
          <p class="text-muted small mb-0">ממוצעי מבחנים לפי תלמיד, פרשה וסוג</p>
        </div>
      </div>
    </div>`;
  document.getElementById('page-reports').innerHTML = html;
}

function openPrintWindow(htmlContent, title) {
  const w = window.open('', '_blank');
  if (!w) { alert('הדפדפן חוסם פופ‑אפ — אפשר אותו ונסה שוב'); return; }
  w.document.write(htmlContent);
  w.document.close();
}

function reportHeader(title) {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>
@page{size:A4;margin:1.5cm}
body{font-family:Arial,sans-serif;direction:rtl;color:#1f2937}
h1{color:#0066cc;border-bottom:3px solid #0066cc;padding-bottom:8pt;margin-bottom:4pt}
h2{color:#1e40af;margin-top:16pt}
.subtitle{color:#6b7280;margin-top:0}
table{width:100%;border-collapse:collapse;margin:10pt 0;font-size:10pt}
th{background:#f3f4f6;padding:6pt;border:1px solid #d1d5db;text-align:right}
td{padding:5pt;border:1px solid #e5e7eb}
.event{margin:6pt 0;padding:8pt;border-right:4px solid #0066cc;background:#f9fafb}
.event.high{border-color:#dc2626;background:#fef2f2}
.event.mid{border-color:#f59e0b;background:#fffbeb}
.event.low{border-color:#16a34a;background:#f0fdf4}
.kpi{display:inline-block;padding:8pt 12pt;margin:4pt;background:#eff6ff;border-radius:6px}
.kpi strong{font-size:18pt;color:#0066cc;display:block}
@media print{.no-print{display:none}}
</style></head><body>
<button class="no-print" onclick="window.print()" style="background:#0066cc;color:#fff;border:none;padding:10pt 20pt;border-radius:6px;cursor:pointer;font-size:14pt">🖨 הדפס / שמור כ‑PDF</button>
<h1>${escHtml(title)}</h1>
<p class="subtitle">בית התלמוד · בית שמש · ${formatDateBoth(new Date())}</p>`;
}

function reportFooter() {
  return `<script>
const _doPrint = () => window.print();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(_doPrint, 200));
else window.addEventListener('load', () => setTimeout(_doPrint, 800));
</script></body></html>`;
}

// Generates a comprehensive period report between two dates
function genFullPeriodReport(from, to, title) {
  const data = getVisibleData();
  const fromTs = from.getTime();
  const toTs = to.getTime() + 24*3600*1000;

  const events = (data.behavior||[]).filter(e => {
    const t = dateMs(e['תאריך']);
    return t >= fromTs && t < toTs;
  }).sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));

  const meetings = (data.meetings||[]).filter(m => {
    if (!m['תאריך']) return false;
    const t = dateMs(m['תאריך']);
    return t >= fromTs && t < toTs;
  });

  const att = (data.attendance||[]).filter(a => {
    if (!a['תאריך']) return false;
    const t = dateMs(a['תאריך']);
    return t >= fromTs && t < toTs;
  });

  const funcs = (data.functioning||[]).filter(f => {
    if (!f['תאריך']) return true;
    const t = dateMs(f['תאריך']);
    return t >= fromTs && t < toTs;
  });

  const tests = (data.tests||[]).filter(t => {
    if (!t['תאריך']) return true;
    const ts = dateMs(t['תאריך']);
    return ts >= fromTs && ts < toTs;
  });

  const high = events.filter(e => e['חומרה'] === 'גבוהה').length;
  const mid = events.filter(e => e['חומרה'] === 'בינונית').length;
  const low = events.filter(e => e['חומרה'] === 'נמוכה').length;
  const attPresent = att.filter(a => a['סטטוס']==='נוכח').length;
  const attAbsent = att.filter(a => a['סטטוס']==='חיסר').length;
  const attLate = att.filter(a => a['סטטוס']==='איחור').length;

  // By category
  const byCat = {};
  events.forEach(e => { const c = e['קטגוריה']||'אחר'; byCat[c] = (byCat[c]||0) + 1; });
  // By student
  const byStu = {};
  events.forEach(e => { const sid = e['תלמיד_מזהה']; byStu[sid] = (byStu[sid]||0) + 1; });
  // By reporter
  const byReporter = {};
  events.forEach(e => { const r = e['דווח_עי']||'לא ידוע'; byReporter[r] = (byReporter[r]||0) + 1; });
  // By class
  const byClass = {};
  events.forEach(e => {
    const stu = (data.students||[]).find(s => String(s['מזהה'])===String(e['תלמיד_מזהה']));
    const c = stu ? stu['מחזור'] : 'לא ידוע';
    byClass[c] = (byClass[c]||0) + 1;
  });
  // Functioning by cat
  const fnByCat = {};
  funcs.forEach(f => {
    const c = f['קטגוריה'] || 'אחר';
    if (!fnByCat[c]) fnByCat[c] = { sum: 0, n: 0 };
    fnByCat[c].sum += parseFloat(f['ציון']) || 0;
    fnByCat[c].n += 1;
  });
  // Tests by type
  const testsByType = {};
  tests.forEach(t => {
    const type = t['סוג'] || 'אחר';
    if (!testsByType[type]) testsByType[type] = { sum: 0, n: 0 };
    testsByType[type].sum += parseFloat(t['ציון']) || 0;
    testsByType[type].n += 1;
  });
  // Monthly distribution (for multi-month reports)
  const byMonth = {};
  events.forEach(e => {
    if (!e['תאריך']) return;
    const d = new Date(e['תאריך']);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    byMonth[key] = (byMonth[key]||0) + 1;
  });

  let html = reportHeader(title);
  html += `<p class="subtitle">תקופה: ${escHtml(formatDateBoth(from))} עד ${escHtml(formatDateBoth(to))}</p>`;

  html += `<div>
    <div class="kpi"><strong>${events.length}</strong>אירועים</div>
    <div class="kpi"><strong style="color:#dc2626">${high}</strong>חומרה גבוהה</div>
    <div class="kpi"><strong>${mid}</strong>בינונית</div>
    <div class="kpi"><strong>${low}</strong>נמוכה</div>
    <div class="kpi"><strong>${new Set(events.map(e=>e['תלמיד_מזהה'])).size}</strong>תלמידים מעורבים</div>
    <div class="kpi"><strong>${meetings.length}</strong>אסיפות הורים</div>
    <div class="kpi"><strong style="color:#f59e0b">${attAbsent}</strong>חיסור</div>
    <div class="kpi"><strong style="color:#0891b2">${attLate}</strong>איחור</div>
  </div>`;

  // Distribution over time (months)
  if (Object.keys(byMonth).length > 1) {
    html += '<h2>פילוח אירועים לפי חודש</h2><table><tr><th>חודש</th><th>אירועים</th></tr>';
    Object.entries(byMonth).sort((a,b) => a[0].localeCompare(b[0])).forEach(([m, n]) => {
      const [y, mm] = m.split('-');
      const d = new Date(parseInt(y), parseInt(mm)-1, 1);
      const monLabel = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
      html += `<tr><td>${escHtml(monLabel)}</td><td><strong>${n}</strong></td></tr>`;
    });
    html += '</table>';
  }

  // Class distribution
  if (Object.keys(byClass).length) {
    html += '<h2>פילוח לפי כיתה</h2><table><tr><th>כיתה</th><th>אירועים</th><th>%</th></tr>';
    const total = events.length || 1;
    Object.entries(byClass).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => {
      html += `<tr><td>כיתה ${escHtml(c)}</td><td>${n}</td><td>${Math.round(n/total*100)}%</td></tr>`;
    });
    html += '</table>';
  }

  // Category breakdown
  if (Object.keys(byCat).length) {
    html += '<h2>פילוח לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th>אירועים</th><th>%</th></tr>';
    const total = events.length || 1;
    Object.entries(byCat).sort((a,b) => b[1]-a[1]).forEach(([c, n]) => {
      html += `<tr><td>${escHtml(c)}</td><td>${n}</td><td>${Math.round(n/total*100)}%</td></tr>`;
    });
    html += '</table>';
  }

  // Top students
  const topStu = Object.entries(byStu).sort((a,b) => b[1]-a[1]).slice(0, 15);
  if (topStu.length) {
    html += '<h2>תלמידים מובילים באירועים</h2><table><tr><th>תלמיד</th><th>כיתה</th><th>אירועים</th><th>חומרה גבוהה</th><th>טלפון אם</th></tr>';
    topStu.forEach(([sid, n]) => {
      const s = (data.students||[]).find(x => String(x['מזהה'])===String(sid));
      if (!s) return;
      const sHigh = events.filter(e => String(e['תלמיד_מזהה'])===String(sid) && e['חומרה']==='גבוהה').length;
      html += `<tr><td><strong>${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</strong></td><td>${escHtml(s['מחזור']||'')}</td><td>${n}</td><td style="color:#dc2626">${sHigh}</td><td>${escHtml(s['טלפון אם']||'-')}</td></tr>`;
    });
    html += '</table>';
  }

  // Reporters
  if (Object.keys(byReporter).length) {
    html += '<h2>פילוח לפי מדווח</h2><table><tr><th>מדווח</th><th>אירועים</th></tr>';
    Object.entries(byReporter).sort((a,b) => b[1]-a[1]).forEach(([r, n]) => {
      html += `<tr><td>${escHtml(r)}</td><td>${n}</td></tr>`;
    });
    html += '</table>';
  }

  // Functioning averages
  if (Object.keys(fnByCat).length) {
    html += '<h2>ציוני תפקוד — ממוצעים לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th>ממוצע</th><th>מספר ציונים</th></tr>';
    Object.entries(fnByCat).sort((a,b) => (b[1].sum/b[1].n)-(a[1].sum/a[1].n)).forEach(([c, d]) => {
      html += `<tr><td>${escHtml(c)}</td><td><strong>${(d.sum/d.n).toFixed(2)}</strong></td><td>${d.n}</td></tr>`;
    });
    html += '</table>';
  }

  // Tests averages
  if (Object.keys(testsByType).length) {
    html += '<h2>מבחנים — ממוצעים לפי סוג</h2><table><tr><th>סוג</th><th>ממוצע</th><th>מספר מבחנים</th></tr>';
    Object.entries(testsByType).forEach(([t, d]) => {
      html += `<tr><td>${escHtml(t)}</td><td><strong>${(d.sum/d.n).toFixed(1)}</strong></td><td>${d.n}</td></tr>`;
    });
    html += '</table>';
  }

  // Attendance
  if (att.length) {
    html += '<h2>נוכחות</h2><table><tr><th>נוכחויות</th><td style="color:#16a34a"><strong>'+attPresent+'</strong></td><th>חיסור</th><td style="color:#f59e0b">'+attAbsent+'</td><th>איחורים</th><td style="color:#0891b2">'+attLate+'</td><th>אחוז נוכחות</th><td><strong>'+(att.length ? Math.round(attPresent/att.length*100) : 0)+'%</strong></td></tr></table>';
  }

  // All events in chronological order
  if (events.length) {
    html += `<h2>כל האירועים בתקופה (${events.length})</h2>`;
    events.forEach(e => {
      const c = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
      const dt = formatDateBoth(e['תאריך']);
      const reporter = e['דווח_עי'] ? ` · ${e['דווח_עי']}` : '';
      const parsha = e['פרשה'] ? ` · פר' ${e['פרשה']}` : '';
      html += `<div class="event ${c}"><strong>${escHtml(e['שם תלמיד']||'')}</strong> · ${escHtml(e['קטגוריה']||'')} · ${escHtml(dt)}${parsha} · חומרה ${escHtml(e['חומרה']||'')}${reporter}<br>${escHtml(e['תיאור']||'')}${e['הערות']?`<br><em style="color:#6b7280">הערה: ${escHtml(e['הערות'])}</em>`:''}</div>`;
    });
  }

  // Meetings
  if (meetings.length) {
    html += `<h2>אסיפות הורים בתקופה (${meetings.length})</h2>`;
    meetings.forEach(m => {
      const stu = (data.students||[]).find(s => String(s['מזהה'])===String(m['תלמיד_מזהה']));
      const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '?';
      html += `<div class="event"><strong>${escHtml(name)}</strong> · ${escHtml(m['נושא']||'פגישה')} · ${escHtml(formatDateBoth(m['תאריך'])||'')}<br>${escHtml(m['סיכום']||'')}</div>`;
    });
  }

  html += reportFooter();
  openPrintWindow(html, title);
}

function genReportQuarterly() {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  genFullPeriodReport(from, to, 'דוח רבעוני מלא');
}

function genReportAnnual() {
  // School year: September to August (or current year)
  const today = new Date();
  let startYear = today.getFullYear();
  if (today.getMonth() < 8) startYear--;  // before September → prev year
  const from = new Date(startYear, 8, 1);  // Sep 1
  const to = new Date(startYear + 1, 7, 31);  // Aug 31
  genFullPeriodReport(from, to, `דוח שנתי מלא — ${startYear}-${startYear+1}`);
}

function genReportRange() {
  const today = new Date().toISOString().slice(0,10);
  const monthAgo = new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
  const html = `<div class="modal fade" id="rg-modal" tabindex="-1"><div class="modal-dialog"><div class="modal-content">
    <div class="modal-header"><h5>טווח מותאם</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-2"><label class="form-label">מתאריך</label><input id="rg-from" type="date" class="form-control" value="${monthAgo}"></div>
      <div class="mb-2"><label class="form-label">עד תאריך</label><input id="rg-to" type="date" class="form-control" value="${today}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-primary" onclick="doRangeReport()"><i class="bi bi-file-earmark-text"></i> צור דוח</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('rg-modal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('rg-modal')).show();
}

function doRangeReport() {
  const from = new Date(document.getElementById('rg-from').value);
  const to = new Date(document.getElementById('rg-to').value);
  if (!from || !to || isNaN(from) || isNaN(to)) return alert('הזן תאריכים תקינים');
  hideModal('rg-modal');
  const title = `דוח מ-${formatGreg(from)} עד ${formatGreg(to)}`;
  genFullPeriodReport(from, to, title);
}

function genReportWeekly() {
  const data = getVisibleData();
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const events = (data.behavior||[]).filter(e => dateMs(e['תאריך']) > weekAgo)
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const high = events.filter(e => e['חומרה'] === 'גבוהה').length;
  const mid = events.filter(e => e['חומרה'] === 'בינונית').length;
  const low = events.filter(e => e['חומרה'] === 'נמוכה').length;
  const meetingsWeek = (data.meetings||[]).filter(m => dateMs(m['תאריך']) > weekAgo);
  const attWeek = (data.attendance||[]).filter(a => dateMs(a['תאריך']) > weekAgo);
  const attAbs = attWeek.filter(a => a['סטטוס']==='חיסר').length;
  const attLate = attWeek.filter(a => a['סטטוס']==='איחור').length;
  // By category
  const byCat = {};
  events.forEach(e => { const c = e['קטגוריה']||'אחר'; byCat[c] = (byCat[c]||0) + 1; });
  // By student
  const byStu = {};
  events.forEach(e => { const sid = e['תלמיד_מזהה']; byStu[sid] = (byStu[sid]||0) + 1; });
  // By reporter
  const byReporter = {};
  events.forEach(e => { const r = e['דווח_עי']||'לא ידוע'; byReporter[r] = (byReporter[r]||0) + 1; });

  let html = reportHeader('דוח שבועי מלא');
  html += `<div>
    <div class="kpi"><strong>${events.length}</strong>אירועים</div>
    <div class="kpi"><strong style="color:#dc2626">${high}</strong>חומרה גבוהה</div>
    <div class="kpi"><strong>${mid}</strong>בינונית</div>
    <div class="kpi"><strong>${low}</strong>נמוכה</div>
    <div class="kpi"><strong>${new Set(events.map(e=>e['תלמיד_מזהה'])).size}</strong>תלמידים</div>
    <div class="kpi"><strong>${meetingsWeek.length}</strong>אסיפות</div>
    <div class="kpi"><strong style="color:#f59e0b">${attAbs}</strong>חיסור</div>
    <div class="kpi"><strong style="color:#0891b2">${attLate}</strong>איחורים</div>
  </div>`;

  // Top flagged students
  const flagged = Object.entries(byStu).filter(([,n]) => n >= 2).sort((a,b) => b[1]-a[1]).slice(0, 8);
  if (flagged.length) {
    html += '<h2>תלמידים מובילים באירועים</h2><table><tr><th>תלמיד</th><th>כיתה</th><th>אירועים</th><th>טלפון אם</th></tr>';
    flagged.forEach(([sid, n]) => {
      const s = (data.students||[]).find(x => String(x['מזהה'])===String(sid));
      if (!s) return;
      html += `<tr><td><strong>${escHtml((s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</strong></td><td>${escHtml(s['מחזור']||'')}</td><td>${n}</td><td>${escHtml(s['טלפון אם']||'')}</td></tr>`;
    });
    html += '</table>';
  }

  // By category
  if (Object.keys(byCat).length) {
    html += '<h2>פילוח לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th>מספר</th></tr>';
    Object.entries(byCat).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => html += `<tr><td>${escHtml(c)}</td><td>${n}</td></tr>`);
    html += '</table>';
  }

  // By reporter
  if (Object.keys(byReporter).length) {
    html += '<h2>פילוח לפי מדווח</h2><table><tr><th>מדווח</th><th>מספר אירועים</th></tr>';
    Object.entries(byReporter).sort((a,b) => b[1]-a[1]).forEach(([r,n]) => html += `<tr><td>${escHtml(r)}</td><td>${n}</td></tr>`);
    html += '</table>';
  }

  // All events
  html += '<h2>כל האירועים השבוע</h2>';
  if (!events.length) html += '<p class="text-muted">אין אירועים השבוע</p>';
  else events.forEach(e => {
    const c = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
    const dt = formatDateBoth(e['תאריך']);
    const reporter = e['דווח_עי'] ? ` · ${e['דווח_עי']}` : '';
    html += `<div class="event ${c}"><strong>${escHtml(e['שם תלמיד']||'')}</strong> · ${escHtml(e['קטגוריה']||'')} · ${escHtml(dt)} · חומרה ${escHtml(e['חומרה']||'')}${reporter}<br>${escHtml(e['תיאור']||'')}${e['הערות']?`<br><em style="color:#6b7280">הערה: ${escHtml(e['הערות'])}</em>`:''}</div>`;
  });
  html += reportFooter();
  openPrintWindow(html, 'דוח שבועי');
}

function genReportMonthly() {
  const data = getVisibleData();
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const events = (data.behavior||[]).filter(e => dateMs(e['תאריך']) > monthAgo);
  const funcAvg = data.functioning && data.functioning.length
    ? (data.functioning.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / data.functioning.length).toFixed(2) : '-';
  const byCat = {};
  events.forEach(e => { const c = e['קטגוריה']||'אחר'; byCat[c] = (byCat[c]||0) + 1; });
  let html = reportHeader('דוח חודשי');
  html += `<div>
    <div class="kpi"><strong>${events.length}</strong>אירועים החודש</div>
    <div class="kpi"><strong>${funcAvg}</strong>ממוצע תפקוד</div>
    <div class="kpi"><strong>${(data.tests||[]).length}</strong>מבחנים</div>
  </div>`;
  html += '<h2>פילוח לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th>מספר אירועים</th></tr>';
  Object.entries(byCat).sort((a,b) => b[1] - a[1]).forEach(([c,n]) => {
    html += `<tr><td>${escHtml(c)}</td><td>${n}</td></tr>`;
  });
  html += '</table>';
  // Top students
  const byStu = {};
  events.forEach(e => { const sid = e['תלמיד_מזהה']; byStu[sid] = (byStu[sid]||0) + 1; });
  html += '<h2>תלמידים מובילים באירועים</h2><table><tr><th>תלמיד</th><th>מספר אירועים</th></tr>';
  Object.entries(byStu).sort((a,b) => b[1] - a[1]).slice(0, 10).forEach(([sid,n]) => {
    const stu = (data.students||[]).find(s => String(s['מזהה']) === String(sid));
    const name = stu ? `${stu['שם פרטי']||''} ${stu['שם משפחה']||''}` : '?';
    html += `<tr><td>${escHtml(name)}</td><td>${n}</td></tr>`;
  });
  html += '</table>';
  html += reportFooter();
  openPrintWindow(html, 'דוח חודשי');
}

function genReportClass() {
  const data = getVisibleData();
  const classes = (data.classes||[]).map(c => c['שם']);
  const cls = prompt('כיתה (' + classes.join('/') + '):', classes[0] || '');
  if (!cls) return;
  const students = (data.students||[]).filter(s => s['מחזור'] === cls && (s['סטטוס']||'פעיל') !== 'סיים');
  if (!students.length) return alert('אין תלמידים בכיתה ' + cls);
  let html = reportHeader('דוח כיתה ' + cls);
  html += `<p class="subtitle">${students.length} תלמידים</p>`;
  html += '<table><tr><th>שם</th><th>גיל</th><th>אירועים</th><th>השבוע</th><th>תפקוד</th><th>טלפון אם</th></tr>';
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  students.forEach(s => {
    const ev = (data.behavior||[]).filter(e => String(e['תלמיד_מזהה']) === String(s['מזהה']));
    const evWeek = ev.filter(e => dateMs(e['תאריך']) > weekAgo).length;
    const fs = (data.functioning||[]).filter(f => String(f['תלמיד_מזהה']) === String(s['מזהה']));
    const fAvg = fs.length ? (fs.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / fs.length).toFixed(2) : '-';
    const name = (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||'');
    html += `<tr><td>${escHtml(name)}</td><td>${escHtml(s['גיל']||'-')}</td><td>${ev.length}</td><td>${evWeek}</td><td>${fAvg}</td><td>${escHtml(s['טלפון אם']||'-')}</td></tr>`;
  });
  html += '</table>';
  html += reportFooter();
  openPrintWindow(html, 'דוח כיתה ' + cls);
}

function genReportFlags() {
  const data = getVisibleData();
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  const counts = {};
  (data.behavior||[]).filter(e => dateMs(e['תאריך']) > weekAgo && e['חומרה'] === 'גבוהה').forEach(e => {
    counts[e['תלמיד_מזהה']] = (counts[e['תלמיד_מזהה']]||0) + 1;
  });
  const flagged = Object.entries(counts).filter(([,n]) => n >= 2).sort((a,b) => b[1] - a[1]);
  let html = reportHeader('דוח דגלים — תלמידים לתשומת לב');
  if (!flagged.length) html += '<p>אין דגלים השבוע 🎉</p>';
  else {
    html += '<table><tr><th>תלמיד</th><th>כיתה</th><th>אירועי חומרה גבוהה השבוע</th><th>טלפון אם</th></tr>';
    flagged.forEach(([sid,n]) => {
      const stu = (data.students||[]).find(s => String(s['מזהה']) === String(sid));
      if (!stu) return;
      const name = (stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||'');
      html += `<tr><td>${escHtml(name)}</td><td>${escHtml(stu['מחזור']||'-')}</td><td><strong style="color:#dc2626">${n}</strong></td><td>${escHtml(stu['טלפון אם']||'-')}</td></tr>`;
    });
    html += '</table>';
  }
  html += reportFooter();
  openPrintWindow(html, 'דוח דגלים');
}

function genReportTests() {
  const data = getVisibleData();
  const tests = data.tests || [];
  const byStu = {};
  tests.forEach(t => {
    const sid = t['תלמיד_מזהה'];
    if (!byStu[sid]) byStu[sid] = { sum: 0, n: 0, byType: {} };
    byStu[sid].sum += parseFloat(t['ציון']) || 0;
    byStu[sid].n += 1;
    const type = t['סוג'] || 'אחר';
    if (!byStu[sid].byType[type]) byStu[sid].byType[type] = { sum: 0, n: 0 };
    byStu[sid].byType[type].sum += parseFloat(t['ציון']) || 0;
    byStu[sid].byType[type].n += 1;
  });
  const types = [...new Set(tests.map(t => t['סוג']).filter(Boolean))];
  let html = reportHeader('דוח מבחנים');
  html += '<table><tr><th>תלמיד</th><th>כיתה</th><th>ממוצע כללי</th>';
  types.forEach(t => html += `<th>${escHtml(t)}</th>`);
  html += '</tr>';
  Object.entries(byStu).map(([sid, d]) => {
    const stu = (data.students||[]).find(s => String(s['מזהה']) === String(sid));
    return { stu, d, avg: d.sum / d.n };
  }).filter(r => r.stu).sort((a,b) => b.avg - a.avg).forEach(({ stu, d, avg }) => {
    const name = (stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||'');
    html += `<tr><td>${escHtml(name)}</td><td>${escHtml(stu['מחזור']||'-')}</td><td><strong>${avg.toFixed(1)}</strong></td>`;
    types.forEach(t => {
      const td = d.byType[t];
      html += `<td>${td ? (td.sum/td.n).toFixed(1) : '-'}</td>`;
    });
    html += '</tr>';
  });
  html += '</table>';
  html += reportFooter();
  openPrintWindow(html, 'דוח מבחנים');
}

async function genReportParent() {
  const data = getVisibleData();
  const activeStu = (data.students||[]).filter(s => (s['סטטוס']||'פעיל') !== 'סיים').sort((a,b) =>
    String(a['מחזור']).localeCompare(String(b['מחזור'])) || (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'', 'he'));
  const html = `<div class="modal fade" id="rp-modal" tabindex="-1"><div class="modal-dialog modal-lg"><div class="modal-content">
    <div class="modal-header"><h5><i class="bi bi-envelope-fill"></i> דוח להורים</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
    <div class="modal-body">
      <div class="mb-3"><label class="form-label">תלמיד</label>
        <select id="rp-student" class="form-select">
          ${activeStu.map(s => `<option value="${s['מזהה']}">${escHtml((s['מחזור']||'')+' · '+(s['שם פרטי']||'')+' '+(s['שם משפחה']||''))}</option>`).join('')}
        </select>
      </div>
      <div class="mb-3">
        <label class="form-label">מייל הורה</label>
        <input id="rp-email" class="form-control" placeholder="parent@example.com">
        <small class="text-muted">אם תשאיר ריק — רק PDF להדפסה</small>
      </div>
      <div class="form-check mb-3">
        <input type="checkbox" id="rp-include-trend" class="form-check-input" checked>
        <label class="form-check-label" for="rp-include-trend">כלול גרף מגמת התנהגות</label>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">ביטול</button>
      <button class="btn btn-warning" onclick="genParentPDF(false)"><i class="bi bi-printer"></i> רק הדפסה/PDF</button>
      <button class="btn btn-primary" onclick="genParentPDF(true)"><i class="bi bi-send"></i> צור PDF + שלח</button>
    </div>
  </div></div></div>`;
  const old = document.getElementById('rp-modal'); if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('rp-modal')).show();
}

async function genParentPDF(sendEmail) {
  const sid = document.getElementById('rp-student').value;
  const email = document.getElementById('rp-email').value.trim();
  const data = getVisibleData();
  const stu = (data.students||[]).find(s => String(s['מזהה']) === String(sid));
  if (!stu) return alert('תלמיד לא נמצא');
  if (sendEmail && !email) return alert('הזן מייל');
  const events = (data.behavior||[]).filter(e => String(e['תלמיד_מזהה']) === String(sid))
    .sort((a,b) => new Date(b['תאריך']) - new Date(a['תאריך']));
  const fs = (data.functioning||[]).filter(f => String(f['תלמיד_מזהה']) === String(sid));
  const tests = (data.tests||[]).filter(t => String(t['תלמיד_מזהה']) === String(sid));
  const meds = (data.medications||[]).filter(m => String(m['תלמיד_מזהה']) === String(sid));
  const meetings = (data.meetings||[]).filter(m => String(m['תלמיד_מזהה']) === String(sid));
  const att = (data.attendance||[]).filter(a => String(a['תלמיד_מזהה']) === String(sid));
  const attPresent = att.filter(a => a['סטטוס']==='נוכח').length;
  const attAbsent = att.filter(a => a['סטטוס']==='חיסר').length;
  const attLate = att.filter(a => a['סטטוס']==='איחור').length;
  const fullName = (stu['שם פרטי']||'') + ' ' + (stu['שם משפחה']||'');
  const fAvg = fs.length ? (fs.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / fs.length).toFixed(2) : '-';
  const tAvg = tests.length ? (tests.reduce((a,b) => a + (parseFloat(b['ציון'])||0), 0) / tests.length).toFixed(1) : '-';
  // Behavior breakdown
  const evHigh = events.filter(e => e['חומרה']==='גבוהה').length;
  const evMid = events.filter(e => e['חומרה']==='בינונית').length;
  const evLow = events.filter(e => e['חומרה']==='נמוכה').length;
  // Categories breakdown
  const byCat = {};
  events.forEach(e => { const c = e['קטגוריה']||'אחר'; byCat[c] = (byCat[c]||0) + 1; });
  // Tests by type
  const testsByType = {};
  tests.forEach(t => {
    const type = t['סוג'] || 'אחר';
    if (!testsByType[type]) testsByType[type] = { sum: 0, n: 0 };
    testsByType[type].sum += parseFloat(t['ציון']) || 0;
    testsByType[type].n += 1;
  });
  // Functioning by category
  const fnByCat = {};
  fs.forEach(f => {
    const c = f['קטגוריה'] || 'אחר';
    if (!fnByCat[c]) fnByCat[c] = { sum: 0, n: 0 };
    fnByCat[c].sum += parseFloat(f['ציון']) || 0;
    fnByCat[c].n += 1;
  });

  let html = reportHeader('דוח התקדמות מלא — ' + fullName);
  html += `<p class="subtitle">כיתה ${escHtml(stu['מחזור']||'-')} · גיל ${escHtml(stu['גיל']||'-')} · ת.ז ${escHtml(stu['מספר זהות']||'-')}</p>`;
  html += `<div>
    <div class="kpi"><strong>${events.length}</strong>אירועים</div>
    <div class="kpi"><strong>${fAvg}</strong>ממוצע תפקוד</div>
    <div class="kpi"><strong>${tAvg}</strong>ממוצע מבחנים</div>
    <div class="kpi"><strong>${attPresent}/${att.length}</strong>נוכחות</div>
    <div class="kpi"><strong>${meetings.length}</strong>אסיפות הורים</div>
  </div>`;
  // Personal profile
  if (stu['דוח_אישי']) {
    html += `<h2>דוח אישי</h2><p>${escHtml(stu['דוח_אישי'])}</p>`;
  }
  if (stu['פרופיל_הורים'] || stu['פרופיל_אישיות'] || stu['פרופיל_התנהגותי'] || stu['פרופיל_לימודי']) {
    html += '<h2>פרופיל</h2><table>';
    if (stu['פרופיל_הורים']) html += `<tr><th style="width:120px">הורים</th><td>${escHtml(stu['פרופיל_הורים'])}</td></tr>`;
    if (stu['פרופיל_אישיות']) html += `<tr><th>אישיות</th><td>${escHtml(stu['פרופיל_אישיות'])}</td></tr>`;
    if (stu['פרופיל_התנהגותי']) html += `<tr><th>התנהגותי</th><td>${escHtml(stu['פרופיל_התנהגותי'])}</td></tr>`;
    if (stu['פרופיל_לימודי']) html += `<tr><th>לימודי</th><td>${escHtml(stu['פרופיל_לימודי'])}</td></tr>`;
    html += '</table>';
  }
  // Behavior summary
  html += '<h2>סיכום התנהגות</h2>';
  html += `<table><tr><th>סה"כ אירועים</th><td><strong>${events.length}</strong></td><th>חומרה גבוהה</th><td style="color:#dc2626"><strong>${evHigh}</strong></td><th>בינונית</th><td>${evMid}</td><th>נמוכה</th><td>${evLow}</td></tr></table>`;
  if (Object.keys(byCat).length) {
    html += '<h3>פילוח לפי קטגוריה</h3><table><tr><th>קטגוריה</th><th>מספר אירועים</th></tr>';
    Object.entries(byCat).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => html += `<tr><td>${escHtml(c)}</td><td>${n}</td></tr>`);
    html += '</table>';
  }
  // All behavior events
  if (events.length) {
    html += `<h2>כל אירועי ההתנהגות (${events.length})</h2>`;
    events.forEach(e => {
      const c = e['חומרה']==='גבוהה'?'high':e['חומרה']==='נמוכה'?'low':'mid';
      const dt = formatDateBoth(e['תאריך']);
      const reporter = e['דווח_עי'] ? ` · ${e['דווח_עי']}` : '';
      html += `<div class="event ${c}"><strong>${escHtml(e['קטגוריה']||'')}</strong> · ${escHtml(dt)} · חומרה ${escHtml(e['חומרה']||'-')}${reporter}<br>${escHtml(e['תיאור']||'')}${e['הערות']?`<br><em style="color:#6b7280">הערה: ${escHtml(e['הערות'])}</em>`:''}</div>`;
    });
  }
  // Functioning summary
  if (Object.keys(fnByCat).length) {
    html += '<h2>תפקוד — ממוצעים לפי קטגוריה</h2><table><tr><th>קטגוריה</th><th>ממוצע</th><th>מספר ציונים</th></tr>';
    Object.entries(fnByCat).sort((a,b) => (b[1].sum/b[1].n) - (a[1].sum/a[1].n)).forEach(([c, d]) => {
      const avg = d.sum / d.n;
      html += `<tr><td>${escHtml(c)}</td><td><strong>${avg.toFixed(2)}</strong></td><td>${d.n}</td></tr>`;
    });
    html += '</table>';
  }
  // Tests summary
  if (Object.keys(testsByType).length) {
    html += '<h2>מבחנים — ממוצעים לפי סוג</h2><table><tr><th>סוג</th><th>ממוצע</th><th>מספר מבחנים</th></tr>';
    Object.entries(testsByType).forEach(([t, d]) => {
      const avg = d.sum / d.n;
      html += `<tr><td>${escHtml(t)}</td><td><strong>${avg.toFixed(1)}</strong></td><td>${d.n}</td></tr>`;
    });
    html += '</table>';
    html += '<h3>כל ציוני המבחנים</h3><table><tr><th>סוג</th><th>פרשה</th><th>ציון</th></tr>';
    tests.slice(0, 40).forEach(t => html += `<tr><td>${escHtml(t['סוג']||'')}</td><td>${escHtml(t['פרשה']||'')}</td><td><strong>${t['ציון']||'-'}</strong></td></tr>`);
    html += '</table>';
  }
  // Medications
  if (meds.length) {
    html += '<h2>מעקב רפואי / כדורים</h2>';
    meds.forEach(m => {
      html += `<div class="event">
        ${m['תרופה'] ? `<strong>${escHtml(m['תרופה'])}</strong> · ` : ''}${escHtml(m['תאריך_עדכון']||'')}
        ${m['מצב_כיום'] ? `<br>מצב: ${escHtml(m['מצב_כיום'])}` : ''}
        ${m['שיחת_הורים'] ? `<br>שיחת הורים: ${escHtml(m['שיחת_הורים'])}` : ''}
      </div>`;
    });
  }
  // Meetings
  if (meetings.length) {
    html += '<h2>אסיפות הורים</h2>';
    meetings.forEach(m => {
      html += `<div class="event">
        <strong>${escHtml(m['נושא']||'פגישה')}</strong> · ${escHtml(m['תאריך']||'')}
        ${m['משתתפים'] ? `<br>משתתפים: ${escHtml(m['משתתפים'])}` : ''}
        ${m['סיכום'] ? `<br>${escHtml(m['סיכום'])}` : ''}
      </div>`;
    });
  }
  // Attendance
  if (att.length) {
    html += '<h2>נוכחות</h2>';
    html += `<table><tr><th>נוכחויות</th><td style="color:#16a34a"><strong>${attPresent}</strong></td><th>חיסור</th><td style="color:#f59e0b">${attAbsent}</td><th>איחורים</th><td style="color:#0891b2">${attLate}</td><th>אחוז נוכחות</th><td><strong>${att.length ? Math.round(attPresent/att.length*100) : 0}%</strong></td></tr></table>`;
  }

  html += `<p style="margin-top:30pt;color:#6b7280;font-size:9pt">בברכה,<br>בית התלמוד · בית שמש · ${formatDateBoth(new Date())}</p>`;
  html += reportFooter();
  hideModal('rp-modal');
  if (sendEmail) {
    notify('שולח דוח...', 'success');
    await sendParentReportPDF(html, fullName, email);
  } else {
    openPrintWindow(html, 'דוח להורים — ' + fullName);
  }
}

async function sendParentReportPDF(html, studentName, email) {
  const APPS = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';
  const TOKEN = 'BHT_AGENT_2026';
  try {
    // Step 1: Convert HTML to PDF via Apps Script
    const htmlB64 = btoa(unescape(encodeURIComponent(html)));
    const form = new FormData();
    form.append('action', 'html_to_pdf');
    form.append('token', TOKEN);
    form.append('html_b64', htmlB64);
    form.append('name', `דוח ${studentName}.pdf`);
    const r = await fetch(APPS, { method: 'POST', body: form });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'PDF generation failed');
    // Step 2: Open Gmail compose with PDF link
    const subject = encodeURIComponent(`דוח התקדמות — ${studentName}`);
    const body = encodeURIComponent(`שלום,\n\nמצורף דוח התקדמות של ${studentName}.\nקישור לדוח: ${j.url}\n\nבברכה,\nבית התלמוד · בית שמש`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${subject}&body=${body}`, '_blank');
    notify('PDF נוצר ונפתח Gmail', 'success');
  } catch (e) {
    notify('שגיאה: ' + e.message, 'error');
  }
}
