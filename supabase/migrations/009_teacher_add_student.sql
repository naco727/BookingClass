-- Teachers can create an active student profile without a public registration.
create or replace function public.teacher_add_student(
  p_teacher_id uuid,
  p_name text,
  p_grade text,
  p_school text,
  p_focus text,
  p_location text,
  p_phone text,
  p_material public.material_plan,
  p_region text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_student_id uuid;
begin
  if auth.uid() is null
      or p_teacher_id is distinct from auth.uid()
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

  insert into public.students (teacher_id, name, grade, school, focus, location, phone, material, region)
  values (p_teacher_id, btrim(p_name), btrim(p_grade), btrim(p_school), btrim(p_focus),
    btrim(p_location), btrim(p_phone), p_material, p_region)
  returning id into new_student_id;
  return new_student_id;
end;
$function$;

revoke all on function public.teacher_add_student(uuid, text, text, text, text, text, text, public.material_plan, text)
  from public, anon, authenticated;
grant execute on function public.teacher_add_student(uuid, text, text, text, text, text, text, public.material_plan, text)
  to authenticated;
