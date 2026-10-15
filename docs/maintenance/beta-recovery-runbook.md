# Beta recovery runbook (B06)

October 15, 2026. What to do when something goes wrong for a beta household, and the rehearsals that must be done before invitations. Nothing in this document has been rehearsed yet on the hosted project; each rehearsal records its date, who ran it and the result in the table at the end.

## Where things are

- Web app: Vercel project behind `app.symphony-os.com`; pushing `main` deploys production (CLAUDE.md).
- Backend: Supabase project `mwadppyrqzuzgstmwpuy` (database, auth, storage, edge functions). Edge functions are deployed by name; 84 are deployed and 27 of those are not in the repository (see beta-readiness.md).
- Scheduled work: pg_cron jobs `purge-old-capture-text` (04:00 daily), `cos-ingest` (every 30 min), `proactive-engine-warm` (10:30 daily), `supernote-poll` (every 15 min); plus external triggers for inbound email.
- Diagnostics: every `symphony-agent` turn logs one JSON line (`kind: symphony-agent.turn`) with request and turn ids, surface, model, provider calls, tool names, write counts and the outcome state; never the words. The client keeps the turn's `requestId`. Ask the person for the request id (or the time and surface) when they report a problem; look it up in the function logs.

## Stop the bleeding

| Situation | Action |
|---|---|
| AI is misbehaving or spending | `update public.ai_usage_configuration set enabled = false` — every guarded route (interactive and background) refuses its next reservation with a plain message; people keep manual planning. Re-enable by setting it back. |
| One household is spending | `update public.ai_household_allowances set enabled = false where household_id = …`. |
| A display is lost or stolen | Settings → Displays → Revoke, or `select public.revoke_display('<id>')` as an owner; it fails closed at once. |
| A bad web release | Vercel → Deployments → promote the previous Ready deployment to production. No database change is needed for a web rollback. |
| A bad edge function | `supabase functions deploy <name>` from the last good commit, or disable the route in `ai_usage_configuration` meanwhile. Functions deployed from an older commit must not bypass a newer guard: the reservation RPC refuses unknown routes, so an old function that never reserved still spends; deploy functions and migrations together. |
| Data damage in one household | See restore below; prefer a targeted repair from the point-in-time copy over a full restore. |

## Backups and restore

Checked October 15, 2026 with Scott's access token: the hosted project has **daily physical backups, all COMPLETED, one per day for the last 8 days (latest 07:16Z today)**; **PITR is not enabled**; no add-ons selected. The token can read the project but **cannot create projects** (403), so a hosted scratch project needs the dashboard (or an owner-scoped token). The rehearsal below therefore restores a logical dump into a local Supabase stack, which proves the dump/restore mechanics and the data, not the provider's physical-backup restore path (that one is a dashboard action: Database → Backups → Restore, which restores IN PLACE and must never be used casually).

Before invitations:

1. Confirm the plan's backup retention and whether PITR is on. Record it here.
2. Rehearse a restore **to a separate project** (never over production): restore the latest backup into a scratch project, run the app against it with a disposable account, and confirm tasks, routines, households, memberships and connections are intact.
3. Rehearse a **targeted repair**: from the restored copy, copy one household's `tasks` rows back into production with `insert … on conflict do update`, as the service role, after confirming with the household.
4. Time both rehearsals and write the durations below.

## Schema rollback for this branch's migrations

| Migration | Down path |
|---|---|
| `20261014180000_ai_provider_call_allowances` | Keep the tables; set `enabled = false`. Dropping the function makes guarded routes fail closed (503), which is safe. |
| `20261015100000_household_displays` | `delete from household_members where role = 'display'`; drop `household_displays`, `display_pairing_codes`, the four functions and the `refuse_display_write` triggers; restore the role check without `display`. |
| `20261015110000` / `20261015120000` (allowance routes) | Re-create `reserve_ai_provider_call` from `20261014180000`; drop `reserve_ai_provider_call_for`. |
| `20261015130000_signup_allowed_invited` | Re-create `signup_allowed` from `2026-09-12_signup_gate_is_askable.sql`. |
| `20261015140000_calendar_connections_granted_scopes` | Drop the column; nothing reads it as required. |

## Drafts and interrupted work

- A change card still waiting survives a reload (per person, per tab). Approve or dismiss clears it.
- A typed message whose turn failed stays in the bar; the receipt offers Retry with the same turn id, so a retry after a dropped connection cannot create a duplicate row.
- A paper reading refused by the allowance keeps the photos and notes.
- Voice: a failed start keeps the typed path; a turn cut off after a save is reported as unverified, never as done.

## Support route

One human route for beta households: a named email address and a reply time, published in the invitation. Each report gets the request id or time, the surface and device, what was said or typed (only if the person offers it) and what the screen showed. Confirmed failures become bench scenarios (`scripts/conversation-bench`).

## Rehearsal record

| Rehearsal | Date | Who | Result | Duration |
|---|---|---|---|---|
| Restore a logical dump into a separate database | 2026-10-15 04:40–04:46Z | Claude (Scott's token) | **Pass with one limit.** `supabase db dump --linked` (roles, schema, data with COPY) took ~2 min; restore into a throwaway `supabase/postgres:17.6.1.054` container took 1 s (roles+schema) + 4 s (data); all 119 public tables matched production row for row (exact counts on both sides, e.g. tasks 994, notes 1028, routines 92). **auth rows did not restore** (the bare image's `auth` schema is an older gotrue version: missing columns such as `email_confirmed_at`), so people would have to sign up again after this kind of restore. The provider's own backup restore (Database → Backups) is the path that carries auth; it restores in place and was not rehearsed. Container and dumps deleted afterwards. | dump ~2 min, restore 5 s |
| Targeted repair of one household | not run (needs a hosted scratch project; the token cannot create one — 403) | | | |
| Web rollback (promote previous deployment) | not run | | | |
| Edge function rollback with migration ordering check | not run | | | |
| Emergency AI disable and re-enable | 2026-10-15 | Claude (approved by Scott) | Pass: with `enabled=false` the agent answered the allowance refusal with no provider call; re-enabled, it answered normally | ~1 min |
| Display revoke on a real tablet | not run (local SQL harness only) | | | |
