-- Input hardening and teacher-side direct booking.
-- All values are passed as typed RPC parameters; no SQL is assembled from user text.

alter table public.student_registrations
  add constraint registration_text_lengths check (
    char_length(trim(name)) between 1 and 80 and
    char_length(trim(grade)) between 1 and 40 and
    char_length(trim(school)) between 1 and 120 and
    char_length(trim(focus)) between 1 and 240 and
    char_length(trim(location)) between 1 and 240 and
    char_length(trim(phone)) between 1 and 40 and
    char_length(coalesce(note, '')) <= 1000
  );

alter table public.students
  add constraint student_text_lengths check (
    char_length(trim(name)) between 1 and 80 and
    char_length(trim(grade)) between 1 and 40 and
    char_length(trim(school)) between 1 and 120 and
    char_length(trim(focus)) between 1 and 240 and
    char_length(trim(location)) between 1 and 240 and
    char_length(trim(phone)) between 1 and 40
  );

create or replace function public.teacher_create_booking(
  p_teacher_id uuid,
  p_slot_id uuid,
  p_start time,
  p_end time,
  p_name text,
  p_grade text,
  p_school text,
  p_focus text,
  p_location text,
  p_phone text,
  p_material public.material_plan,
  p_region text
)
returns public.bookings
language plpgsql security definer set search_path = public
as $function$
declare
  slot_row public.availability_slots;
  student_row public.students;
  booking_row public.bookings;
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  if char_length(trim(p_name)) not between 1 and 80 or char_length(trim(p_grade)) not between 1 and 40 or char_length(trim(p_school)) not between 1 and 120 or char_length(trim(p_focus)) not between 1 and 240 or char_length(trim(p_location)) not between 1 and 240 or char_length(trim(p_phone)) not between 1 and 40 or char_length(trim(p_region)) not between 1 and 80 then
    raise exception 'invalid_student_input';
  end if;
  select * into slot_row from public.availability_slots where id = p_slot_id and teacher_id = p_teacher_id and open for update;
  if slot_row.id is null or p_start >= p_end or p_start < slot_row.start_time or p_end > slot_row.end_time then raise exception 'invalid_booking_time'; end if;
  if exists (select 1 from public.bookings where slot_id = p_slot_id and teacher_id = p_teacher_id and status = 'confirmed' and p_start < end_time and p_end > start_time) then raise exception 'booking_conflict'; end if;
  insert into public.students (teacher_id, name, grade, school, focus, location, phone, material, region)
    values (p_teacher_id, trim(p_name), trim(p_grade), trim(p_school), trim(p_focus), trim(p_location), trim(p_phone), p_material, trim(p_region))
    returning * into student_row;
  insert into public.bookings (teacher_id, slot_id, student_id, start_time, end_time, region)
    values (p_teacher_id, p_slot_id, student_row.id, p_start, p_end, trim(p_region))
    returning * into booking_row;
  return booking_row;
end;
$function$;
grant execute on function public.teacher_create_booking(uuid, uuid, time, time, text, text, text, text, text, text, public.material_plan, text) to authenticated;

create or replace function public.delete_registration(p_registration_id uuid, p_teacher_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  delete from public.student_registrations
  where id = p_registration_id and teacher_id = p_teacher_id and status = 'pending';
end;
$$;
grant execute on function public.delete_registration(uuid, uuid) to authenticated;

create or replace function public.teacher_book_existing_student(
  p_teacher_id uuid,
  p_student_id uuid,
  p_slot_id uuid,
  p_start time,
  p_end time
)
returns public.bookings
language plpgsql security definer set search_path = public
as $function$
declare
  student_row public.students;
  slot_row public.availability_slots;
  booking_row public.bookings;
  scan_row record;
  effective_region text;
  cursor_time time;
  gap_valid boolean := false;
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  if exists (select 1 from public.booking_settings where teacher_id = p_teacher_id and now() <= booking_close) then raise exception 'booking_still_open'; end if;
  select * into student_row from public.students where id = p_student_id and teacher_id = p_teacher_id and active for update;
  if student_row.id is null or student_row.region is null then raise exception 'student_not_ready'; end if;
  select * into slot_row from public.availability_slots where id = p_slot_id and teacher_id = p_teacher_id and open for update;
  if slot_row.id is null or p_start >= p_end or p_start < slot_row.start_time or p_end > slot_row.end_time then raise exception 'invalid_booking_time'; end if;
  select coalesce(slot_row.preset_region, min(region)) into effective_region from public.bookings where teacher_id = p_teacher_id and slot_id = p_slot_id and status = 'confirmed';
  if effective_region is not null and effective_region <> student_row.region then raise exception 'region_locked'; end if;
  cursor_time := slot_row.start_time;
  for scan_row in select start_time, end_time from public.bookings where teacher_id = p_teacher_id and slot_id = p_slot_id and status = 'confirmed' order by start_time loop
    if p_start >= cursor_time and p_end <= scan_row.start_time and scan_row.start_time - cursor_time > interval '30 minutes' then gap_valid := true; end if;
    if scan_row.end_time > cursor_time then cursor_time := scan_row.end_time; end if;
  end loop;
  if p_start >= cursor_time and p_end <= slot_row.end_time and slot_row.end_time - cursor_time > interval '30 minutes' then gap_valid := true; end if;
  if not gap_valid then raise exception 'booking_not_available'; end if;
  insert into public.bookings (teacher_id, slot_id, student_id, start_time, end_time, region)
    values (p_teacher_id, p_slot_id, p_student_id, p_start, p_end, student_row.region)
    returning * into booking_row;
  return booking_row;
end;
$function$;
grant execute on function public.teacher_book_existing_student(uuid, uuid, uuid, time, time) to authenticated;
