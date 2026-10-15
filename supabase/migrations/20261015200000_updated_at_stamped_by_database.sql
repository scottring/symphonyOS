-- updated_at is stamped by the database, not trusted to the client
-- (2026-10-15). The change card's stale check and Undo's conflict check
-- compare a row's updated_at with the stamp Symphony saw; an edit made through
-- a path that did not set updated_at (a direct REST patch, another client) was
-- invisible to both. Now every update bumps it.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['tasks', 'routines', 'goals', 'notes', 'contacts', 'lists', 'list_items'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'updated_at') then
      execute format('drop trigger if exists touch_updated_at on public.%I', t);
      execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    end if;
  end loop;
end $$;
