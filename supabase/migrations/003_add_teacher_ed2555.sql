-- Add the existing Supabase Auth user as a teacher.
-- The Auth user's app_metadata.role must also be set to "teacher" in Supabase Dashboard.
insert into public.teachers (id, slug, display_name)
values (
  'ed2555d4-d76c-44b4-beb5-c9974e6272b2',
  'teacher-ed2555',
  '老師'
)
on conflict (id) do update
set display_name = excluded.display_name;
