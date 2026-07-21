# דוח תיקון והקשחה — cheder-maale-amos (ענף `fix/rls-and-e2e`)

> סטטוס: **תיקונים בוצעו + בדיקה סטטית ירוקה. אימות RLS/Playwright חי — ממתין להחלטה על סביבת בדיקה.**
> לא נדחף ל-main, לא נפרס. שמור בענף לביקורת.

## טבלת ממצאים

| # | ממצא | סטטוס | מה נעשה |
|---|------|-------|---------|
| **F1** 🔴 | מפקח מוחק כספים | ✅ תוקן | הפרדת `for select` (מנהל/מזכירה/מפקח) מ-`for all` (מנהל/מזכירה) ב-tuition/income/expenses. DELETE נשלט ע"י ה-for-all → מפקח נחסם. |
| **F2** 🔴 | מודל תפקידים ≠ RLS | ✅ תוקן | `is_supervisor`/`is_melamed`/`can_read_student`. מפקח = קריאה גלובלית, אפס כתיבה. מלמד = INSERT ל-behavior/attendance/tests + קריאת own בלבד. **מלכודת `insert().select()` נפתרה** ע"י טריגר `set_created_by` שמסמן created_by=auth.uid() → שורת המלמד נראית לו → ה-select חוזר. readonly/writeonly מתועדים כ-UX (RLS הוא הגבול). |
| **F3** 🟠 | 3 מקורות SQL סותרים | ✅ תוקן | `supabase/setup_all.sql` = מקור יחיד (25 טבלאות, 63 מדיניות, כל המיגרציות + RLS מתוקן). schema/policies/migration_* → `-- DEPRECATED`. `scripts/check_consistency.js` (JS↔SQL) — **ירוק, 0 פערים**. |
| **F4** 🟠 | אישורים חלשים | 🟡 חלקי | `SYNTH_DOMAIN` פר-מוסד ב-config (במקום `@bht.co.il` קשיח). **החלטה/סטייה:** `email_by_name` **נשאר ל-anon** — כי כניסה-לפי-שם (בקשת יוסף) מחייבת זאת לפני התחברות. סיכון: אנומרציית שם→טלפון (מתון, שמות לא סוד). *נותר:* כפיית החלפת סיסמה בכניסה ראשונה. |
| **F5** 🟡 | XSS ב-name + אין CSP | 🟡 חלקי | name/role עוברים `esc` (window.UI.esc מאוחד). *נותר:* meta CSP ב-index/sign. |
| **F6** 🟡 | submit_general בלי הגבלה | ✅ תוקן | דחייה אם תגובה מאותו טופס+שם בדקה האחרונה. |
| **F7** 🟡 | קוד מת | ✅ תוקן | הוסר `undefined` ב-app.js; פוטר עודכן; esc מאוחד ל-window.UI.esc (שימושים חדשים). *נותר:* איחוד esc ב-13 הקבצים הישנים (זהים פונקציונלית). |

## מה נבדק בפועל
- ✅ **בדיקת קונסיסטנטיות JS↔SQL** — 24 טבלאות + 5 RPC שהקוד קורא, כולם ב-setup_all. 0 פערים.
- ✅ תחביר כל קבצי ה-JS + sign.html.
- ⬜ **חבילת RLS חיה (task 5)** — `scripts/rls_test.js` נכתבה ומוכנה. **טרם רצה** (צריך פרויקט בדיקה + משתמשי בדיקה).
- ⬜ **Playwright (task 6)** — טרם נבנתה.

## 🔑 החלטה שצריך מיוסף (חסם אמיתי)
חבילת ה-RLS ו-Playwright דורשות **פרויקט Supabase נגיש עם המדיניות המתוקנת + 5 משתמשי בדיקה**. אני לא יכול ליצור פרויקט (צריך התחברות). שתי דרכים:
- **א׳ (מומלץ בספֵק):** תפתח פרויקט Supabase לבדיקות, תריץ בו `setup_all.sql` + `scripts/setup_test_users.sql`, ותן לי URL+key → אריץ את `rls_test.js` ואבנה Playwright מולו.
- **ב׳:** תאשר לי להריץ מול הפרויקט הקיים — אצור 5 משתמשי בדיקה זמניים, אריץ, ואנקה. (המדיניות המתוקנת בטוחה יותר מהקיימת, אז ההחלה עצמה שיפור.)

## נותר ליוסף
1. להחליט א׳/ב׳ לאימות.
2. אחרי אימות ירוק — להריץ `setup_all.sql` על הפרודקשן ולאשר פריסה (merge ל-main + Run workflow).

## קבצים שהשתנו
`supabase/setup_all.sql` (F1/F2/F3/F6), `js/{auth,admin,ui,app,config}.js` (F4/F5/F7), `index.html` (F7), `scripts/{check_consistency,rls_test}.js` (חדשים), `supabase/{schema,policies,migration_*}.sql` (deprecated).
