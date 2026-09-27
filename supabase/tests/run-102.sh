#!/bin/sh
# Local only: proves 102 with the prepared migration applied inside one
# transaction that is rolled back. Never point this at the shared project.
DB=${DB:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}
case "$DB" in *127.0.0.1*|*localhost*) ;; *) echo "refusing non-local DB" >&2; exit 1;; esac
dir=$(dirname "$0")
{ echo 'begin;'; cat "$dir/../migrations/2026-09-27_goal_link_visible.sql" "$dir/102_goal_link_visible.test.sql"; echo 'rollback;'; } | psql "$DB" -v ON_ERROR_STOP=1 -q
