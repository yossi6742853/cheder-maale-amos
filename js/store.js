// store.js — מאגר נתונים מרכזי משותף לכל המודולים.
// DEMO: בזיכרון עם seed עשיר ומקושר (מאפשר כרטיס תלמיד מלא + סטטיסטיקות אמיתיות).
// חי: מנתב ל-window.db (Supabase + RLS).
(function () {
  'use strict';
  const DEMO = !window.sb;
  const T = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  // ---------- seed דמו (שמות פיקטיביים בלבד) ----------
  const seed = {
    classes: [{ id: 1, name: 'כיתה א׳' }, { id: 2, name: 'כיתה ב׳' }, { id: 3, name: 'כיתה ג׳' }],
    users: [
      { id: 1, name: 'מנהל המערכת', tz: '000000000', password: '1234', role: 'מנהל' },
      { id: 2, name: 'מלמד כיתה א׳', tz: '111111111', password: '1234', role: 'מורה' },
      { id: 3, name: 'מלמד כיתה ב׳', tz: '222222222', password: '1234', role: 'מורה', perms: ['students', 'behavior', 'attendance'] },
    ],
    user_class_access: [{ id: 1, user_id: 2, class_id: 1 }, { id: 2, user_id: 3, class_id: 2 }],
    students: [
      { id: 1, name: 'תלמיד לדוגמה א׳', class_id: 1, parent_name: 'משפחת א׳', parent_phone: '050-0000001', status: 'פעיל', notes: 'ילד מתמיד' },
      { id: 2, name: 'תלמיד לדוגמה ב׳', class_id: 1, parent_name: 'משפחת ב׳', parent_phone: '050-0000002', status: 'פעיל', notes: '' },
      { id: 3, name: 'תלמיד לדוגמה ג׳', class_id: 2, parent_name: 'משפחת ג׳', parent_phone: '050-0000003', status: 'פעיל', notes: '' },
      { id: 4, name: 'תלמיד לדוגמה ד׳', class_id: 2, parent_name: 'משפחת ד׳', parent_phone: '050-0000004', status: 'פעיל', notes: '' },
      { id: 5, name: 'תלמיד לדוגמה ה׳', class_id: 3, parent_name: 'משפחת ה׳', parent_phone: '050-0000005', status: 'לא פעיל', notes: 'עבר דירה' },
      { id: 6, name: 'תלמיד לדוגמה ו׳', class_id: 3, parent_name: 'משפחת ו׳', parent_phone: '050-0000006', status: 'פעיל', notes: '' },
    ],
    categories: [{ id: 1, name: 'התנהגות למופת', kind: 'behavior' }, { id: 2, name: 'הפרעה בשיעור', kind: 'behavior' }, { id: 3, name: 'עזרה לחבר', kind: 'behavior' }, { id: 4, name: 'איחור', kind: 'behavior' }],
    behavior_events: [
      { id: 1, student_id: 1, category_id: 1, severity: 'נמוכה', event_date: daysAgo(1), note: 'עזר בסידור הכיתה' },
      { id: 2, student_id: 1, category_id: 3, severity: 'נמוכה', event_date: daysAgo(4), note: 'עזר לחבר בלימוד' },
      { id: 3, student_id: 2, category_id: 2, severity: 'בינונית', event_date: daysAgo(2), note: 'דיבר בזמן השיעור' },
      { id: 4, student_id: 3, category_id: 1, severity: 'נמוכה', event_date: daysAgo(3), note: '' },
      { id: 5, student_id: 4, category_id: 4, severity: 'בינונית', event_date: daysAgo(1), note: 'איחר לתפילה' },
      { id: 6, student_id: 2, category_id: 1, severity: 'נמוכה', event_date: daysAgo(6), note: '' },
    ],
    attendance: [
      { id: 1, student_id: 1, date: T(), status: 'present' }, { id: 2, student_id: 2, date: T(), status: 'late' },
      { id: 3, student_id: 3, date: T(), status: 'present' }, { id: 4, student_id: 4, date: T(), status: 'absent' },
    ],
    tests: [
      { id: 1, student_id: 1, subject: 'פרשת בראשית', grade: 95, date: daysAgo(5) },
      { id: 2, student_id: 2, subject: 'פרשת נח', grade: 82, date: daysAgo(5) },
      { id: 3, student_id: 3, subject: 'פרשת לך לך', grade: 88, date: daysAgo(5) },
    ],
    functioning: [
      { id: 1, student_id: 1, area: 'תפילה', score: 9, date: daysAgo(7) },
      { id: 2, student_id: 2, area: 'לימוד', score: 7, date: daysAgo(7) },
    ],
    medications: [
      { id: 1, student_id: 3, kind: 'allergy', name: 'אלרגיה לבוטנים', details: 'להימנע ממאכלים עם בוטנים', date: daysAgo(30) },
    ],
    conversations: [
      { id: 1, student_id: 2, date: daysAgo(3), summary: 'שיחת עידוד לגבי ההתנהגות בשיעור' },
    ],
    meetings: [
      { id: 1, student_id: 1, date: daysAgo(10), attendees: 'הורים + מלמד', summary: 'אסיפה תקופתית — התקדמות טובה' },
    ],
    reading: [{ id: 1, student_id: 1, level: 'שוטף', date: daysAgo(8), note: 'קורא יפה' }],
    writing: [{ id: 1, student_id: 1, level: 'טוב', date: daysAgo(8), note: '' }],
    tuition: [{ id: 1, student_id: 1, month: T().slice(0, 7), amount: 500, status: 'paid' }],
    forms: [
      { id: 1, title: 'אישור השתתפות בטיול שנתי', body: 'הורים יקרים, נא לאשר את השתתפות בנכם בטיול השנתי שייערך בעז״ה החודש. נא לחתום למטה.', created_at: daysAgo(2) },
    ],
    form_responses: [
      { id: 1, form_id: 1, student_id: 1, status: 'signed', signer_name: 'משפחת לדוגמה א׳', signed_at: daysAgo(1), token: 'demo1a' },
      { id: 2, form_id: 1, student_id: 2, status: 'pending', signer_name: '', signed_at: null, token: 'demo2b' },
      { id: 3, form_id: 1, student_id: 3, status: 'pending', signer_name: '', signed_at: null, token: 'demo3c' },
    ],
    feedback: [],
    audit_log: [
      { id: 1, action: 'login', detail: 'מנהל המערכת נכנס', created_at: T() + ' 08:12' },
      { id: 2, action: 'create', detail: 'דיווח התנהגות נוסף', created_at: T() + ' 08:20' },
    ],
  };

  const mem = DEMO ? JSON.parse(JSON.stringify(seed)) : null;
  const seqs = {};
  if (DEMO) for (const t in mem) seqs[t] = 1 + mem[t].reduce((m, r) => Math.max(m, r.id || 0), 0);

  async function list(table, opts) {
    if (DEMO) { let r = (mem[table] || []).slice(); if (opts && opts.eq) for (const k in opts.eq) r = r.filter(x => x[k] == opts.eq[k]); return r; }
    const res = await window.db.list(table, opts); return res.data || [];
  }
  async function byStudent(table, sid) {
    if (DEMO) return (mem[table] || []).filter(r => r.student_id == sid);
    const res = await window.db.list(table, { eq: { student_id: sid } }); return res.data || [];
  }
  async function add(table, row) {
    if (DEMO) { row = Object.assign({}, row); if (!seqs[table]) seqs[table] = 1; row.id = seqs[table]++; (mem[table] = mem[table] || []).push(row); return { ok: true, data: [row] }; }
    return window.db.insert(table, row);
  }
  async function update(table, id, patch) {
    if (DEMO) { const r = (mem[table] || []).find(x => x.id == id); if (r) Object.assign(r, patch); return { ok: true }; }
    return window.db.update(table, id, patch);
  }
  async function remove(table, id) {
    if (DEMO) { mem[table] = (mem[table] || []).filter(x => x.id != id); return { ok: true }; }
    return window.db.remove(table, id);
  }

  window.store = { DEMO, list, add, update, remove, byStudent, _mem: mem };
})();
