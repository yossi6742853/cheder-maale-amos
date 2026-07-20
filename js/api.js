// api.js — שכבת נתונים דקה מעל Supabase (או מצב הדגמה).
// כל קריאה עוברת דרך window.sb → ה-RLS בצד-שרת מחליט מה מותר. אין טוקנים בקוד.
// בהמשך (חלקים 3+) המודולים ישתמשו ב-db.list/insert/update/remove.
(function () {
  'use strict';
  const DEMO = !window.sb;

  async function list(table, opts) {
    if (DEMO) return { ok: true, data: [], demo: true };
    let q = window.sb.from(table).select(opts && opts.select || '*');
    if (opts && opts.eq) for (const k in opts.eq) q = q.eq(k, opts.eq[k]);
    if (opts && opts.order) q = q.order(opts.order, { ascending: opts.asc !== false });
    const { data, error } = await q;
    return { ok: !error, data: data || [], error: error && error.message };
  }
  async function insert(table, row) {
    if (DEMO) return { ok: true, demo: true };
    const { data, error } = await window.sb.from(table).insert(row).select();
    return { ok: !error, data, error: error && error.message };
  }
  async function update(table, id, patch) {
    if (DEMO) return { ok: true, demo: true };
    const { data, error } = await window.sb.from(table).update(patch).eq('id', id).select();
    return { ok: !error, data, error: error && error.message };
  }
  async function remove(table, id) {
    if (DEMO) return { ok: true, demo: true };
    const { error } = await window.sb.from(table).delete().eq('id', id);
    return { ok: !error, error: error && error.message };
  }

  window.db = { DEMO, list, insert, update, remove };
})();
