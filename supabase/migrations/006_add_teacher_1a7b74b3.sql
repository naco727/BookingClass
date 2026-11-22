-- Add the supplied Supabase Auth user to the teacher profiles and role metadata.
do $$
declare
  teacher_uid uuid := '1a7b74b3-8a98-4028-84ba-9c1e0273a546';
begin
  if not exists (select 1 from auth.users where id = teacher_uid) then
    raise exception 'auth user % does not exist', teacher_uid;
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', 'teacher')
  where id = teacher_uid;

  insert into public.teachers (id, slug, display_name)
  values (teacher_uid, 'teacher-1a7b74b3', '老師')
  on conflict (id) do update
  set active = true;
end;
$$;
