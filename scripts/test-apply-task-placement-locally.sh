#!/usr/bin/env bash
# Prove public.apply_task_placement in real Postgres, locally.
#
# Loads the LIVE-schema fixture (supabase/tests/fixtures/planning_commitments_schema.sql),
# then the migration file ITSELF, byte for byte
# (supabase/migrations/2026-09-25_apply_task_placement.sql, prepared for
# review, NOT applied anywhere shared), then runs
# supabase/tests/100_apply_task_placement.test.sql and the multi-session
# checks below (top-level rollback, lost-response retry, concurrency), each in
# its own psql process.
#
#   ./scripts/test-apply-task-placement-locally.sh           # PASS / OBSERVE / FAIL lines + totals
#   VERBOSE=1 ./scripts/test-apply-task-placement-locally.sh # full psql output
#
# Needs a local Postgres 17 (brew install postgresql@17). Nothing here reaches
# Supabase; the cluster is created and destroyed inside the run.
#
# Fidelity gaps vs production:
#   - no PostgREST. A POST /rpc runs the call in one transaction and rolls it
#     back when the function raises; here that is modelled by a top-level
#     BEGIN … COMMIT in its own psql session (section A) and by subtransactions
#     in the .sql file. That PostgREST does exactly this is [inferred], not run.
#   - fixture gaps (see its header): FKs outside the fixture omitted,
#     auth.users a stub, households without RLS, the local superuser owns
#     everything.
#   - Supabase's default privileges (functions in public get EXECUTE for anon,
#     authenticated, service_role) are simulated below so the migration's
#     explicit REVOKE from anon is actually tested.
set -euo pipefail

cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(mktemp -d)"
PORT="${PORT:-54996}"
MIGRATION=supabase/migrations/2026-09-25_apply_task_placement.sql
trap '"$PG_BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT

"$PG_BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null
psql() { "$PG_BIN/psql" -X -h "$DIR" -p "$PORT" -U postgres -q "$@"; }
q() { psql -At -v ON_ERROR_STOP=1 -c "$1"; }

psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/planning_commitments_schema.sql >/dev/null

# TEST-ONLY, simulating Supabase: default EXECUTE on new public functions.
psql -v ON_ERROR_STOP=1 -c "alter default privileges in schema public grant all on functions to anon, authenticated, service_role;" >/dev/null

psql -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null
echo "loaded $MIGRATION (sha256 $(shasum -a 256 "$MIGRATION" | cut -c1-12))"

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

OUT="$(psql -f supabase/tests/100_apply_task_placement.test.sql 2>&1 || true)"
if [ -n "${VERBOSE:-}" ]; then printf '%s\n' "$OUT"; fi
REPORT="$(printf '%s\n' "$OUT" | sed -n 's/.*NOTICE: *\(PASS .*\)/\1/p; s/.*NOTICE: *\(OBSERVE .*\)/\1/p; s/.*ERROR: *\(.*\)/FAIL-> \1/p')"
FAILS=$(printf '%s\n' "$OUT" | grep -c 'ERROR:' || true)

pass() { REPORT="$REPORT"$'\n'"PASS $1"; echo "PASS $1"; }
fail() { REPORT="$REPORT"$'\n'"FAIL-> $1"; echo "FAIL-> $1"; FAILS=$((FAILS + 1)); }
printf '%s\n' "$REPORT"

# Multi-session helpers (committed; the fault triggers from the .sql file stay armed-off).
q "create function apt.timed(t uuid, steps jsonb) returns int language plpgsql as \$\$
   declare t0 timestamptz := clock_timestamp();
   begin perform public.apply_task_placement(t, steps); return (extract(epoch from clock_timestamp() - t0) * 1000)::int; end \$\$;
   create table apt.saved (k text primary key, v jsonb);" >/dev/null
STEPS() { q "select steps from apt.scenarios where name = '$1'"; }
LETGO_B='[{"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}},{"t":"remove","level":"week","period_start":"2026-09-27"},{"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}}]'

# ── A. Top-level rollback: a fault mid-call in a real transaction ────────────
for pos in 1 3 5; do
  T=$(q "select apt.setup('week+month+focus')")
  q "insert into apt.saved values ('A$pos', apt.exact('$T'))" >/dev/null
  if psql -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
begin;
select apt.act_as('alex');
select apt.arm($pos);
select public.apply_task_placement('$T', (select steps from apt.scenarios where name = 'letgo'));
commit;
SQL
  then fail "rollback-toplevel $pos: the faulted call committed"
  elif [ "$(q "select apt.exact('$T') = v from apt.saved where k = 'A$pos'")" = "t" ]; then
    pass "rollback 8.$pos: top-level transaction, fault at write $pos of let-go → session errors, nothing committed"
  else fail "rollback-toplevel $pos: state changed"; fi
done

# ── B. Lost response: call commits, client retries in a NEW session ──────────
for sc in drop keep day letgo push clear; do
  ACTOR=$(q "select actor from apt.scenarios where name = '$sc'")
  START=$(q "select start from apt.scenarios where name = '$sc'")
  T=$(q "select apt.setup('$START')"); TW=$(q "select apt.setup('$START')")
  S=$(STEPS "$sc")
  CALL="begin; select apt.act_as('$ACTOR'); select public.apply_task_placement('%s', '$S'); commit;"
  psql -v ON_ERROR_STOP=1 -c "$(printf "$CALL" "$T")" >/dev/null   # response lost
  psql -v ON_ERROR_STOP=1 -c "$(printf "$CALL" "$T")" >/dev/null   # retry
  psql -v ON_ERROR_STOP=1 -c "$(printf "$CALL" "$TW")" >/dev/null  # one clean call
  SAME=$(q "select apt.norm('$T') = apt.norm('$TW')")
  COUNTS=$(q "select (select count(*) from task_commitments where task_id = '$T') || ' records, ' || (select count(*) from task_focus where task_id = '$T') || ' focus, ' || apt.events('$T') || ' events (single call: ' || apt.events('$TW') || ')'")
  if [ "$SAME" = "t" ]; then pass "retry 7.$sc: lost response + retry in a new session = one call, events included — $COUNTS"
  else fail "retry lost-response $sc: $(q "select apt.norm('$T')") vs $(q "select apt.norm('$TW')")"; fi
done

# ── C. Concurrency, same task: A holds the row lock, B waits ────────────────
KEEP=$(STEPS keep)
C=$(q "select apt.setup('week')"); CT=$(q "select apt.setup('week')")
psql -v ON_ERROR_STOP=1 >/dev/null <<SQL &
begin;
select apt.act_as('partner');
select public.apply_task_placement('$C', '$KEEP');
select pg_sleep(2);
commit;
SQL
PID_A=$!
B_MS=$(psql -At -v ON_ERROR_STOP=1 <<SQL | tail -1
select pg_sleep(0.5);
begin;
select apt.act_as('alex');
select apt.timed('$C', '$LETGO_B');
commit;
SQL
)
wait $PID_A
# The serial order A then B, on the twin, in separate transactions.
psql -v ON_ERROR_STOP=1 -c "begin; select apt.act_as('partner'); select public.apply_task_placement('$CT', '$KEEP'); commit;" >/dev/null
psql -v ON_ERROR_STOP=1 -c "begin; select apt.act_as('alex'); select public.apply_task_placement('$CT', '$LETGO_B'); commit;" >/dev/null
if [ "${B_MS:-0}" -ge 1200 ]; then pass "concurrency 1: B on the same task waited ${B_MS} ms for A's lock (A held it ~1.5 s after B started)"
else fail "concurrency: B did not wait (${B_MS:-?} ms)"; fi
if [ "$(q "select apt.norm('$C') = apt.norm('$CT')")" = "t" ]; then
  pass "concurrency 2: concurrent A+B final state = A-then-B serial (row, records, focus, events): $(q "select bucket || ', open records ' || (select count(*) from task_commitments where task_id = '$C' and status = 'open') from tasks where id = '$C'")"
else fail "concurrency: concurrent $(q "select apt.norm('$C')") <> serial $(q "select apt.norm('$CT')")"; fi
if [ "$(q "select apt.consistent('$C')")" = "t" ]; then pass "concurrency 3: after the race the row's stamps match its open records"
else fail "concurrency: row and records disagree after the race"; fi

# ── D. Concurrency, different tasks: no blocking ────────────────────────────
D1=$(q "select apt.setup('week')"); D2=$(q "select apt.setup('week')")
psql -v ON_ERROR_STOP=1 >/dev/null <<SQL &
begin;
select apt.act_as('partner');
select public.apply_task_placement('$D1', '$KEEP');
select pg_sleep(2);
commit;
SQL
PID_A=$!
D_MS=$(psql -At -v ON_ERROR_STOP=1 <<SQL | tail -1
select pg_sleep(0.5);
begin;
select apt.act_as('alex');
select apt.timed('$D2', '$KEEP');
commit;
SQL
)
wait $PID_A
if [ "${D_MS:-9999}" -lt 500 ]; then pass "concurrency 4: B on a different task finished in ${D_MS} ms while A held its own task's lock"
else fail "concurrency: different task blocked (${D_MS:-?} ms)"; fi

echo
for cat in parity rollback retry concurrency security pinning; do
  printf '  %-12s %s passed\n' "$cat" "$(printf '%s\n' "$REPORT" | grep -c "^PASS $cat " || true)"
done
PASSES=$(printf '%s\n' "$REPORT" | grep -c '^PASS ' || true)
echo "— $PASSES passed, $FAILS failed —"
[ "$FAILS" -eq 0 ]
