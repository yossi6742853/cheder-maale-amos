// forms-manager.js — ניהול טפסים מלא: רשימת כל הקישורים שנוצרו,
// סטטוס (נשלח/נפתח/נחתם), מי מילא, עריכת תבנית, הורדה כללית.
// נכתב 2026-05-24.

const FM_TOKEN = 'BHT_AGENT_2026';
const FM_SCRIPT = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';

window._fmLinks = [];
window._fmSubmissions = [];

// Hook into renderFormsTab — add a "ניהול טפסים" section above existing content
const _origRenderFormsTab = window.renderFormsTab;
window.renderFormsTab = async function(rootEl) {
  if (_origRenderFormsTab) await _origRenderFormsTab(rootEl);
  // Inject management section at top
  const mgmt = document.createElement('div');
  mgmt.id = 'fm-mgmt-section';
  mgmt.className = 'card p-3 mb-3';
  mgmt.style.background = 'linear-gradient(135deg, #ecfeff 0%, #e0f2fe 100%)';
  mgmt.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
      <h5 class="mb-0"><i class="bi bi-clipboard-data"></i> ניהול טפסים שנשלחו</h5>
      <div class="d-flex gap-2">
        <button class="btn btn-sm btn-outline-primary" onclick="fmRefresh()"><i class="bi bi-arrow-clockwise"></i> רענון</button>
        <button class="btn btn-sm btn-outline-success" onclick="fmDownloadAll()"><i class="bi bi-download"></i> הורד הכל כ-ZIP</button>
        <button class="btn btn-sm btn-outline-info" onclick="fmEditTemplate()"><i class="bi bi-pencil-square"></i> ערוך תבניות</button>
      </div>
    </div>
    <div id="fm-stats" class="row g-2 mb-3"></div>
    <div id="fm-links-list">טוען...</div>`;
  rootEl.insertBefore(mgmt, rootEl.firstChild);
  await fmRefresh();
};

window.fmRefresh = async function() {
  const list = document.getElementById('fm-links-list');
  if (list) list.innerHTML = '<div class="text-center py-3"><div class="spinner-border spinner-border-sm"></div> טוען...</div>';
  try {
    const r = await fetch(`${FM_SCRIPT}?action=fmListLinks&token=${FM_TOKEN}`);
    const d = await r.json();
    window._fmLinks = d.links || [];
    window._fmSubmissions = d.submissions || [];
    fmRenderList();
  } catch (e) {
    if (list) list.innerHTML = `<div class="text-danger small">שגיאה: ${e.message}</div>`;
  }
};

window.fmRenderList = function() {
  const list = document.getElementById('fm-links-list');
  const stats = document.getElementById('fm-stats');
  if (!list || !stats) return;
  const links = window._fmLinks || [];
  const subs = window._fmSubmissions || [];
  const subsByToken = {};
  subs.forEach(s => { if (s.lt) subsByToken[s.lt] = s; });

  const totalLinks = links.length;
  const usedLinks = links.filter(l => l.used).length;
  const viewedLinks = links.filter(l => l.viewed).length;
  const unusedLinks = totalLinks - usedLinks;

  stats.innerHTML = `
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 text-primary mb-0">${totalLinks}</div><small class="text-muted">קישורים נוצרו</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 text-warning mb-0">${viewedLinks}</div><small class="text-muted">נפתחו</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 text-success mb-0">${usedLinks}</div><small class="text-muted">נחתמו</small></div></div>
    <div class="col-6 col-md-3"><div class="card p-2 text-center"><div class="h4 text-danger mb-0">${unusedLinks}</div><small class="text-muted">ממתינים</small></div></div>`;

  if (!links.length) {
    list.innerHTML = '<div class="text-center py-4 text-muted"><i class="bi bi-inbox fs-1"></i><p>אין קישורים שנוצרו עדיין. צור קישור חתימה דיגיטלית מהתבניות למטה.</p></div>';
    return;
  }

  list.innerHTML = `
    <div class="mb-2 d-flex gap-2 flex-wrap">
      <button class="btn btn-sm btn-outline-secondary fm-filter active" onclick="fmFilter('all',this)">הכל (${totalLinks})</button>
      <button class="btn btn-sm btn-outline-warning fm-filter" onclick="fmFilter('viewed',this)">נפתחו לא נחתמו (${viewedLinks - usedLinks})</button>
      <button class="btn btn-sm btn-outline-success fm-filter" onclick="fmFilter('used',this)">נחתמו (${usedLinks})</button>
      <button class="btn btn-sm btn-outline-danger fm-filter" onclick="fmFilter('pending',this)">לא נפתחו (${totalLinks - viewedLinks})</button>
    </div>
    <div id="fm-link-cards">${fmCardsHtml(links, subsByToken)}</div>`;
};

window.fmCardsHtml = function(links, subsByToken) {
  return links.sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).map(l => {
    const sub = subsByToken[l.lt];
    let statusBadge, statusColor;
    if (l.used) { statusBadge = '✓ נחתם'; statusColor = 'success'; }
    else if (l.viewed) { statusBadge = '👁 נפתח, לא נחתם'; statusColor = 'warning'; }
    else { statusBadge = '⏳ ממתין'; statusColor = 'danger'; }
    const created = l.createdAt ? new Date(l.createdAt).toLocaleString('he-IL') : '';
    const viewedAt = l.viewedAt ? new Date(l.viewedAt).toLocaleString('he-IL') : '';
    const usedAt = l.usedAt ? new Date(l.usedAt).toLocaleString('he-IL') : '';
    const baseUrl = 'https://beit-hatalmud.github.io/parent-signature/index.html?';
    const linkUrl = baseUrl + 'tpl=' + l.tpl + '&lt=' + l.lt + (l.ref ? '&ref=' + encodeURIComponent(l.ref) : '');
    return `<div class="card p-3 mb-2" data-fm-status="${l.used?'used':l.viewed?'viewed':'pending'}">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div class="flex-grow-1">
          <div class="d-flex gap-2 align-items-center flex-wrap mb-1">
            <strong>${escHtml(l.tpl||'?')}</strong>
            ${l.ref ? `<span class="badge bg-light text-dark">${escHtml(l.ref)}</span>` : ''}
            <span class="badge bg-${statusColor}">${statusBadge}</span>
            ${l.broadcast ? '<span class="badge bg-info">📣 קישור פתוח</span>' : ''}
          </div>
          <div class="small text-muted">
            ${l.studentName?`👤 ${escHtml(l.studentName)} · `:''}
            🕒 נוצר: ${escHtml(created)}
            ${viewedAt?` · נפתח: ${escHtml(viewedAt)}`:''}
            ${usedAt?` · נחתם: ${escHtml(usedAt)}`:''}
          </div>
          ${sub && sub.file_url ? `<div class="small mt-1"><a href="${escHtml(sub.file_url)}" target="_blank">📄 קובץ חתום ב-Drive</a></div>` : ''}
        </div>
        <div class="d-flex gap-1 flex-wrap">
          <button class="btn btn-sm btn-outline-primary" onclick="fmCopyLink('${escHtml(linkUrl)}')" title="העתק קישור"><i class="bi bi-clipboard"></i></button>
          <button class="btn btn-sm btn-outline-success" onclick="fmShareWhats('${escHtml(linkUrl)}','${escHtml(l.tpl)}')" title="WhatsApp"><i class="bi bi-whatsapp"></i></button>
          <button class="btn btn-sm btn-outline-info" onclick="fmShareEmail('${escHtml(linkUrl)}','${escHtml(l.tpl)}')" title="Gmail"><i class="bi bi-envelope"></i></button>
          ${sub && sub.file_url ? `<button class="btn btn-sm btn-outline-secondary" onclick="window.open('${escHtml(sub.file_url)}','_blank')" title="צפה ב-PDF"><i class="bi bi-file-pdf"></i></button>` : ''}
          <button class="btn btn-sm btn-outline-danger" onclick="fmDeleteLink('${escHtml(l.lt)}')" title="מחק"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
};

window.fmFilter = function(mode, btn) {
  document.querySelectorAll('.fm-filter').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('#fm-link-cards .card').forEach(c => {
    const st = c.dataset.fmStatus;
    let show = true;
    if (mode === 'used') show = st === 'used';
    else if (mode === 'viewed') show = st === 'viewed';
    else if (mode === 'pending') show = st === 'pending';
    c.style.display = show ? '' : 'none';
  });
};

window.fmCopyLink = function(url) {
  navigator.clipboard.writeText(url);
  if (typeof toast === 'function') toast('הועתק', 'success');
};
window.fmShareWhats = function(url, tpl) {
  window.open('https://wa.me/?text=' + encodeURIComponent(`${tpl}\n${url}`), '_blank');
};
window.fmShareEmail = function(url, tpl) {
  window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(tpl)}&body=${encodeURIComponent(url)}`, '_blank');
};
window.fmDeleteLink = async function(lt) {
  if (!confirm('למחוק את הקישור? לא ניתן יהיה לשחזר.')) return;
  try {
    const r = await fetch(`${FM_SCRIPT}?action=fmDeleteLink&token=${FM_TOKEN}&lt=${encodeURIComponent(lt)}`);
    const d = await r.json();
    if (d.ok) { if (typeof toast==='function') toast('נמחק','success'); fmRefresh(); }
    else alert('שגיאה: ' + (d.error||'?'));
  } catch (e) { alert('שגיאה: ' + e.message); }
};

window.fmDownloadAll = async function() {
  if (!window._fmSubmissions || !window._fmSubmissions.length) return alert('אין טפסים חתומים להורדה');
  if (typeof toast === 'function') toast('מכין ZIP...', 'success');
  try {
    const r = await fetch(`${FM_SCRIPT}?action=fmZipSubmissions&token=${FM_TOKEN}`);
    const d = await r.json();
    if (d.ok && d.url) {
      window.open(d.url, '_blank');
      if (typeof toast === 'function') toast('הZIP מוכן ב-Drive', 'success');
    } else alert('שגיאה: ' + (d.error||'?'));
  } catch (e) { alert('שגיאה: ' + e.message); }
};

window.fmEditTemplate = function() {
  alert('עריכת תבניות: בקרוב יתווסף UI מלא לעריכת השדות בכל תבנית. כעת אפשר ב-Custom Builder.');
};
