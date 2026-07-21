#!/usr/bin/env node
/* חבילת בדיקות RLS אמיתית (task 5). מריצה את מטריצת ההרשאות מול Supabase עם JWT אמיתי לכל תפקיד.
 * דרישות מוקדמות (הרץ פעם אחת על פרויקט הבדיקות): setup_all.sql + scripts/setup_test_users.sql.
 * שימוש:  node scripts/rls_test.js <SUPABASE_URL> <ANON_KEY>
 * הבדיקה עוברת = כל שורה PASS. נכשל אחד = exit 1. */
const [URL, KEY] = process.argv.slice(2);
if (!URL || !KEY) { console.error('usage: node rls_test.js <URL> <ANON_KEY>'); process.exit(2); }

const USERS = {
  admin:     { email: 'admin@maale-amos.local',     pw: 'admin-123456' },
  mechanech: { email: 'mechanech@maale-amos.local', pw: 'mechanech-123456' }, // כיתה 1
  melamed:   { email: 'melamed@maale-amos.local',   pw: 'melamed-123456' },   // בלי כיתה
  mefake:    { email: 'mefake@maale-amos.local',    pw: 'mefake-123456' },     // מפקח, בלי כיתה
  mazkira:   { email: 'mazkira@maale-amos.local',   pw: 'mazkira-123456' },
};
const H = tok => ({ apikey: KEY, Authorization: 'Bearer ' + (tok || KEY), 'Content-Type': 'application/json' });
async function login(u) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.pw }) });
  const d = await r.json(); if (!d.access_token) throw new Error('login failed ' + u.email + ': ' + (d.error_description || d.msg || JSON.stringify(d)));
  return d.access_token;
}
async function rest(method, pathq, tok, body) {
  const r = await fetch(`${URL}/rest/v1/${pathq}`, { method, headers: { ...H(tok), Prefer: method === 'POST' ? 'return=representation' : undefined }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch (_) {}
  return { status: r.status, data };
}
// allow = הפעולה הצליחה (2xx ומחזירה נתונים/שורה); deny = נחסמה (403/שגיאת RLS/ריק)
const isAllow = res => res.status >= 200 && res.status < 300 && (Array.isArray(res.data) ? true : !!res.data);
const isDeny  = res => res.status === 401 || res.status === 403 || (Array.isArray(res.data) && res.data.length === 0) || (res.data && res.data.code);

let pass = 0, fail = 0;
function assert(name, got, want) { // want: 'allow'|'deny'
  const ok = want === 'allow' ? isAllow(got) : isDeny(got);
  console.log(`  ${ok ? '✅' : '❌'} ${name} → צריך ${want}, קיבל status=${got.status}${Array.isArray(got.data) ? ` rows=${got.data.length}` : ''}`);
  ok ? pass++ : fail++;
}

(async () => {
  const T = {}; for (const k in USERS) T[k] = await login(USERS[k]);
  console.log('== F1: מפקח לא מוחק כספים (הבאג הקריטי) ==');
  // צריך שורת שכ"ל אחת קיימת (id 1 בדוגמה). מפקח: SELECT allow, DELETE deny.
  assert('מפקח tuition SELECT', await rest('GET', 'tuition?select=id&limit=1', T.mefake), 'allow');
  assert('מפקח tuition DELETE', await rest('DELETE', 'tuition?id=eq.999999', T.mefake), 'deny');
  assert('מפקח income DELETE',  await rest('DELETE', 'income?id=eq.999999',  T.mefake), 'deny');
  assert('מפקח expenses DELETE',await rest('DELETE', 'expenses?id=eq.999999',T.mefake), 'deny');
  assert('מזכירה tuition DELETE (מותר)', await rest('DELETE', 'tuition?id=eq.999999', T.mazkira), 'allow'); // 204/מוחק 0 שורות = מותר

  console.log('== F2: מפקח רואה תלמידים; מלמד מזין ==');
  assert('מפקח students SELECT (רואה)', await rest('GET', 'students?select=id&limit=1', T.mefake), 'allow');
  assert('מפקח behavior INSERT (חסום)', await rest('POST', 'behavior_events', T.mefake, { student_id: 1, note: 'x' }), 'deny');
  assert('מלמד behavior INSERT (מותר)', await rest('POST', 'behavior_events', T.melamed, { student_id: 1, note: 'רישום מלמד' }), 'allow');
  assert('מלמד students SELECT היסטוריה (חסום)', await rest('GET', 'students?select=id', T.melamed), 'deny');

  console.log('== מחנך: כיתתו כן, כיתה אחרת לא ==');
  assert('מחנך students SELECT (כיתתו)', await rest('GET', 'students?select=id,class_id', T.mechanech), 'allow');
  assert('מזכירה students SELECT (חסום)', await rest('GET', 'students?select=id', T.mazkira), 'deny');

  console.log('== anon: קריאה ישירה חסומה ==');
  assert('anon students SELECT', await rest('GET', 'students?select=id', null), 'deny');
  assert('anon tuition SELECT',  await rest('GET', 'tuition?select=id', null), 'deny');
  assert('anon forms ישיר',      await rest('GET', 'forms?select=id', null), 'deny');

  console.log(`\nסה"כ: ${pass} עברו, ${fail} נכשלו`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
