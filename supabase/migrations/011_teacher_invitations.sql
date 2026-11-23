create table public.teacher_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.teacher_admins enable row level security;
revoke all on public.teacher_admins from public, anon, authenticated;

create function public.is_teacher_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.teacher_admins a where a.user_id = auth.uid());
$$;

revoke all on function public.is_teacher_admin() from public, anon, authenticated;
grant execute on function public.is_teacher_admin() to authenticated;

create function public.provision_invited_teacher(p_admin_id uuid, p_email text, p_user_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  target_user auth.users%rowtype;
  existing_teacher public.teachers%rowtype;
begin
  if not exists (select 1 from public.teacher_admins a where a.user_id = p_admin_id) then
    raise exception 'Teacher administrator required' using errcode = '42501';
  end if;

  -- A missing ID is only used to recover a previously sent invitation for this email.
  select u.* into target_user
  from auth.users u
  where lower(u.email) = p_email
    and (p_user_id is null or u.id = p_user_id)
    and u.invited_at is not null
    and not u.is_sso_user
  for update;

  if not found then
    return 'account_exists';
  end if;

  select t.* into existing_teacher from public.teachers t where t.id = target_user.id for update;

  if found and not existing_teacher.active then
    return 'inactive';
  end if;

  if existing_teacher.id is not null and target_user.raw_app_meta_data ->> 'role' = 'teacher' then
    return 'already_authorized';
  end if;

  update auth.users u
  set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'teacher')
  where u.id = target_user.id;

  insert into public.teachers (id, slug, display_name)
  values (target_user.id, 'teacher-' || target_user.id::text, '老師')
  on conflict (id) do nothing;

  return 'authorized';
end;
$$;

revoke all on function public.provision_invited_teacher(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.provision_invited_teacher(uuid, text, uuid) to service_role;
