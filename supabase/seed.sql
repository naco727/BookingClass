-- Optional local seed. Supabase Auth teacher users should use the same ids and app_metadata.role = 'teacher'.
insert into public.teachers (id, slug, display_name)
values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'lin', '林老師'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'chen', '陳老師')
on conflict (id) do nothing;

insert into public.students (id, teacher_id, name, grade, school, focus, location, phone, material, region, tags)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '陳昀安', '國二', '蘭雅國中', '數學、理化', '天母住家', '0911-222-333', '自編', '天母', array['數學', '固定週課']),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '陳昀安', '國一', '北投國中', '英文閱讀', '北投住家', '0922-444-555', '已有', '北投', array['英文', '需帶講義']),
  ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '王子謙', '國三', '天母國中', '會考總複習', '天母住家', '0933-666-777', '購買市售', '天母', array['會考', '重點追蹤'])
on conflict (id) do nothing;

insert into public.availability_slots (id, teacher_id, weekday, start_time, end_time, preset_region, open, note)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 1, '12:00', '17:00', null, true, '週一下午長時段'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 1, '18:00', '21:00', '北投', true, '週一晚間指定北投'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 6, '09:00', '12:00', null, true, '週六早上'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 6, '14:00', '17:00', '天母', true, '週六午後指定天母')
on conflict (id) do nothing;

insert into public.bookings (id, teacher_id, slot_id, student_id, start_time, end_time, region)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '14:00', '16:00', '天母')
on conflict (id) do nothing;
