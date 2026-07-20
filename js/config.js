// config.js — ⚙️ הקובץ היחיד שעורכים לכל מוסד. מזהה את המוסד + חיבור Supabase שלו.
// ה-anon key בטוח לפרסום — ה-RLS בצד-שרת הוא ההגנה.
window.CV3 = {
  INSTANCE: 'maale-amos',                 // מזהה המוסד
  INSTANCE_NAME: 'תלמוד תורה מעלה עמוס',  // שם לתצוגה

  SUPABASE_URL: '',                       // פרויקט Supabase נפרד למעלה עמוס — יוזן כאן
  SUPABASE_ANON_KEY: '',                  // publishable key של אותו פרויקט
};
// מצב הדגמה אוטומטי כשאין עדיין חיבור:
window.CV3.DEMO = !window.CV3.SUPABASE_URL || !window.CV3.SUPABASE_ANON_KEY;
