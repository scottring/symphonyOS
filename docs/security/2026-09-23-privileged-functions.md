# Privileged database function review — September 23, 2026

Scope: the 24 `SECURITY DEFINER` functions in `public` that Supabase's security
advisor reported as executable by `anon` (signed out) and `authenticated`
(signed in). A privileged function runs with its owner's rights and bypasses
row-level security, so each must check who is calling.

Method:
1. Read each function's current production definition and its grants.
2. Found every caller in this repo, cron and other database functions.
3. Called each risky function on production as `anon`, as a signed-in user of
   **another** household (Scott → test household), and as the service role,
   inside transactions that ended in `rollback`. Output was limited to counts
   and field names; no personal data was printed.

Fix: `supabase/migrations/2026-09-23_privileged_function_access.sql` (not yet
applied). Proof: `supabase/tests/094_privileged_function_access.test.sql`
passes with the migration applied inside a rolled-back transaction, and its
first assertion fails without it.

## Findings, by demonstrated impact

| # | Severity | Function | Demonstrated | Fix |
| --- | --- | --- | --- | --- |
| 1 | **High** | `get_household_context(p_user)` | With only a user id, `anon` and a signed-in user from another household both received that user's 4 family members **with allergies, medications, health conditions, dietary restrictions**, plus service-provider contacts (phone/email) and task counts. Control: the same outsider sees 0 of those members through normal RLS. No authorization check existed. Exploitation needs a target user id (UUIDs aren't guessable, but they're shared with household members and appear in some URLs and payloads). | Revoked from `anon`/`authenticated` (nothing in the app calls it; the service role keeps access). Added an in-function check: a signed-in caller may read only their own household. |
| 2 | Medium | `claim_engine_run(key, interval)` | `anon` claimed a run slot (returned `true`, wrote `ai_engine_runs`). An outsider could keep claiming `proactive-engine:<user>` keys and suppress the morning warm job for that user. | Revoked from `anon`/`authenticated`; only the owner-run cron job calls it. |
| 3 | Medium | `cos_ingest_all()`, `cos_ingest_proposals(p_user)` | `anon` ran the ingestor (0 new items today). Anyone can queue assistant proposals from any user's email items at will; it does the same thing the 30-minute cron does, so the impact is mainly integrity and load, not disclosure. | Revoked; cron runs as owner. |
| 4 | Low | `tasks_sync_from_commitments(p_task)` | Callable by `anon` for any task id. It re-derives a task's placement cache from its own commitments (idempotent), so impact is limited to forcing a recompute. | Revoked; only the commitments trigger calls it (as owner). |
| 5 | Low | `users_share_household`, `get_user_household_id(s)`, `is_household_admin` | `anon` could learn, for known user ids, whether two users share a household, a user's household id, and whether they're an owner/admin. No personal data. | **Kept callable**, because RLS policies and the app depend on them; pinned their `search_path`. Accepted risk. |
| 6 | Low | `signup_allowed(email)` | `anon` can test whether an email is allowlisted or approved (returned `true` for a known address). | **Kept**: sign-up must check before an account exists. Accepted; consider rate limiting if the waitlist grows. |
| 7 | Hygiene | 5 trigger functions (`check_allowed_signup`, `ensure_user_has_household`, `task_commitments_after_change`, `tasks_mirror_to_commitments`, `waitlist_signup_to_inbox`) | Not exploitable: Postgres refuses direct calls ("trigger functions can only be called as triggers"). | Revoked app-role `EXECUTE` anyway (triggers don't need it). |
| 8 | Hardening | 6 functions without a pinned `search_path` | Not demonstrated as exploitable (app roles can't create objects in `public`), but an unpinned path is a known escalation vector for privileged functions. | Set `search_path = public, pg_temp`. Assertion 14 checks that no privileged function in `public` is left unpinned. |

No issue found in: `accept_household_invitation` and `invitation_preview`
(both gated by an unguessable, expiring invitation token; preview returns only
names), `append_chat_message` and `ensure_discuss_thread` (participant checks),
`setup_household` (acts only on the caller), `is_app_admin` (checks the caller
only), and `search_notes_semantic` (scoped by `auth.uid()`; a signed-out caller
gets nothing).

## School mail and medication-log bug (same migration)

`ensure_inbound_token` (School mail forwarding address) and
`ensure_med_log_token` called `gen_random_bytes`, but `pgcrypto` is installed in
the `extensions` schema and both functions only searched `public`. Every call
failed with "function gen_random_bytes(integer) does not exist", which Settings
showed raw. Both now call `extensions.gen_random_bytes`. The proof script
checks that a member gets a 16-hex-character forwarding token and a signed-in
user gets a med-log token. It also checks that a non-member and `anon` are
refused, restoring the functions' original signed-in-only grants.

## Not covered here

The advisor's other warnings are outside this review:
- 14 non-privileged functions with a mutable search_path. Lower risk, because
  they run with the caller's rights.
- `vector` and `pg_trgm` installed in `public`.
- Leaked-password protection disabled (an Auth setting in the Supabase dashboard).
- Two tables with RLS enabled but no policies (`ai_engine_runs`, `thoughts`).
  They're deny-all to app roles, which is the intended default for server-only
  tables.
