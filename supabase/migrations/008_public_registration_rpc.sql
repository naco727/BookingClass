-- Public registration can create a pending record without reading private tables.
create or replace function public.public_submit_registration(
  p_teacher_id uuid,
  p_name text,
  p_grade text,
  p_school text,
  p_focus text,
  p_location text,
  p_phone text,
  p_material public.material_plan,
  p_note text
)
returns table(registration_id uuid, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  return query
    insert into public.student_registrations as registration (
      teacher_id, status, name, grade, school, focus, location, phone, material, note
    )
    select teacher.id, 'pending'::public.registration_status,
      btrim(p_name), btrim(p_grade), btrim(p_school), btrim(p_focus),
      btrim(p_location), btrim(p_phone), p_material, nullif(btrim(p_note), '')
    from public.teachers as teacher
    where teacher.id = p_teacher_id and teacher.active
    returning registration.id, registration.created_at;

  if not found then
    raise exception 'registration_unavailable';
  end if;
end;
$function$;

revoke all on function public.public_submit_registration(uuid, text, text, text, text, text, text, public.material_plan, text)
  from public, anon, authenticated;
grant execute on function public.public_submit_registration(uuid, text, text, text, text, text, text, public.material_plan, text)
  to anon, authenticated;

drop policy if exists registrations_public_insert on public.student_registrations;
revoke insert on public.student_registrations from anon, authenticated;
