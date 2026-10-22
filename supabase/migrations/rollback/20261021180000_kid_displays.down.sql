-- Rollback of 20261021180000_kid_displays.sql: displays go back to reading
-- only, pairing goes back to one argument, and the kids' thoughts go.

drop table if exists public.kid_thoughts;
drop function if exists public.display_set_task_done(uuid, boolean);
drop function if exists public.display_set_routine_done(uuid, date, boolean, integer);
drop function if exists public.my_display();
drop function if exists public.my_display_member();

create or replace function public.refuse_display_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.is_display() then
    raise exception 'A display cannot change %', tg_table_name using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop function if exists public.create_display_pairing_code(text, uuid, text);
-- Re-run the create_display_pairing_code and claim_display_pairing bodies
-- from 20261015100000_household_displays.sql, then:
alter table public.display_pairing_codes drop column if exists family_member_id, drop column if exists layout;
alter table public.household_displays drop column if exists family_member_id, drop column if exists layout;

notify pgrst, 'reload schema';
