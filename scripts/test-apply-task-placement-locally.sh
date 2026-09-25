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
# The follow-up, in order, as it is applied to the project.
FOLLOWUP=supabase/migrations/2026-09-25_apply_task_placement_conflict_code.sql
psql -v ON_ERROR_STOP=1 -f "$FOLLOWUP" >/dev/null
echo "loaded $FOLLOWUP (sha256 $(shasum -a 256 "$FOLLOWUP" | cut -c1-12))"

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
# apt.timed_try: one call, caught; returns '<ms>|<ok or sqlstate message>'.
q "create function apt.timed_try(t uuid, steps jsonb, expected jsonb) returns text language plpgsql as \$\$
   declare t0 timestamptz := clock_timestamp(); r text;
   begin r := apt.try(apt.rpc_sql(t, steps, expected));
         return (extract(epoch from clock_timestamp() - t0) * 1000)::int || '|' || r; end \$\$;
   create table apt.saved (k text primary key, v jsonb);" >/dev/null
STEPS() { q "select steps from apt.scenarios where name = '$1'"; }
OPEN() { q "select apt.open_now('$1')"; }
# One committed call in its own session: exit status 0 = committed.
CALL() { psql -v ON_ERROR_STOP=1 >/dev/null 2>&1 -c "begin; select apt.act_as('$1'); select public.apply_task_placement('$2', '$3', '$4'); commit;"; }
LETGO_B='[{"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}},{"t":"remove","level":"week","period_start":"2026-09-27"},{"t":"row","set":{"bucket":"someday","week_start":null,"month_start":null,"season_start":null}}]'
W0920='[{"level":"week","period_start":"2026-09-20"}]'
W0927='[{"level":"week","period_start":"2026-09-27"}]'

# ── A. Top-level rollback: a fault mid-call in a real transaction ────────────
for pos in 1 3 5; do
  T=$(q "select apt.setup('week+month+focus')")
  q "insert into apt.saved values ('A$pos', apt.exact('$T'))" >/dev/null
  if psql -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL
begin;
select apt.act_as('alex');
select apt.arm($pos);
select public.apply_task_placement('$T', (select steps from apt.scenarios where name = 'letgo'), apt.open_now('$T'));
commit;
SQL
  then fail "rollback-toplevel $pos: the faulted call committed"
  elif [ "$(q "select apt.exact('$T') = v from apt.saved where k = 'A$pos'")" = "t" ]; then
    pass "rollback 8.$pos: top-level transaction, fault at write $pos of let-go → session errors, nothing committed"
  else fail "rollback-toplevel $pos: state changed"; fi
done

# ── B. Lost response: the call commits, the client retries in a NEW session ──
for sc in drop keep day letgo push clear; do
  ACTOR=$(q "select actor from apt.scenarios where name = '$sc'")
  START=$(q "select start from apt.scenarios where name = '$sc'")
  T=$(q "select apt.setup('$START')"); TW=$(q "select apt.setup('$START')")
  S=$(STEPS "$sc"); EXP=$(OPEN "$T")
  CALL "$ACTOR" "$T" "$S" "$EXP" || fail "retry lost-response $sc: first call failed"   # committed, response lost
  q "insert into apt.saved values ('B$sc', apt.exact('$T'))" >/dev/null
  if CALL "$ACTOR" "$T" "$S" "$EXP"; then BLIND=ok; else BLIND=refused; fi              # blind identical retry
  BLIND_SAME=$(q "select apt.exact('$T') = v from apt.saved where k = 'B$sc'")
  CHANGED=$(q "select '$EXP'::jsonb <> apt.open_now('$T')")
  CALL "$ACTOR" "$T" "$S" "$(OPEN "$T")" || fail "retry lost-response $sc: re-read retry failed"  # correct retry
  CALL "$ACTOR" "$TW" "$S" "$(OPEN "$TW")" || fail "retry lost-response $sc: twin failed"          # one clean call
  SAME=$(q "select apt.norm('$T') = apt.norm('$TW')")
  COUNTS=$(q "select (select count(*) from task_commitments where task_id = '$T') || ' records, ' || (select count(*) from task_focus where task_id = '$T') || ' focus, ' || apt.events('$T') || ' events (single call: ' || apt.events('$TW') || ')'")
  if [ "$CHANGED" = "t" ] && [ "$BLIND" != "refused" ]; then fail "retry lost-response $sc: blind retry was not refused"
  elif [ "$BLIND_SAME" != "t" ]; then fail "retry lost-response $sc: blind retry changed state"
  elif [ "$SAME" = "t" ]; then pass "retry 7.$sc: lost response → blind identical retry $BLIND$([ "$BLIND" = refused ] && echo ' (PT409, nothing written)'); re-read retry → ok; = one call, events included — $COUNTS"
  else fail "retry lost-response $sc: $(q "select apt.norm('$T')") vs $(q "select apt.norm('$TW')")"; fi
done

# ── C. Concurrency, same task: A holds the row lock, B waits ────────────────
# B planned from A's result ({week 09-27}), so it passes once it gets the lock.
KEEP=$(STEPS keep)
C=$(q "select apt.setup('week')"); CT=$(q "select apt.setup('week')")
psql -v ON_ERROR_STOP=1 >/dev/null <<SQL &
begin;
select apt.act_as('partner');
select public.apply_task_placement('$C', '$KEEP', '$W0920');
select pg_sleep(2);
commit;
SQL
PID_A=$!
B_OUT=$(psql -At -v ON_ERROR_STOP=1 <<SQL | tail -1
select pg_sleep(0.5);
begin;
select apt.act_as('alex');
select apt.timed_try('$C', '$LETGO_B', '$W0927');
commit;
SQL
)
wait $PID_A
B_MS=${B_OUT%%|*}; B_RES=${B_OUT#*|}
CALL partner "$CT" "$KEEP" "$W0920"; CALL alex "$CT" "$LETGO_B" "$W0927"   # serial A then B
if [ "$B_RES" = ok ] && [ "${B_MS:-0}" -ge 1200 ]; then pass "concurrency 1: B on the same task waited ${B_MS} ms for A's lock (A held it ~1.5 s after B started), then saved"
else fail "concurrency: B $B_RES after ${B_MS:-?} ms"; fi
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
select public.apply_task_placement('$D1', '$KEEP', '$W0920');
select pg_sleep(2);
commit;
SQL
PID_A=$!
D_OUT=$(psql -At -v ON_ERROR_STOP=1 <<SQL | tail -1
select pg_sleep(0.5);
begin;
select apt.act_as('alex');
select apt.timed_try('$D2', '$KEEP', '$W0920');
commit;
SQL
)
wait $PID_A
D_MS=${D_OUT%%|*}; D_RES=${D_OUT#*|}
if [ "$D_RES" = ok ] && [ "${D_MS:-9999}" -lt 500 ]; then pass "concurrency 4: B on a different task finished in ${D_MS} ms while A held its own task's lock"
else fail "concurrency: different task $D_RES after ${D_MS:-?} ms"; fi

# ── E. Stale plans, truly concurrent (Codex's reproduction) ─────────────────
# Both read {week 09-20}. A moves it to 09-27 and holds the lock; B, planned
# from the same read, moves it to 10-04. B must wait, then be refused.
SA=$(q "select v from apt.stale where k = 'A'"); SB=$(q "select v from apt.stale where k = 'B'"); SB2=$(q "select v from apt.stale where k = 'B2'")
for round in 1 2 3; do
  E=$(q "select apt.setup('week')")
  psql -v ON_ERROR_STOP=1 >/dev/null <<SQL &
begin;
select apt.act_as('alex');
select public.apply_task_placement('$E', '$SA', '$W0920');
select pg_sleep(2);
commit;
SQL
  PID_A=$!
  E_OUT=$(psql -At -v ON_ERROR_STOP=1 <<SQL | tail -1
select pg_sleep(0.5);
begin;
select apt.act_as('partner');
select apt.timed_try('$E', '$SB', '$W0920');
commit;
SQL
)
  wait $PID_A
  E_MS=${E_OUT%%|*}; E_RES=${E_OUT#*|}
  WEEKS=$(q "select apt.open_weeks('$E')")
  ROW=$(q "select week_start from tasks where id = '$E'")
  if [[ "$E_RES" == PT409* ]] && [ "${E_MS:-0}" -ge 1200 ] && [ "$WEEKS" = "2026-09-27" ] && [ "$ROW" = "2026-09-27" ] && [ "$(q "select apt.consistent('$E')")" = t ]; then
    pass "stale 12.$round: concurrent — B waited ${E_MS} ms, then ${E_RES%% placement*} 'placement changed since it was read'; open weeks = $WEEKS only, row week $ROW, consistent"
  else fail "stale concurrent round $round: B '$E_RES' after ${E_MS:-?} ms; open weeks $WEEKS; row $ROW"; fi
done
# (c) after the refusal B re-reads and re-plans
if CALL partner "$E" "$SB2" "$W0927" && [ "$(q "select apt.open_weeks('$E')")" = "2026-10-04" ] && [ "$(q "select week_start from tasks where id = '$E'")" = "2026-10-04" ]; then
  pass "stale 13: after the concurrent refusal, B re-reads {week 09-27} and re-plans → ok; open weeks = 2026-10-04 only"
else fail "stale re-plan after concurrent refusal: open weeks $(q "select apt.open_weeks('$E')")"; fi

echo
for cat in parity rollback retry concurrency stale security pinning; do
  printf '  %-12s %s passed\n' "$cat" "$(printf '%s\n' "$REPORT" | grep -c "^PASS $cat " || true)"
done
PASSES=$(printf '%s\n' "$REPORT" | grep -c '^PASS ' || true)
echo "— $PASSES passed, $FAILS failed —"
[ "$FAILS" -eq 0 ]
