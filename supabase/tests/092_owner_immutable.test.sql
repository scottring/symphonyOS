-- 092_owner_immutable.test.sql
-- Live two-account proof for supabase/migrations/2026-09-21_owner_immutable.sql.
--
-- Runs as postgres (Management API or the Supabase MCP execute_sql), switches
-- to the `authenticated` role with a fake JWT via set_config, so auth.uid()
-- and RLS genuinely apply, and ends in ROLLBACK so production keeps zero rows.
-- A failed assertion raises; a clean run ends with one NOTICE.
--
-- Accounts are the real household: Scott (owner) and Iris (member) in
-- household_members. Swap the uuids if the household ever changes.
--
-- Before the migration, the "REJECTED?" assertions fail — that is the proof of
-- the gap. After it, every assertion passes.

begin;

do $$
declare
  scott   constant uuid := 'bace953e-87ea-4a59-b7d7-f476fa0e8c94';
  iris    constant uuid := 'ae1c98b7-63df-4373-8835-dfad7d7cce2c';
  shared  uuid := gen_random_uuid();   -- Scott's, compound
  private uuid := gen_random_uuid();   -- Scott's, individual
  mine    uuid := gen_random_uuid();   -- Iris's, individual
  row_id  uuid;
  n       int;
  caught  bool;
  t       text;
begin
  insert into public.tasks (id, user_id, title, scope) values
    (shared,  scott, 'owner-immutable proof: shared',  'compound'),
    (private, scott, 'owner-immutable proof: private', 'individual'),
    (mine,    iris,  'owner-immutable proof: mine',    'individual');

  -- ---- act as Iris ------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', iris, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- control legs: the shared row IS visible, the private one is not
  select count(*) into n from public.tasks where id = shared;
  assert n = 1, 'control: Iris cannot see the shared row';
  select count(*) into n from public.tasks where id = private;
  assert n = 0, 'control: Iris can see a private row';

  -- permitted household edits on the shared row
  update public.tasks set completed = true, title = 'owner-immutable proof: shared (done)' where id = shared;
  get diagnostics n = row_count;
  assert n = 1, 'permitted: Iris could not complete the shared row';
  update public.tasks set scope = 'couple' where id = shared;
  get diagnostics n = row_count;
  assert n = 1, 'permitted: Iris could not narrow compound to couple';

  -- rejected: taking ownership
  caught := false;
  begin
    update public.tasks set user_id = iris where id = shared;
  exception when insufficient_privilege then caught := true;
  end;
  assert caught, 'REJECTED?: Iris took ownership of the shared row';

  -- rejected: the original theft — ownership and privacy in one write
  caught := false;
  begin
    update public.tasks set user_id = iris, scope = 'individual' where id = shared;
  exception when insufficient_privilege then caught := true;
  end;
  assert caught, 'REJECTED?: Iris took the shared row private';

  -- rejected: making someone else's shared row private, owner untouched
  caught := false;
  begin
    update public.tasks set scope = 'individual' where id = shared;
  exception when insufficient_privilege then caught := true;
  end;
  assert caught, 'REJECTED?: Iris made Scott''s shared row private';

  -- rejected: handing her own row to Scott (owner is immutable for everyone signed in)
  caught := false;
  begin
    update public.tasks set user_id = scott where id = mine;
  exception when insufficient_privilege then caught := true;
  end;
  assert caught, 'REJECTED?: Iris changed the owner of her own row';

  -- permitted: her own row's privacy is hers to set, both directions
  update public.tasks set scope = 'compound' where id = mine;
  get diagnostics n = row_count;
  assert n = 1, 'permitted: Iris could not share her own row';
  update public.tasks set scope = 'individual' where id = mine;
  get diagnostics n = row_count;
  assert n = 1, 'permitted: Iris could not make her own row private again';

  -- Scott's private row is out of reach entirely: no error, zero rows
  update public.tasks set title = 'x' where id = private;
  get diagnostics n = row_count;
  assert n = 0, 'Iris updated a private row of Scott''s';

  -- ---- act as Scott -----------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', scott, 'role', 'authenticated')::text, true);
  select count(*) into n from public.tasks
    where id = shared and user_id = scott and completed and scope = 'couple';
  assert n = 1, 'Scott lost the shared row, or Iris''s permitted edit did not land';

  execute 'set local role postgres';

  -- ---- siblings: same guard, same explicit WITH CHECK, same rejection ---
  foreach t in array array['routines', 'notes', 'projects', 'contacts', 'goals'] loop
    row_id := gen_random_uuid();
    execute format(
      'insert into public.%I (id, user_id, %I, scope) values ($1, $2, $3, ''compound'')',
      t, case when t = 'notes' then 'content' else 'name' end
    ) using row_id, scott, 'owner-immutable proof';

    perform 1 from pg_trigger
      where tgrelid = ('public.' || t)::regclass and tgname = t || '_guard_owner';
    assert found, format('%s: guard trigger missing', t);
    select with_check is not null into caught from pg_policies
      where schemaname = 'public' and tablename = t and cmd = 'UPDATE';
    assert caught, format('%s: UPDATE policy has no explicit WITH CHECK', t);

    perform set_config('request.jwt.claims', json_build_object('sub', iris, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    caught := false;
    begin
      execute format('update public.%I set user_id = $1, scope = ''individual'' where id = $2', t)
        using iris, row_id;
    exception when insufficient_privilege then caught := true;
    end;
    assert caught, format('REJECTED?: %s: Iris took a shared row private', t);
    execute 'set local role postgres';
  end loop;

  raise notice 'owner_immutable: all checks passed';
end
$$;

rollback;
