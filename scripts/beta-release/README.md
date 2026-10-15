# Beta release steps (prepared, not run)

Everything here needs Scott's approval before it touches the hosted project. Order matters: migrations before functions, so an older deployed function can never bypass a newer guard.

## 1. Remove the orphaned functions

`./scripts/beta-release/delete-orphaned-functions.sh` deletes the 27 deployed functions that are not in the repository (several with no JWT check). Re-list first and prune anything since re-added.

## 2. Project settings

- Authentication → enable **anonymous sign-ins** (needed for display pairing).
- Confirm the backup plan / PITR per `docs/maintenance/beta-recovery-runbook.md`.

## 3. Migrations, in order

```
20261014180000_ai_provider_call_allowances.sql
20261015100000_household_displays.sql
20261015110000_ai_allowance_all_interactive_routes.sql
20261015120000_ai_allowance_background_routes.sql
20261015130000_signup_allowed_invited.sql
20261015140000_calendar_connections_granted_scopes.sql
20261015150000_ai_spend_ledger.sql
```

Apply to an isolated copy first (`supabase db push` against a scratch project), run `tests/integration/task-privacy.integration.test.ts` and the display/allowance scenarios with real JWTs there, then production.

## 4. Configure the limits (hypotheses from the plan, in cents)

```sql
update public.ai_model_prices set enabled = true where model in ('claude-sonnet-4-6', 'text-embedding-3-small', 'gpt-4o-mini', 'gpt-realtime-2.1', 'gpt-4o-mini-tts'); -- after confirming each rate
update public.ai_usage_configuration set enabled = true, daily_calls = <n>, monthly_calls = <n>, monthly_cents = 25000, refuse_unpriced = true;
insert into public.ai_household_allowances (household_id, enabled, daily_calls, monthly_calls, daily_cents, monthly_cents)
  values ('<household>', true, <n>, <n>, 300, 2000);
```

Until `ai_usage_configuration.enabled` is true every guarded route refuses (503, "AI is unavailable while its usage controls are not ready") and manual planning keeps working.

## 5. Deploy the functions

All functions under `supabase/functions` (`supabase functions deploy` each, or the whole set) in the same release as the migrations. `WORKSPACE_VOICE_USER_IDS` stays the voice allowlist.

## 6. Verify on the hosted project

- A fresh organizer signs up and sets up; an invited adult (not on the waitlist) signs up and joins.
- Pair an iPad as a display; revoke it; confirm it goes blank.
- Run `node scripts/conversation-bench/live.mjs scripts/conversation-bench/scenarios/j1-plumber-week.json` with a synthetic account.
- Check `ai_spend` against the provider dashboards after the first day.
