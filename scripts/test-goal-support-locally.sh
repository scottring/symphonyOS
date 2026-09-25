#!/usr/bin/env bash
# Run supabase/tests/095_goal_supports_goal.test.sql against a throwaway local
# Postgres, so the trigger in 2026-09-24_goal_supports_goal.sql is proved
# BEFORE anything is applied to the shared database.
#
# The fixture below is the minimum the test touches: the columns of
# public.tasks it writes, household_members, and users_share_household. The
# test file itself is byte-identical to the one that will run against the
# project, so the two cannot drift.
#
#   ./scripts/test-goal-support-locally.sh
#
# Needs a local Postgres 17 (brew install postgresql@17). Nothing here reaches
# Supabase; the cluster is created and destroyed inside the run.
set -euo pipefail

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(mktemp -d)"
PORT=54999
trap '"$PG_BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PG_BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null
psql() { "$PG_BIN/psql" -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres -q "$@"; }

psql <<'SQL'
create schema if not exists public;

-- The shape the test writes, as production has it.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  completed boolean not null default false,
  bucket text not null default 'inbox',
  scope text not null default 'individual',
  is_goal boolean not null default false,
  week_start date,
  month_start date,
  season_start date,
  goal_id uuid,
  goal_task_id uuid references public.tasks(id) on delete set null,
  source_id uuid,
  parent_task_id uuid
);

create table public.household_members (
  household_id uuid not null,
  user_id uuid not null,
  status text not null default 'active'
);

-- Verbatim from the live definition.
create or replace function public.users_share_household(user_a uuid, user_b uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select
    user_a = user_b
    or exists (
      select 1
      from household_members hm_a
      join household_members hm_b on hm_a.household_id = hm_b.household_id
      where hm_a.user_id = user_a
        and hm_b.user_id = user_b
        and hm_a.status = 'active'
        and hm_b.status = 'active'
    );
$function$;

-- The same two households the test's constants name.
insert into public.household_members (household_id, user_id) values
  ('c19dcd92-1d46-406c-a6d7-04e4057af0d8', 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('c19dcd92-1d46-406c-a6d7-04e4057af0d8', '3431facd-dc33-41a1-b42d-f1a375eec505'),
  ('c0c3a96c-5b04-4923-aa0d-a6acaa08686c', '4b8f6412-d067-449e-9c5e-2d31c22f8822');
SQL

echo "— before the migration (the column does not exist) —"
if psql -f supabase/tests/095_goal_supports_goal.test.sql >/dev/null 2>&1; then
  echo "UNEXPECTED: the proof passed without the migration" >&2
  exit 1
fi
echo "the proof fails, as it must"

echo "— applying supabase/migrations/2026-09-24_goal_supports_goal.sql —"
psql -f supabase/migrations/2026-09-24_goal_supports_goal.sql >/dev/null

echo "— after the migration —"
psql -f supabase/tests/095_goal_supports_goal.test.sql
