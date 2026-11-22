-- 課間 Between Classes / Supabase PostgreSQL migration
-- Teacher account is intentionally created outside public signup. Set app_metadata.role = 'teacher'.

create extension if not exists pgcrypto;

create type public.registration_status as enum ('pending', 'approved', 'rejected');
create type public.material_plan as enum ('自編', '已有', '購買市售');
create type public.booking_status as enum ('confirmed', 'cancelled');

create table public.teachers (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.student_registrations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  created_at timestamptz not null default now(),
  status public.registration_status not null default 'pending',
  name text not null check (char_length(trim(name)) between 1 and 80),
  grade text not null,
  school text not null,
  focus text not null,
  location text not null,
  phone text not null,
  material public.material_plan not null,
  note text
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  registration_id uuid unique references public.student_registrations(id),
  created_at timestamptz not null default now(),
  name text not null,
  grade text not null,
  school text not null,
  focus text not null,
  location text not null,
  phone text not null,
  material public.material_plan not null,
  tags text[] not null default '{}',
  region text,
  active boolean not null default true
);

create table public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  created_at timestamptz not null default now(),
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  preset_region text,
  open boolean not null default true,
  note text not null default '',
  constraint valid_slot_time check (start_time < end_time)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers(id),
  created_at timestamptz not null default now(),
  slot_id uuid not null references public.availability_slots(id),
  student_id uuid not null references public.students(id),
  start_time time not null,
  end_time time not null,
  region text not null,
  status public.booking_status not null default 'confirmed',
  constraint valid_booking_time check (start_time < end_time)
);

create table public.booking_settings (
  teacher_id uuid primary key references public.teachers(id),
  booking_open timestamptz not null default now(),
  booking_close timestamptz not null default (now() + interval '30 days'),
  tag_options text[] not null default array['天母', '北投', '士林'],
  constraint valid_booking_window check (booking_open < booking_close)
);

create or replace function public.ensure_teacher_settings()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.booking_settings (teacher_id) values (new.id) on conflict (teacher_id) do nothing;
  return new;
end; $$;
create trigger teachers_create_settings after insert on public.teachers for each row execute function public.ensure_teacher_settings();

create index bookings_slot_active_idx on public.bookings(slot_id) where status = 'confirmed';
create index students_teacher_name_active_idx on public.students(teacher_id, name) where active = true;
create index slots_teacher_weekday_open_idx on public.availability_slots(teacher_id, weekday, open);

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'teacher', false) $$;

alter table public.student_registrations enable row level security;
alter table public.teachers enable row level security;
alter table public.students enable row level security;
alter table public.availability_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_settings enable row level security;

create policy registrations_public_insert on public.student_registrations for insert to anon, authenticated with check (status = 'pending' and exists (select 1 from public.teachers t where t.id = teacher_id and t.active));
create policy registrations_teacher_all on public.student_registrations for all to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());
create policy teachers_self_select on public.teachers for select to authenticated using (public.is_teacher() and id = auth.uid());
create policy students_teacher_all on public.students for all to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());
create policy slots_teacher_all on public.availability_slots for all to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());
create policy bookings_teacher_all on public.bookings for all to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());
create policy settings_teacher_all on public.booking_settings for all to authenticated using (public.is_teacher() and teacher_id = auth.uid()) with check (public.is_teacher() and teacher_id = auth.uid());

revoke all on public.teachers, public.student_registrations, public.students, public.availability_slots, public.bookings, public.booking_settings from anon, authenticated;
grant insert on public.student_registrations to anon, authenticated;
grant select on public.teachers to authenticated;
grant select on public.student_registrations, public.students, public.availability_slots, public.bookings, public.booking_settings to authenticated;
grant update on public.student_registrations, public.students, public.availability_slots, public.booking_settings to authenticated;
grant insert on public.availability_slots to authenticated;
grant execute on function public.is_teacher() to anon, authenticated;

create or replace function public.public_teacher_by_slug(p_slug text)
returns table(id uuid, slug text, display_name text)
language sql stable security definer set search_path = public
as $$ select t.id, t.slug, t.display_name from public.teachers t where t.slug = p_slug and t.active $$;
grant execute on function public.public_teacher_by_slug(text) to anon, authenticated;

-- Public lookup intentionally returns only an opaque id, name, region and last three digits.
create or replace function public.public_lookup_students(p_name text, p_teacher_id uuid)
returns table(id uuid, name text, phone_suffix text, region text)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, right(regexp_replace(s.phone, '\D', '', 'g'), 3), s.region
  from public.students s
  where s.active and s.teacher_id = p_teacher_id and s.region is not null and trim(s.name) = trim(p_name)
  order by s.created_at;
$$;
grant execute on function public.public_lookup_students(text, uuid) to anon, authenticated;

-- Public availability is calculated server-side. No student, phone or booking row is exposed.
create or replace function public.public_student_availability(p_student_id uuid, p_teacher_id uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  target_region text;
  target_teacher uuid;
  booking_open timestamptz;
  booking_close timestamptz;
  slot_row record;
  effective_region text;
  cursor_time time;
  booking_row record;
  segments jsonb := '[]'::jsonb;
begin
  select s.region, s.teacher_id into target_region, target_teacher from public.students s where s.id = p_student_id and s.teacher_id = p_teacher_id and s.active;
  if target_region is null then return; end if;
  select bs.booking_open, bs.booking_close into booking_open, booking_close from public.booking_settings bs where bs.teacher_id = p_teacher_id;
  if now() < booking_open or now() > booking_close then return; end if;
  for slot_row in select * from public.availability_slots where teacher_id = p_teacher_id and open order by weekday, start_time loop
    select coalesce(slot_row.preset_region, min(b.region)) into effective_region
    from public.bookings b where b.teacher_id = p_teacher_id and b.slot_id = slot_row.id and b.status = 'confirmed';
    if effective_region is not null and effective_region <> target_region then continue; end if;
    cursor_time := slot_row.start_time;
    segments := '[]'::jsonb;
    for booking_row in select start_time, end_time from public.bookings where teacher_id = p_teacher_id and slot_id = slot_row.id and status = 'confirmed' order by start_time loop
      if booking_row.start_time > cursor_time and booking_row.start_time - cursor_time > interval '30 minutes' then
        segments := segments || jsonb_build_array(jsonb_build_object('start', to_char(cursor_time, 'HH24:MI'), 'end', to_char(booking_row.start_time, 'HH24:MI')));
      end if;
      if booking_row.end_time > cursor_time then cursor_time := booking_row.end_time; end if;
    end loop;
    if cursor_time < slot_row.end_time and slot_row.end_time - cursor_time > interval '30 minutes' then
      segments := segments || jsonb_build_array(jsonb_build_object('start', to_char(cursor_time, 'HH24:MI'), 'end', to_char(slot_row.end_time, 'HH24:MI')));
    end if;
    if jsonb_array_length(segments) > 0 then
      return next jsonb_build_object('id', slot_row.id, 'weekday', slot_row.weekday, 'start', to_char(slot_row.start_time, 'HH24:MI'), 'end', to_char(slot_row.end_time, 'HH24:MI'), 'presetRegion', slot_row.preset_region, 'dynamicRegion', case when slot_row.preset_region is null then effective_region else null end, 'effectiveRegion', effective_region, 'open', slot_row.open, 'note', slot_row.note, 'segments', segments);
    end if;
  end loop;
end;
$function$;
grant execute on function public.public_student_availability(uuid, uuid) to anon, authenticated;

-- Public teacher schedule: exposes only current open gaps, never student or booking rows.
create or replace function public.public_teacher_availability(p_teacher_id uuid)
returns setof jsonb
language plpgsql stable security definer set search_path = public
as $function$
declare
  slot_row record;
  effective_region text;
  cursor_time time;
  booking_row record;
  segments jsonb := '[]'::jsonb;
begin
  for slot_row in select * from public.availability_slots where teacher_id = p_teacher_id and open order by weekday, start_time loop
    select coalesce(slot_row.preset_region, min(b.region)) into effective_region
    from public.bookings b where b.teacher_id = p_teacher_id and b.slot_id = slot_row.id and b.status = 'confirmed';
    cursor_time := slot_row.start_time;
    segments := '[]'::jsonb;
    for booking_row in select start_time, end_time from public.bookings where teacher_id = p_teacher_id and slot_id = slot_row.id and status = 'confirmed' order by start_time loop
      if booking_row.start_time > cursor_time and booking_row.start_time - cursor_time > interval '30 minutes' then
        segments := segments || jsonb_build_array(jsonb_build_object('start', to_char(cursor_time, 'HH24:MI'), 'end', to_char(booking_row.start_time, 'HH24:MI')));
      end if;
      if booking_row.end_time > cursor_time then cursor_time := booking_row.end_time; end if;
    end loop;
    if cursor_time < slot_row.end_time and slot_row.end_time - cursor_time > interval '30 minutes' then
      segments := segments || jsonb_build_array(jsonb_build_object('start', to_char(cursor_time, 'HH24:MI'), 'end', to_char(slot_row.end_time, 'HH24:MI')));
    end if;
    if jsonb_array_length(segments) > 0 then
      return next jsonb_build_object('id', slot_row.id, 'weekday', slot_row.weekday, 'start', to_char(slot_row.start_time, 'HH24:MI'), 'end', to_char(slot_row.end_time, 'HH24:MI'), 'presetRegion', slot_row.preset_region, 'dynamicRegion', case when slot_row.preset_region is null then effective_region else null end, 'effectiveRegion', effective_region, 'open', slot_row.open, 'note', slot_row.note, 'segments', segments);
    end if;
  end loop;
end;
$function$;
grant execute on function public.public_teacher_availability(uuid) to anon, authenticated;

create or replace function public.public_booking_window_open(p_teacher_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.booking_settings
    where teacher_id = p_teacher_id and now() between booking_open and booking_close
  );
$$;
grant execute on function public.public_booking_window_open(uuid) to anon, authenticated;

-- Rename a teacher-managed location and keep existing students, slots and bookings consistent.
create or replace function public.rename_location_label(p_teacher_id uuid, p_old_label text, p_new_label text)
returns void
language plpgsql security definer set search_path = public
as $function$
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  if trim(p_old_label) = '' or trim(p_new_label) = '' or trim(p_old_label) = trim(p_new_label) then return; end if;
  update public.students set region = trim(p_new_label) where teacher_id = p_teacher_id and region = trim(p_old_label);
  update public.availability_slots set preset_region = trim(p_new_label) where teacher_id = p_teacher_id and preset_region = trim(p_old_label);
  update public.bookings set region = trim(p_new_label) where teacher_id = p_teacher_id and region = trim(p_old_label);
  update public.booking_settings set tag_options = array_replace(tag_options, trim(p_old_label), trim(p_new_label)) where teacher_id = p_teacher_id;
end;
$function$;
grant execute on function public.rename_location_label(uuid, text, text) to authenticated;

-- Each selection locks its original slot before checking time, region and booking window.
-- Therefore two regions racing for one original slot cannot create divergent region locks.
create or replace function public.book_slots_atomic(p_student_id uuid, p_teacher_id uuid, p_selections jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  target_region text;
  booking_open timestamptz;
  booking_close timestamptz;
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
  select region into target_region from public.students where id = p_student_id and teacher_id = p_teacher_id and active;
  if target_region is null then raise exception 'student_not_ready'; end if;
  select booking_open, booking_close into booking_open, booking_close from public.booking_settings where teacher_id = p_teacher_id;
  if now() < booking_open or now() > booking_close then raise exception 'booking_closed'; end if;
  for selection in select * from jsonb_array_elements(p_selections) loop
    select * into slot_row from public.availability_slots where id = (selection->>'slotId')::uuid and teacher_id = p_teacher_id for update;
    if not found or not slot_row.open then rejected := rejected || jsonb_build_array(selection); continue; end if;
    requested_start := (selection->>'start')::time;
    requested_end := (selection->>'end')::time;
    if requested_start >= requested_end or requested_start < slot_row.start_time or requested_end > slot_row.end_time then rejected := rejected || jsonb_build_array(selection); continue; end if;
    select coalesce(slot_row.preset_region, min(region)) into effective_region from public.bookings where teacher_id = p_teacher_id and slot_id = slot_row.id and status = 'confirmed';
    if effective_region is not null and effective_region <> target_region then rejected := rejected || jsonb_build_array(selection); continue; end if;
    gap_valid := false;
    cursor_time := slot_row.start_time;
    for booking_row in select start_time, end_time from public.bookings where teacher_id = p_teacher_id and slot_id = slot_row.id and status = 'confirmed' order by start_time loop
      if requested_start >= cursor_time and requested_end <= booking_row.start_time and booking_row.start_time - cursor_time > interval '30 minutes' then gap_valid := true; end if;
      if booking_row.end_time > cursor_time then cursor_time := booking_row.end_time; end if;
    end loop;
    if requested_start >= cursor_time and requested_end <= slot_row.end_time and slot_row.end_time - cursor_time > interval '30 minutes' then gap_valid := true; end if;
    if not gap_valid then rejected := rejected || jsonb_build_array(selection); continue; end if;
    select exists (select 1 from public.bookings where teacher_id = p_teacher_id and slot_id = slot_row.id and status = 'confirmed' and requested_start < end_time and requested_end > start_time) into conflict_found;
    if conflict_found then rejected := rejected || jsonb_build_array(selection); continue; end if;
    insert into public.bookings (teacher_id, slot_id, student_id, start_time, end_time, region) values (p_teacher_id, slot_row.id, p_student_id, requested_start, requested_end, target_region) returning id into booking_id;
    created := created || jsonb_build_array(jsonb_build_object('id', booking_id, 'slotId', slot_row.id, 'studentId', p_student_id, 'region', target_region, 'start', to_char(requested_start, 'HH24:MI'), 'end', to_char(requested_end, 'HH24:MI'), 'status', 'confirmed'));
  end loop;
  return jsonb_build_object('bookings', created, 'rejected', rejected);
end;
$function$;
grant execute on function public.book_slots_atomic(uuid, uuid, jsonb) to anon, authenticated;

create or replace function public.approve_registration(p_registration_id uuid, p_teacher_id uuid)
returns public.students
language plpgsql security definer set search_path = public
as $function$
declare result public.students;
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  with updated as (update public.student_registrations set status = 'approved' where id = p_registration_id and teacher_id = p_teacher_id and status = 'pending' returning *)
  insert into public.students (teacher_id, registration_id, name, grade, school, focus, location, phone, material)
  select teacher_id, id, name, grade, school, focus, location, phone, material from updated
  returning * into result;
  if result.id is null then raise exception 'registration_not_found'; end if;
  return result;
end;
$function$;
grant execute on function public.approve_registration(uuid, uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid, p_teacher_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  update public.bookings set status = 'cancelled' where id = p_booking_id and teacher_id = p_teacher_id;
end;
$$;
grant execute on function public.cancel_booking(uuid, uuid) to authenticated;

create or replace function public.update_booking_time_atomic(p_booking_id uuid, p_teacher_id uuid, p_start time, p_end time)
returns public.bookings
language plpgsql security definer set search_path = public
as $function$
declare
  target public.bookings;
  slot_row public.availability_slots;
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  select * into target from public.bookings where id = p_booking_id and teacher_id = p_teacher_id and status = 'confirmed' for update;
  if target.id is null then raise exception 'booking_not_found'; end if;
  select * into slot_row from public.availability_slots where id = target.slot_id and teacher_id = p_teacher_id for update;
  if slot_row.id is null or p_start >= p_end or p_start < slot_row.start_time or p_end > slot_row.end_time then raise exception 'invalid_booking_time'; end if;
  if exists (select 1 from public.bookings where slot_id = target.slot_id and teacher_id = p_teacher_id and status = 'confirmed' and id <> p_booking_id and p_start < end_time and p_end > start_time) then raise exception 'booking_conflict'; end if;
  update public.bookings set start_time = p_start, end_time = p_end where id = p_booking_id and teacher_id = p_teacher_id returning * into target;
  return target;
end;
$function$;
grant execute on function public.update_booking_time_atomic(uuid, uuid, time, time) to authenticated;

create or replace function public.delete_student(p_student_id uuid, p_teacher_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  delete from public.bookings where student_id = p_student_id and teacher_id = p_teacher_id;
  delete from public.students where id = p_student_id and teacher_id = p_teacher_id;
end;
$$;
grant execute on function public.delete_student(uuid, uuid) to authenticated;

create or replace function public.delete_slot(p_slot_id uuid, p_teacher_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_teacher() or auth.uid() <> p_teacher_id then raise exception 'teacher_only'; end if;
  delete from public.bookings where slot_id = p_slot_id and teacher_id = p_teacher_id;
  delete from public.availability_slots where id = p_slot_id and teacher_id = p_teacher_id;
end;
$$;
grant execute on function public.delete_slot(uuid, uuid) to authenticated;
