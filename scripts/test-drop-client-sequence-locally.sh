#!/usr/bin/env bash
# The Drop sequence as the client now sends it (commitments first, row last),
# against a throwaway local Postgres 17 with the LIVE schema fixture. Loads
# 097's helpers (by running 097), then 098's client-sequence blocks.
#
#   ./scripts/test-drop-client-sequence-locally.sh
#
# Never touches Supabase. Fidelity: as scripts/test-planning-commitments-locally.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
DIR="$(mktemp -d)"; PORT="${PORT:-54996}"
trap '"$PG_BIN/pg_ctl" -D "$DIR" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
"$PG_BIN/initdb" -D "$DIR" -U postgres -A trust >/dev/null
"$PG_BIN/pg_ctl" -D "$DIR" -o "-p $PORT -k $DIR -c listen_addresses=" -l "$DIR/log" start >/dev/null
psql() { "$PG_BIN/psql" -X -h "$DIR" -p "$PORT" -U postgres -q "$@"; }
psql -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/planning_commitments_schema.sql >/dev/null
# The same people and households 097 expects.
sed -n "/^psql -v ON_ERROR_STOP=1 <<'SQL'/,/^SQL$/p" scripts/investigate-drop-partial-failure.sh | sed '1d;$d' | psql -v ON_ERROR_STOP=1 >/dev/null
psql -f supabase/tests/097_drop_partial_failure.investigation.sql >/dev/null 2>&1 || true
OUT="$(psql -f supabase/tests/098_drop_client_sequence.test.sql 2>&1 || true)"
[ -n "${VERBOSE:-}" ] && printf '%s\n' "$OUT"
printf '%s\n' "$OUT" | sed -n 's/.*NOTICE: *\(PASS .*\)/\1/p; s/.*ERROR: *\(.*\)/FAIL-> \1/p'
P=$(printf '%s\n' "$OUT" | grep -c 'NOTICE: *PASS ' || true); E=$(printf '%s\n' "$OUT" | grep -c 'ERROR:' || true)
echo "— $P passed, $E failed —"
[ "$E" -eq 0 ] && [ "$P" -eq 7 ]
