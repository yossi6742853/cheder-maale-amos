-- הקמת סביבת בדיקה ל-rls_test.js (task 3). הרץ על פרויקט הבדיקות אחרי setup_all.sql.
-- יוצר 5 משתמשי auth מאומתים + profiles + 2 כיתות + 4 תלמידים + נתוני כספים. אידמפוטנטי.

-- פונקציית עזר: יוצר משתמש auth מאומת עם סיסמה (אם לא קיים)
create or replace function public._mk_test_user(p_email text, p_pw text, p_role text)
  returns uuid language plpgsql security definer set search_path = public, auth as
$$
declare uid uuid;
begin
  select id into uid from auth.users where email = p_email;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', p_email,
      crypt(p_pw, gen_salt('bf')), now(), now(), now(),
      '{"provider":"email","providers":["email"]}', json_build_object('name', p_email),
      '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (uid::text, uid, json_build_object('sub', uid::text, 'email', p_email), 'email', now(), now(), now())
    on conflict do nothing;
  end if;
  insert into public.profiles (id, email, tz, name, role, active)
    values (uid, p_email, split_part(p_email,'@',1), p_email, p_role, true)
    on conflict (id) do update set role = p_role, active = true;
  return uid;
end $$;

do $$
declare u_admin uuid; u_mech uuid; u_mel uuid; u_mef uuid; u_maz uuid; c1 bigint; c2 bigint;
begin
  u_admin := public._mk_test_user('admin@maale-amos.local',     'admin-123456',     'מנהל');
  u_mech  := public._mk_test_user('mechanech@maale-amos.local', 'mechanech-123456', 'מחנך');
  u_mel   := public._mk_test_user('melamed@maale-amos.local',   'melamed-123456',   'מלמד');
  u_mef   := public._mk_test_user('mefake@maale-amos.local',    'mefake-123456',    'מפקח');
  u_maz   := public._mk_test_user('mazkira@maale-amos.local',   'mazkira-123456',   'מזכירה');

  -- 2 כיתות
  insert into public.classes (name) values ('כיתה 1 בדיקה') on conflict do nothing;
  insert into public.classes (name) values ('כיתה 2 בדיקה') on conflict do nothing;
  select id into c1 from public.classes where name = 'כיתה 1 בדיקה' limit 1;
  select id into c2 from public.classes where name = 'כיתה 2 בדיקה' limit 1;

  -- מחנך משויך לכיתה 1 בלבד
  insert into public.user_class_access (user_id, class_id) values (u_mech, c1) on conflict do nothing;

  -- 4 תלמידים (2 בכל כיתה)
  insert into public.students (name, class_id) select 'תלמיד בדיקה 1', c1 where not exists (select 1 from public.students where name='תלמיד בדיקה 1');
  insert into public.students (name, class_id) select 'תלמיד בדיקה 2', c1 where not exists (select 1 from public.students where name='תלמיד בדיקה 2');
  insert into public.students (name, class_id) select 'תלמיד בדיקה 3', c2 where not exists (select 1 from public.students where name='תלמיד בדיקה 3');
  insert into public.students (name, class_id) select 'תלמיד בדיקה 4', c2 where not exists (select 1 from public.students where name='תלמיד בדיקה 4');

  -- נתוני כספים (id=1 בשימוש בבדיקה)
  insert into public.tuition (student_id, month, amount, status)
    select (select id from public.students where name='תלמיד בדיקה 1'), '2026-07', 500, 'due'
    where not exists (select 1 from public.tuition);
  insert into public.income (source, amount) select 'תרומת בדיקה', 100 where not exists (select 1 from public.income);
  insert into public.expenses (name, amount) select 'הוצאת בדיקה', 50 where not exists (select 1 from public.expenses);
end $$;

-- לניקוי אחרי הבדיקה (אופציונלי):
-- delete from auth.users where email like '%@maale-amos.local';
-- delete from public.students where name like 'תלמיד בדיקה%';
-- delete from public.classes where name like '%בדיקה';
