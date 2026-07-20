// supabase.js — אתחול חיבור מאובטח ל-Supabase (או מצב הדגמה).
// אין כאן שום סוד: ה-anon key מגיע מ-config.js וה-RLS בצד-שרת הוא ההגנה.
(function () {
  'use strict';
  const c = window.CV3 || {};
  if (c.DEMO) {
    window.sb = null;
    console.info('[cheder-v3] מצב הדגמה — אין חיבור Supabase. הדבק URL+anon key ב-js/config.js כדי להתחבר.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('[cheder-v3] ספריית supabase-js לא נטענה (בדוק את ה-CDN ב-index.html).');
    window.sb = null;
    return;
  }
  window.sb = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
})();
