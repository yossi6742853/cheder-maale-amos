// forms.js — טפסים וחתימות הורים. יצירת טופס → מטריצת תלמיד×סטטוס → קישור אישי/חתימה + מעקב.
// נתונים דרך המאגר המרכזי (store.js). חתימת הורה חיה מתבצעת ב-sign.html (מול Supabase כשמחובר).
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);
  const tok = () => Math.random().toString(36).slice(2, 10);
  const signBase = () => location.href.replace(/[^/]*$/, '') + 'sign.html';

  async function students() { return window.cv3Students ? await window.cv3Students.getStudents() : []; }
  async function classes() { return window.cv3Students ? await window.cv3Students.getClasses() : []; }

  async function renderForms(page) {
    const [forms, resp, studs, cls] = await Promise.all([
      window.store.list('forms'), window.store.list('form_responses'), students(), classes(),
    ]);
    const nameOf = id => { const s = studs.find(x => x.id == id); return s ? s.name : '—'; };
    const clsOf = id => { const s = studs.find(x => x.id == id); const c = s && cls.find(x => x.id == s.class_id); return c ? c.name : ''; };
    const respOf = fid => resp.filter(r => r.form_id == fid);
    let resp2 = resp;   // הפניה חיה

    function listView() {
      page.innerHTML =
        '<div class="page-head"><button class="back" onclick="showPage(\'home\')">→ חזרה לתפריט</button><h2>טפסים וחתימות הורים</h2>' +
        '<div class="head-actions"><button class="btn-primary sm" id="fNew"><i class="bi bi-plus-lg"></i> טופס חדש</button></div></div>' +
        '<div id="formsList"></div>' +
        '<div id="formsEmpty" class="empty-state" hidden><i class="bi bi-file-earmark-check"></i><div>אין טפסים עדיין — צור טופס חדש לשליחה להורים</div></div>';
      drawList();
      page.querySelector('#fNew').addEventListener('click', () => newFormForm());
    }
    function drawList() {
      const rows = forms.slice().reverse();
      page.querySelector('#formsList').innerHTML = rows.map(f => {
        const rs = respOf(f.id), signed = rs.filter(r => r.status === 'signed').length, pct = rs.length ? Math.round(signed / rs.length * 100) : 0;
        return '<div class="qr-card form-card"><div class="card-h-row"><h3><i class="bi bi-file-earmark-text"></i> ' + esc(f.title) + '</h3>' +
          '<span class="det-badge">' + signed + '/' + rs.length + ' נחתמו</span></div>' +
          (f.body ? '<p class="tl-note" style="margin:.2rem 0 .6rem">' + esc(f.body) + '</p>' : '') +
          '<div class="prog"><div class="prog-bar" style="width:' + pct + '%"></div></div>' +
          '<div class="det-actions" style="margin-top:10px">' +
            '<button class="btn-primary sm" data-open="' + f.id + '"><i class="bi bi-table"></i> מעקב וחתימות</button>' +
            '<button class="btn-ghost sm" data-link="' + f.id + '"><i class="bi bi-link-45deg"></i> קישור כללי</button>' +
            '<button class="btn-ghost sm danger" data-del="' + f.id + '"><i class="bi bi-trash"></i> מחיקה</button>' +
          '</div></div>';
      }).join('');
      page.querySelector('#formsEmpty').hidden = forms.length > 0;
      page.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => detailView(forms.find(f => f.id == b.dataset.open))));
      page.querySelectorAll('[data-link]').forEach(b => b.addEventListener('click', () => copyLink(signBase() + '?f=' + b.dataset.link)));
      page.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
        const f = forms.find(x => x.id == b.dataset.del); if (!f) return;
        if (!(await window.UI.confirm('למחוק את הטופס "' + esc(f.title) + '" וכל החתימות שלו?'))) return;
        for (const r of respOf(f.id)) await window.store.remove('form_responses', r.id);
        resp2 = resp2.filter(r => r.form_id != f.id); resp.length = 0; resp.push(...resp2);
        await window.store.remove('forms', f.id); const i = forms.indexOf(f); if (i >= 0) forms.splice(i, 1);
        drawList(); window.UI.toast('נמחק');
      }));
    }

    function newFormForm() {
      const clsOpts = cls.map(c => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('');
      window.UI.modal({
        title: 'טופס חדש', saveLabel: 'צור ושלח',
        bodyHTML: '<div class="form-grid">' +
          '<label class="fld fld-wide"><span>כותרת הטופס *</span><input class="inp mb0" id="nf_title" placeholder="לדוגמה: אישור טיול"></label>' +
          '<label class="fld fld-wide"><span>תוכן / הנחיה להורים</span><textarea class="inp mb0" id="nf_body" rows="3" placeholder="טקסט שההורה יראה לפני החתימה"></textarea></label>' +
          '<label class="fld fld-wide"><span>נמענים</span><select class="inp mb0" id="nf_scope"><option value="">כל התלמידים</option>' + clsOpts + '</select></label>' +
          '</div><p class="login-hint">ייווצר קישור אישי לכל תלמיד למעקב ולחתימת ההורה.</p>',
        onSave: async (mel) => {
          const title = mel.querySelector('#nf_title').value.trim();
          if (!title) { window.UI.toast('כותרת חובה', 'err'); return false; }
          const body = mel.querySelector('#nf_body').value.trim(), scope = mel.querySelector('#nf_scope').value;
          const targets = studs.filter(s => !scope || String(s.class_id) === scope);
          if (!targets.length) { window.UI.toast('אין תלמידים בנמענים שנבחרו', 'err'); return false; }
          const fr = await window.store.add('forms', { title, body, created_at: today() });
          const form = (fr.data && fr.data[0]) || { id: Date.now(), title, body, created_at: today() }; forms.push(form);
          for (const s of targets) {
            const row = { form_id: form.id, student_id: s.id, status: 'pending', signer_name: '', signed_at: null, token: tok() };
            const rr = await window.store.add('form_responses', row); const nr = (rr.data && rr.data[0]) || row; resp.push(nr); resp2 = resp;
          }
          window.UI.toast('הטופס נוצר עבור ' + targets.length + ' תלמידים'); drawList(); return true;
        },
      });
    }

    function detailView(f) {
      if (!f) return;
      const rs = respOf(f.id);
      const signed = rs.filter(r => r.status === 'signed').length;
      page.innerHTML =
        '<div class="page-head"><button class="back" id="fBack">→ חזרה לרשימת הטפסים</button><h2>' + esc(f.title) + '</h2>' +
        '<div class="head-actions"><button class="btn-ghost sm" id="fCsv"><i class="bi bi-download"></i> ייצוא CSV</button></div></div>' +
        (f.body ? '<div class="qr-card"><p style="margin:0">' + esc(f.body) + '</p></div>' : '') +
        '<div class="stat-row">' +
          '<div class="stat-card"><div class="stat-ic"><i class="bi bi-people-fill"></i></div><div class="stat-num">' + rs.length + '</div><div class="stat-lbl">נמענים</div></div>' +
          '<div class="stat-card"><div class="stat-ic"><i class="bi bi-check2-circle"></i></div><div class="stat-num">' + signed + '</div><div class="stat-lbl">נחתמו</div></div>' +
          '<div class="stat-card"><div class="stat-ic"><i class="bi bi-hourglass-split"></i></div><div class="stat-num">' + (rs.length - signed) + '</div><div class="stat-lbl">ממתינים</div></div>' +
        '</div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>תלמיד</th><th>כיתה</th><th>סטטוס</th><th>חתם</th><th>תאריך</th><th>פעולות</th></tr></thead><tbody id="fBody"></tbody></table></div>';
      drawDetail(f);
      page.querySelector('#fBack').addEventListener('click', listView);
      page.querySelector('#fCsv').addEventListener('click', () => exportCsv(f));
    }
    function drawDetail(f) {
      const rs = respOf(f.id);
      page.querySelector('#fBody').innerHTML = rs.map(r => {
        const link = signBase() + '?f=' + f.id + '&t=' + r.token;
        return '<tr><td>' + esc(nameOf(r.student_id)) + '</td><td>' + esc(clsOf(r.student_id)) + '</td>' +
          '<td><button class="chip ' + (r.status === 'signed' ? 'ok' : 'off') + '" data-tog="' + r.id + '">' + (r.status === 'signed' ? 'נחתם' : 'ממתין') + '</button></td>' +
          '<td>' + esc(r.signer_name || '') + '</td><td>' + esc(r.signed_at || '') + '</td>' +
          '<td class="row-act">' +
            '<button class="mini" data-copy="' + esc(link) + '" title="העתק קישור"><i class="bi bi-link-45deg"></i></button>' +
            '<button class="mini" data-wa="' + esc(link) + '" title="שליחה בוואטסאפ"><i class="bi bi-whatsapp"></i></button>' +
          '</td></tr>';
      }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:18px">אין נמענים</td></tr>';
      page.querySelectorAll('[data-tog]').forEach(b => b.addEventListener('click', async () => {
        const r = resp.find(x => x.id == b.dataset.tog); if (!r) return;
        if (r.status === 'signed') { r.status = 'pending'; r.signer_name = ''; r.signed_at = null; }
        else { r.status = 'signed'; r.signer_name = r.signer_name || 'סומן ידנית'; r.signed_at = today(); }
        await window.store.update('form_responses', r.id, { status: r.status, signer_name: r.signer_name, signed_at: r.signed_at });
        detailView(f);
      }));
      page.querySelectorAll('[data-copy]').forEach(b => b.addEventListener('click', () => copyLink(b.dataset.copy)));
      page.querySelectorAll('[data-wa]').forEach(b => b.addEventListener('click', () => {
        window.open('https://wa.me/?text=' + encodeURIComponent('קישור לחתימת אישור: ' + b.dataset.wa), '_blank');
      }));
    }

    function exportCsv(f) {
      const rs = respOf(f.id);
      const head = ['תלמיד', 'כיתה', 'סטטוס', 'חתם', 'תאריך'];
      const lines = [head.join(',')].concat(rs.map(r =>
        [nameOf(r.student_id), clsOf(r.student_id), r.status === 'signed' ? 'נחתם' : 'ממתין', r.signer_name || '', r.signed_at || '']
          .map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'form_' + f.id + '.csv'; a.click();
    }
    function copyLink(url) {
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => window.UI.toast('הקישור הועתק'), () => window.UI.toast(url));
      else window.UI.toast(url);
    }

    listView();
  }

  window.PAGE_RENDERERS = window.PAGE_RENDERERS || {};
  window.PAGE_RENDERERS.forms = renderForms;
})();
