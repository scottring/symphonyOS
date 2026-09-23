-- Removing a family member clears them from every assignment, atomically with
-- the delete (review 2026-09-23).
--
-- The app cannot do this itself: RLS hides other household members' PRIVATE
-- tasks, so the remover can neither see nor update them. Verified with two
-- accounts on 2026-09-23 — a hidden private `assigned_to` blocked the delete
-- (FK 23503), and a hidden private `assigned_to_all` entry survived it.
--
-- This BEFORE DELETE trigger runs in the same statement as the delete, so if
-- the delete fails for any reason every change below rolls back with it. It
-- fires only for a delete the family_members RLS policy already allowed.
--
-- It touches ONLY the assignee columns. Titles, notes, ownership (user_id),
-- scope/visibility and placement are left exactly as they were: narrowing who
-- can see an item is an access change, not part of removing a person. Tasks
-- keep their updated_at; routines, event notes and instances bump theirs via
-- their existing updated_at triggers, since their assignment did change.
-- Member-owned history (screen time) still blocks the delete on purpose;
-- that is a separate data decision.

create or replace function public.clear_member_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks set assigned_to = null where assigned_to = old.id;
  update public.tasks set assigned_to_all = array_remove(assigned_to_all, old.id)
    where assigned_to_all @> array[old.id];

  update public.routines set assigned_to = null where assigned_to = old.id;
  update public.routines set assigned_to_all = array_remove(assigned_to_all, old.id)
    where assigned_to_all @> array[old.id];

  update public.event_notes set assigned_to = null where assigned_to = old.id;
  update public.event_notes set assigned_to_all = array_remove(assigned_to_all, old.id)
    where assigned_to_all @> array[old.id];

  update public.actionable_instances set assigned_to_override = null
    where assigned_to_override = old.id;

  return old;
end
$$;

revoke all on function public.clear_member_assignments() from public, anon, authenticated;

drop trigger if exists family_members_clear_assignments on public.family_members;
create trigger family_members_clear_assignments
  before delete on public.family_members
  for each row execute function public.clear_member_assignments();
