create type public.contact_method as enum ('official_line', 'personal_line', 'messenger', 'phone');

alter table public.student_registrations
  alter column phone drop not null,
  add column contact_method public.contact_method not null default 'phone',
  add column contact_name text,
  add constraint registration_contact_details check (
    (contact_method = 'phone' and phone is not null and contact_name is null)
    or (contact_method <> 'phone' and phone is null and contact_name is not null
        and char_length(btrim(contact_name)) between 1 and 80)
  );

alter table public.students
  alter column phone drop not null,
  add column contact_method public.contact_method not null default 'phone',
  add column contact_name text,
  add constraint student_contact_details check (
    (contact_method = 'phone' and phone is not null and contact_name is null)
    or (contact_method <> 'phone' and phone is null and contact_name is not null
        and char_length(btrim(contact_name)) between 1 and 80)
  );

-- Keep the previous signatures available while existing browser tabs update.
create function public.public_submit_registration(
  p_teacher_id uuid, p_name text, p_grade text, p_school text, p_focus text,
  p_location text, p_phone text, p_material public.material_plan, p_note text,
  p_contact_method public.contact_method, p_contact_name text
)
returns table(registration_id uuid, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
    insert into public.student_registrations as registration (
      teacher_id, status, name, grade, school, focus, location, phone, material, note, contact_method, contact_name
    )
    select teacher.id, 'pending'::public.registration_status,
      btrim(p_name), btrim(p_grade), btrim(p_school), btrim(p_focus), btrim(p_location),
      btrim(p_phone), p_material, nullif(btrim(p_note), ''), p_contact_method, btrim(p_contact_name)
    from public.teachers as teacher
    where teacher.id = p_teacher_id and teacher.active
    returning registration.id, registration.created_at;

  if not found then raise exception 'registration_unavailable'; end if;
end;
$function$;

revoke all on function public.public_submit_registration(uuid, text, text, text, text, text, text, public.material_plan, text, public.contact_method, text)
  from public, anon, authenticated;
grant execute on function public.public_submit_registration(uuid, text, text, text, text, text, text, public.material_plan, text, public.contact_method, text)
  to anon, authenticated;

create function public.teacher_add_student(
  p_teacher_id uuid, p_name text, p_grade text, p_school text, p_focus text,
  p_location text, p_phone text, p_material public.material_plan, p_region text,
  p_contact_method public.contact_method, p_contact_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_student_id uuid;
begin
  if auth.uid() is null or p_teacher_id is distinct from auth.uid()
      or not public.is_teacher()
      or not exists (select 1 from public.teachers t where t.id = p_teacher_id and t.active) then
    raise exception 'teacher_only' using errcode = '42501';
  end if;

  if p_region is not null and not exists (
    select 1 from public.booking_settings s
    where s.teacher_id = p_teacher_id and p_region = any(s.tag_options)
  ) then
    raise exception 'invalid_student_region';
  end if;

  insert into public.students (
    teacher_id, name, grade, school, focus, location, phone, material, region, contact_method, contact_name
  )
  values (p_teacher_id, btrim(p_name), btrim(p_grade), btrim(p_school), btrim(p_focus), btrim(p_location),
    btrim(p_phone), p_material, p_region, p_contact_method, btrim(p_contact_name))
  returning id into new_student_id;
  return new_student_id;
end;
$function$;

revoke all on function public.teacher_add_student(uuid, text, text, text, text, text, text, public.material_plan, text, public.contact_method, text)
  from public, anon, authenticated;
grant execute on function public.teacher_add_student(uuid, text, text, text, text, text, text, public.material_plan, text, public.contact_method, text)
  to authenticated;

create or replace function public.approve_registration(p_registration_id uuid, p_teacher_id uuid)
returns public.students
language plpgsql
security definer
set search_path = ''
as $function$
declare
  result public.students;
begin
  if auth.uid() is null or p_teacher_id is distinct from auth.uid() or not public.is_teacher() then
    raise exception 'teacher_only' using errcode = '42501';
  end if;

  with updated as (
    update public.student_registrations set status = 'approved'
    where id = p_registration_id and teacher_id = p_teacher_id and status = 'pending'
    returning *
  )
  insert into public.students (teacher_id, registration_id, name, grade, school, focus, location, phone, material, contact_method, contact_name)
  select teacher_id, id, name, grade, school, focus, location, phone, material, contact_method, contact_name from updated
  returning * into result;
  if result.id is null then raise exception 'registration_not_found'; end if;
  return result;
end;
$function$;

-- Compare the supplied contact detail on the server. The response has no contact values.
create function public.public_lookup_students(p_name text, p_teacher_id uuid, p_contact_confirmation text)
returns table(id uuid, name text, region text, needs_contact boolean)
language sql
stable
security definer
set search_path = ''
as $function$
  with candidates as (
    select s.id, s.name, s.region, s.contact_method, s.contact_name, s.phone
    from public.students s
    join public.teachers t on t.id = s.teacher_id and t.active
    where s.active and s.teacher_id = p_teacher_id and s.region is not null and btrim(s.name) = btrim(p_name)
  ),
  confirmed as (
    select c.id, c.name, c.region
    from candidates c
    where case when nullif(btrim(p_contact_confirmation), '') is null then
      (select count(*) from candidates) = 1
    when c.contact_method = 'phone' then
      btrim(p_contact_confirmation) ~ '^[0-9]{3}$'
      and right(regexp_replace(c.phone, '[^0-9]', '', 'g'), 3) = btrim(p_contact_confirmation)
    else lower(btrim(c.contact_name)) = lower(btrim(p_contact_confirmation)) end
  )
  select c.id, c.name, c.region, false from confirmed c where (select count(*) from confirmed) = 1
  union all
  select null::uuid, null::text, null::text, true
  where (select count(*) from candidates) > 1 and (select count(*) from confirmed) <> 1;
$function$;

revoke all on function public.public_lookup_students(text, uuid, text) from public, anon, authenticated;
grant execute on function public.public_lookup_students(text, uuid, text) to anon, authenticated;

-- Older clients can still find a unique name, without exposing contact details
-- or returning candidates that require contact confirmation.
create or replace function public.public_lookup_students(p_name text, p_teacher_id uuid)
returns table(id uuid, name text, phone_suffix text, region text)
language sql
stable
security definer
set search_path = ''
as $function$
  select matched.id, matched.name, null::text, matched.region
  from public.public_lookup_students(p_name, p_teacher_id, null::text) matched
  where not matched.needs_contact;
$function$;
