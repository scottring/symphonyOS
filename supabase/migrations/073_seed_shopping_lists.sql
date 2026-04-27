-- 073_seed_shopping_lists.sql
-- Seeds Scott's two shopping lists used by the Apple Reminders bridge.
-- Idempotent: re-running this migration is a no-op once the lists exist.

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'smkaufman@gmail.com';
  if v_user_id is null then
    raise notice 'seed_shopping_lists: no user found for smkaufman@gmail.com — skipping';
    return;
  end if;

  insert into lists (user_id, title, icon, category, visibility, external_id, external_source)
  select v_user_id, 'Groceries', '🛒', 'shopping', 'family', 'Groceries', 'apple_reminders'
  where not exists (
    select 1 from lists
    where external_source = 'apple_reminders' and external_id = 'Groceries'
  );

  insert into lists (user_id, title, icon, category, visibility, external_id, external_source)
  select v_user_id, 'Need now', '⚡', 'shopping', 'family', 'Need now', 'apple_reminders'
  where not exists (
    select 1 from lists
    where external_source = 'apple_reminders' and external_id = 'Need now'
  );
end$$;
