#!/usr/bin/env bash
# Run supabase/tests/096_planning_commitments.test.sql against a throwaway
# local Postgres loaded with the LIVE schema for tasks / task_commitments /
# task_focus (supabase/tests/fixtures/planning_commitments_schema.sql, read
# from the catalog 2026-09-25: triggers, trigger functions, helpers and RLS
# policies verbatim).
#
# Proves in real Postgres what the client proves with mocks: Keep (carry +
# ensure), Drop (exactly one commitment closed), completion done/reopen, retry
# idempotency, and RLS across households.
#
#   ./scripts/test-planning-commitments-locally.sh
#
# Needs a local Postgres 17 (brew install postgresql@17). Nothing here reaches
# Supabase; the cluster is created and destroyed inside the run.
#
# Fidelity gaps vs production (see the fixture header):
#   - no PostgREST: client calls are transcribed to the SQL PostgREST emits
#     (update … where …; insert … on conflict (…) do update set <payload cols>)
#   - a flow runs in one transaction per contract, not one per HTTP request
#   - FKs to tables outside the fixture are omitted; auth.users is a stub
#   - households / household_members: minimal columns, no RLS
#   - the local superuser owns everything (live: postgres, a non-superuser
#     owner); SECURITY DEFINER functions bypass RLS in both cases
set -euo pipefail

cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(mktemp -d)"
PORT="${PORT:-54998}"
trap '"$PG_BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PG_BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null
psql() { "$PG_BIN/psql" -X -h "$DIR" -p "$PORT" -U postgres -q "$@"; }

psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/planning_commitments_schema.sql >/dev/null

# The three people the test names: two in one household, one in another.
psql -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into auth.users (id) values
  ('f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('3431facd-dc33-41a1-b42d-f1a375eec505'),
  ('4b8f6412-d067-449e-9c5e-2d31c22f8822');
insert into public.households (id, owner_id) values
  ('c19dcd92-1d46-406c-a6d7-04e4057af0d8', 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7'),
  ('c0c3a96c-5b04-4923-aa0d-a6acaa08686c', '4b8f6412-d067-449e-9c5e-2d31c22f8822');
insert into public.household_members (household_id, user_id, status) values
  ('c19dcd92-1d46-406c-a6d7-04e4057af0d8', 'f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7', 'active'),
  ('c19dcd92-1d46-406c-a6d7-04e4057af0d8', '3431facd-dc33-41a1-b42d-f1a375eec505', 'active'),
  ('c0c3a96c-5b04-4923-aa0d-a6acaa08686c', '4b8f6412-d067-449e-9c5e-2d31c22f8822', 'active');
SQL

OUT="$(psql -f supabase/tests/096_planning_commitments.test.sql 2>&1 || true)"
printf '%s\n' "$OUT" | sed -n 's/.*\(PASS [0-9]*:.*\)/\1/p; s/.*ERROR: *\(.*\)/FAIL-> \1/p'

PASSES=$(printf '%s\n' "$OUT" | grep -c 'PASS [0-9]*:' || true)
ERRORS=$(printf '%s\n' "$OUT" | grep -c 'ERROR:' || true)
echo "— $PASSES passed, $ERRORS failed —"
[ "$ERRORS" -eq 0 ]
