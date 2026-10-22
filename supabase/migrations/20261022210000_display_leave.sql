-- A kid's tablet (or the kitchen wall) leaves display mode from the device
-- itself: a grown-up holds the clock, answers the question, and taps "Leave
-- kid mode". The display unpairs itself exactly as a revoke from Settings
-- would; it can do nothing else to the household.
begin;

create or replace function public.display_leave()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if not public.is_display() then raise exception 'Only a paired display can leave'; end if;
  update public.household_displays set revoked_at = now() where user_id = me and revoked_at is null;
  delete from public.household_members where user_id = me and role = 'display';
  return jsonb_build_object('left', true);
end $$;
revoke all on function public.display_leave() from public, anon;
grant execute on function public.display_leave() to authenticated;

commit;
