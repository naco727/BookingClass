-- Allow an authenticated teacher to save only their own profile and booking settings.
-- RLS remains the tenant boundary; these table grants are required before the
-- policy can be evaluated by PostgREST.
grant update on public.teachers to authenticated;
grant insert on public.booking_settings to authenticated;

drop policy if exists teachers_self_update on public.teachers;
create policy teachers_self_update
on public.teachers
for update
to authenticated
using (public.is_teacher() and id = auth.uid())
with check (public.is_teacher() and id = auth.uid());
