-- Fix PL/pgSQL variable/column name collisions in the parent booking RPC.
-- The previous function declared booking_open/booking_close and also selected
-- unqualified columns with the same names, which caused PostgreSQL 42702.

create or replace function public.book_slots_atomic(p_student_id uuid, p_teacher_id uuid, p_selections jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  target_region text;
  v_booking_open timestamptz;
  v_booking_close timestamptz;
  selection jsonb;
  slot_row public.availability_slots%rowtype;
  effective_region text;
  requested_start time;
  requested_end time;
  conflict_found boolean;
  gap_valid boolean;
  cursor_time time;
  booking_row record;
  created jsonb := '[]'::jsonb;
  rejected jsonb := '[]'::jsonb;
  booking_id uuid;
begin
  select s.region
    into target_region
    from public.students s
   where s.id = p_student_id and s.teacher_id = p_teacher_id and s.active;
  if target_region is null then raise exception 'student_not_ready'; end if;

  select bs.booking_open, bs.booking_close
    into v_booking_open, v_booking_close
    from public.booking_settings bs
   where bs.teacher_id = p_teacher_id;
  if now() < v_booking_open or now() > v_booking_close then raise exception 'booking_closed'; end if;

  for selection in select value from jsonb_array_elements(p_selections) loop
    select *
      into slot_row
      from public.availability_slots s
     where s.id = (selection->>'slotId')::uuid
       and s.teacher_id = p_teacher_id
     for update;
    if not found or not slot_row.open then
      rejected := rejected || jsonb_build_array(selection);
      continue;
    end if;

    requested_start := (selection->>'start')::time;
    requested_end := (selection->>'end')::time;
    if requested_start >= requested_end
       or requested_start < slot_row.start_time
       or requested_end > slot_row.end_time then
      rejected := rejected || jsonb_build_array(selection);
      continue;
    end if;

    select coalesce(slot_row.preset_region, min(b.region))
      into effective_region
      from public.bookings b
     where b.teacher_id = p_teacher_id
       and b.slot_id = slot_row.id
       and b.status = 'confirmed';
    if effective_region is not null and effective_region <> target_region then
      rejected := rejected || jsonb_build_array(selection);
      continue;
    end if;

    gap_valid := false;
    cursor_time := slot_row.start_time;
    for booking_row in
      select b.start_time, b.end_time
        from public.bookings b
       where b.teacher_id = p_teacher_id
         and b.slot_id = slot_row.id
         and b.status = 'confirmed'
       order by b.start_time
    loop
      if requested_start >= cursor_time
         and requested_end <= booking_row.start_time
         and booking_row.start_time - cursor_time > interval '30 minutes' then
        gap_valid := true;
      end if;
      if booking_row.end_time > cursor_time then cursor_time := booking_row.end_time; end if;
    end loop;
    if requested_start >= cursor_time
       and requested_end <= slot_row.end_time
       and slot_row.end_time - cursor_time > interval '30 minutes' then
      gap_valid := true;
    end if;
    if not gap_valid then
      rejected := rejected || jsonb_build_array(selection);
      continue;
    end if;

    select exists (
      select 1
        from public.bookings b
       where b.teacher_id = p_teacher_id
         and b.slot_id = slot_row.id
         and b.status = 'confirmed'
         and requested_start < b.end_time
         and requested_end > b.start_time
    ) into conflict_found;
    if conflict_found then
      rejected := rejected || jsonb_build_array(selection);
      continue;
    end if;

    insert into public.bookings (teacher_id, slot_id, student_id, start_time, end_time, region)
    values (p_teacher_id, slot_row.id, p_student_id, requested_start, requested_end, target_region)
    returning id into booking_id;
    created := created || jsonb_build_array(jsonb_build_object(
      'id', booking_id,
      'slotId', slot_row.id,
      'studentId', p_student_id,
      'region', target_region,
      'start', to_char(requested_start, 'HH24:MI'),
      'end', to_char(requested_end, 'HH24:MI'),
      'status', 'confirmed'
    ));
  end loop;
  return jsonb_build_object('bookings', created, 'rejected', rejected);
end;
$function$;
grant execute on function public.book_slots_atomic(uuid, uuid, jsonb) to anon, authenticated;

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
  if exists (
    select 1
      from public.booking_settings bs
     where bs.teacher_id = p_teacher_id
       and now() <= bs.booking_close
  ) then
    raise exception 'booking_still_open';
  end if;

  select * into student_row
    from public.students s
   where s.id = p_student_id and s.teacher_id = p_teacher_id and s.active
   for update;
  if student_row.id is null or student_row.region is null then raise exception 'student_not_ready'; end if;

  select * into slot_row
    from public.availability_slots s
   where s.id = p_slot_id and s.teacher_id = p_teacher_id and s.open
   for update;
  if slot_row.id is null or p_start >= p_end or p_start < slot_row.start_time or p_end > slot_row.end_time then
    raise exception 'invalid_booking_time';
  end if;

  select coalesce(slot_row.preset_region, min(b.region))
    into effective_region
    from public.bookings b
   where b.teacher_id = p_teacher_id and b.slot_id = p_slot_id and b.status = 'confirmed';
  if effective_region is not null and effective_region <> student_row.region then raise exception 'region_locked'; end if;

  cursor_time := slot_row.start_time;
  for scan_row in
    select b.start_time, b.end_time
      from public.bookings b
     where b.teacher_id = p_teacher_id and b.slot_id = p_slot_id and b.status = 'confirmed'
     order by b.start_time
  loop
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
