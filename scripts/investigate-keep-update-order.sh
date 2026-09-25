#!/usr/bin/env bash
# Investigation: is "commitment ops first, row write last" (the order Drop now
# uses) safe for keepForward and updateTask's placement path? Runs
# supabase/tests/099_keep_update_order.investigation.sql against a throwaway
# local Postgres 17 loaded with the LIVE schema fixture
# (supabase/tests/fixtures/planning_commitments_schema.sql). Write-up:
# docs/planning/2026-09-25-keep-update-order-investigation.md
#
#   ./scripts/investigate-keep-update-order.sh          # SUMMARY / PASS / FAIL lines
#   VERBOSE=1 ./scripts/investigate-keep-update-order.sh # + TRACE / RESULT / OBSERVE lines
#
# Needs a local Postgres 17 (brew install postgresql@17). Nothing here reaches
# Supabase; the cluster is created and destroyed inside the run. Same
# fidelity gaps as scripts/investigate-drop-partial-failure.sh (no PostgREST;
# each request is a subtransaction, not an HTTP transaction).
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

OUT="$(psql -f supabase/tests/099_keep_update_order.investigation.sql 2>&1 || true)"
if [ -n "${VERBOSE:-}" ]; then
  printf '%s\n' "$OUT" | sed -nE 's/.*NOTICE: *((TRACE|RESULT|OBSERVE) .*)/\1/p'
fi
printf '%s\n' "$OUT" | sed -n 's/.*NOTICE: *\(SUMMARY .*\)/\1/p; s/.*NOTICE: *\(PASS .*\)/\1/p; s/.*ERROR: *\(.*\)/FAIL-> \1/p'

PASSES=$(printf '%s\n' "$OUT" | grep -c 'NOTICE: *PASS ' || true)
ERRORS=$(printf '%s\n' "$OUT" | grep -c 'ERROR:' || true)
echo "— $PASSES blocks passed, $ERRORS failed —"
[ "$ERRORS" -eq 0 ]
