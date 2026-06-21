// forms-matrix.js — לכל תבנית טופס: טבלה של כל המכינה.
// שורה לכל תלמיד, עמודות: מילא/לא + עמודות מותאמות (שילם/לא וכו').
// 2026-05-24.

const FMX_TOKEN = 'BHT_AGENT_2026';
const FMX_SCRIPT = 'https://script.google.com/macros/s/AKfycbzhRqTLE4fjjDqrH1we-JlGZ15R-ws8b_gfWF1xF1ewailaiyiS_YXqUhRtb3cQghVt/exec';

window._fmxMatrices = {};  // {tplKey: {studentId: {filled:bool, custom:{...}}}}

// Hook into existing forms-mgmt: add a "Matrix" button per template
window._origRenderFormsTabFM = window._origRenderFormsTabFM || window.renderFormsTab;
window.renderFormsTab = async function(rootEl) {
  if (window._origRenderFormsTabFM) await window._origRenderFormsTabFM(rootEl);
  // After main render, inject matrix section
  setTimeout(injectMatrixSection, 300);
};

function injectMatrixSection() {
  const root = document.getElementById('forms-mgmt-content') || document.getElementById('behavior-tab-content');
  if (!root || root.querySelector('#fmx-section')) return;
  const section = document.createElement('div');
  section.id = 'fmx-section';
  section.className = 'card p-3 mb-3';
  section.style.background = 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%)';
  section.innerHTML = `
    <h5><i class="bi bi-grid-3x3"></i> מטריצת תלמידים לכל טופס</h5>
    <p class="small text-muted mb-2">לחץ על תבנית כדי לראות טבלה של כל תלמידי המכינה: מי מילא, מי לא, ועמודות מותאמות (שילם/לא, אישר/לא, וכו').</p>
    <div id="fmx-tpl-grid" class="row g-2"></div>`;
  root.insertBefore(section, root.firstChild);
  renderTemplateGrid();
}

function renderTemplateGrid() {
  const grid = document.getElementById('fmx-tpl-grid');
  if (!grid) return;
  const tpls = (typeof bfAllForms === 'function') ? bfAllForms() : {};
  grid.innerHTML = Object.entries(tpls).map(([k,t]) => `
    <div class="col-md-4">
      <button class="btn btn-light w-100 text-end p-3" style="border:1px solid #d1d5db" onclick="openMatrix('${escHtml(k)}')">
        <span style="font-size:1.5rem;float:left">${t.icon||'📋'}</span>
        <strong>${escHtml(t.title||k)}</strong>
        <div class="small text-muted">לחץ למטריצת תלמידים</div>
      </button>
    </div>`).join('');
}

window.openMatrix = async function(tplKey) {
  await loadMatrix(tplKey);
  const tpl = (typeof bfAllForms === 'function' ? bfAllForms() : {})[tplKey];
  const matrix = window._fmxMatrices[tplKey] || {};
  const customCols = (matrix._meta && matrix._meta.customCols) || [];

  const html = `<div class="modal fade" id="fmx-m" tabindex="-1"><div class="modal-dialog modal-xl"><div class="modal-content">
    <div class="modal-header" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff">
      <h5>📊 ${escHtml(tpl?.title || tplKey)} - מטריצת תלמידים</h5>
      <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div class="small">
          סה"כ תלמידים: <strong>${(window._allStudents||[]).filter(s=>(s['סטטוס']||'פעיל')!=='סיים').length}</strong>
          · עמודות מותאמות: <strong>${customCols.length}</strong>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-success" onclick="fmxAddColumn('${escHtml(tplKey)}')"><i class="bi bi-plus"></i> הוסף עמודה</button>
          <button class="btn btn-sm btn-outline-primary" onclick="fmxExportCSV('${escHtml(tplKey)}')"><i class="bi bi-download"></i> יצא CSV</button>
        </div>
      </div>
      <div class="table-responsive" style="max-height:60vh">
        <table class="table table-sm table-hover" id="fmx-table">
          <thead style="position:sticky;top:0;background:#fff;z-index:2">
            <tr>
              <th>תלמיד</th>
              <th>כיתה</th>
              <th>מילא?</th>
              <th>תאריך</th>
              ${customCols.map(c => `<th>${escHtml(c)} <button class="btn btn-sm btn-link text-danger p-0" onclick="fmxRemColumn('${escHtml(tplKey)}','${escHtml(c)}')">×</button></th>`).join('')}
              <th>קישור</th>
              <th>PDF</th>
            </tr>
          </thead>
          <tbody>
            ${renderMatrixRows(tplKey, tpl, matrix, customCols)}
          </tbody>
        </table>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" data-bs-dismiss="modal">סגור</button>
    </div>
  </div></div></div>`;
  cleanupModal('fmx-m');
  document.body.insertAdjacentHTML('beforeend', html);
  new bootstrap.Modal(document.getElementById('fmx-m')).show();
};

function renderMatrixRows(tplKey, tpl, matrix, customCols) {
  const students = (window._allStudents||[]).filter(s => (s['סטטוס']||'פעיל') !== 'סיים');
  const subs = (window._fmSubmissions||[]).filter(s => s.tpl === tplKey);
  // Build sub by studentId/name
  const subsByStudent = {};
  subs.forEach(s => {
    if (s.studentId) subsByStudent[s.studentId] = s;
    else if (s.studentName) subsByStudent[s.studentName] = s;
  });
  return students.sort((a,b) => (a['שם משפחה']||'').localeCompare(b['שם משפחה']||'')).map(s => {
    const sid = s['מזהה'];
    const sub = subsByStudent[sid] || subsByStudent[`${s['שם פרטי']||''} ${s['שם משפחה']||''}`.trim()];
    const filled = !!sub;
    const cellData = (matrix[sid] && matrix[sid].custom) || {};
    return `<tr style="${filled?'background:#dcfce7':'background:#fef2f2'}">
      <td><strong>${escHtml((s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''))}</strong></td>
      <td><span class="badge bg-light text-dark">${escHtml(s['מחזור']||'')}</span></td>
      <td>${filled ? '<span class="badge bg-success">✓ מילא</span>' : '<span class="badge bg-danger">✗ לא מילא</span>'}</td>
      <td class="small">${sub && sub.ts ? new Date(sub.ts).toLocaleDateString('he-IL') : '-'}</td>
      ${customCols.map(c => {
        const v = cellData[c] || '';
        return `<td><input class="form-control form-control-sm" value="${escHtml(v)}" onchange="fmxSetCell('${escHtml(tplKey)}','${escHtml(sid)}','${escHtml(c)}',this.value)"></td>`;
      }).join('')}
      <td><button class="btn btn-sm btn-outline-primary" onclick="fmxSendLink('${escHtml(tplKey)}','${escHtml(sid)}')" title="שלח קישור לתלמיד"><i class="bi bi-send"></i></button></td>
      <td>${sub && sub.file_url ? `<a href="${escHtml(sub.file_url)}" target="_blank"><i class="bi bi-file-pdf"></i></a>` : '-'}</td>
    </tr>`;
  }).join('');
}

async function loadMatrix(tplKey) {
  try {
    const r = await fetch(`${FMX_SCRIPT}?action=fmxLoad&token=${FMX_TOKEN}&tpl=${encodeURIComponent(tplKey)}`);
    const d = await r.json();
    window._fmxMatrices[tplKey] = d.matrix || {};
  } catch (e) { window._fmxMatrices[tplKey] = {}; }
}

window.fmxAddColumn = async function(tplKey) {
  const name = prompt('שם העמודה (לדוגמה: "שילם", "אישר", "הגיש"):');
  if (!name || !name.trim()) return;
  const matrix = window._fmxMatrices[tplKey] || {};
  matrix._meta = matrix._meta || { customCols: [] };
  if (!matrix._meta.customCols.includes(name.trim())) matrix._meta.customCols.push(name.trim());
  window._fmxMatrices[tplKey] = matrix;
  await fmxSaveMatrix(tplKey, matrix);
  openMatrix(tplKey);
};

window.fmxRemColumn = async function(tplKey, col) {
  if (!confirm(`למחוק את עמודת "${col}"?`)) return;
  const matrix = window._fmxMatrices[tplKey] || {};
  matrix._meta = matrix._meta || { customCols: [] };
  matrix._meta.customCols = matrix._meta.customCols.filter(c => c !== col);
  // Remove from all students
  Object.keys(matrix).forEach(k => {
    if (k !== '_meta' && matrix[k].custom) delete matrix[k].custom[col];
  });
  await fmxSaveMatrix(tplKey, matrix);
  openMatrix(tplKey);
};

window.fmxSetCell = async function(tplKey, sid, col, value) {
  const matrix = window._fmxMatrices[tplKey] || {};
  matrix[sid] = matrix[sid] || { custom: {} };
  matrix[sid].custom = matrix[sid].custom || {};
  matrix[sid].custom[col] = value;
  window._fmxMatrices[tplKey] = matrix;
  await fmxSaveMatrix(tplKey, matrix);
  if (typeof toast === 'function') toast('נשמר', 'success');
};

async function fmxSaveMatrix(tplKey, matrix) {
  try {
    const data = new URLSearchParams({
      action: 'fmxSave', token: FMX_TOKEN, tpl: tplKey,
      matrix: JSON.stringify(matrix),
    });
    await fetch(FMX_SCRIPT, { method: 'POST', body: data });
  } catch (e) { console.warn('fmxSave err', e); }
}

window.fmxSendLink = async function(tplKey, sid) {
  const stu = (window._allStudents||[]).find(s => String(s['מזהה']) === String(sid));
  if (!stu) return;
  // Generate link via existing bfCreateLink (already opens modal)
  if (typeof bfCreateLink === 'function') {
    bfCreateLink(tplKey);
    setTimeout(() => {
      const sel = document.getElementById('bf-l-student');
      if (sel) sel.value = sid;
    }, 300);
  }
};

window.fmxExportCSV = function(tplKey) {
  const tpl = (typeof bfAllForms === 'function' ? bfAllForms() : {})[tplKey];
  const matrix = window._fmxMatrices[tplKey] || {};
  const customCols = (matrix._meta && matrix._meta.customCols) || [];
  const students = (window._allStudents||[]).filter(s => (s['סטטוס']||'פעיל') !== 'סיים');
  const subs = (window._fmSubmissions||[]).filter(s => s.tpl === tplKey);
  const subsByStudent = {};
  subs.forEach(s => { if (s.studentId) subsByStudent[s.studentId] = s; });
  const headers = ['תלמיד','כיתה','מילא','תאריך', ...customCols];
  const rows = students.map(s => {
    const sub = subsByStudent[s['מזהה']];
    const cell = (matrix[s['מזהה']] && matrix[s['מזהה']].custom) || {};
    return [
      (s['שם פרטי']||'') + ' ' + (s['שם משפחה']||''),
      s['מחזור']||'',
      sub ? 'כן' : 'לא',
      sub && sub.ts ? new Date(sub.ts).toLocaleDateString('he-IL') : '',
      ...customCols.map(c => cell[c] || ''),
    ];
  });
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${tpl?.title||tplKey}_matrix.csv`;
  a.click();
};

console.log('%c✅ forms-matrix loaded', 'color:#16a34a;font-weight:bold');
