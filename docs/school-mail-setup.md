# School mail → Symphony: setup

Spec: `docs/superpowers/specs/2026-09-02-school-email-to-event-design.md`
Plan (server phase): `docs/superpowers/plans/2026-09-02-school-email-server.md`

A household forwards school email to `<token>@symphony-os.com`. Cloudflare Email Routing hands it to the `symphony-inbound-mail` Worker, which POSTs it to the `inbound-email` edge function; that stores a `captures` row and invokes `extract-email`, which writes the placed event block, its per-person subtasks, inbox todos, and a good-to-know note.

## Deploy order (load-bearing)

1. Apply `supabase/migrations/2026-09-02_school_email_ingest.sql` in the Supabase SQL editor (the agent's Management API path is blocked).
2. `npx supabase functions deploy inbound-email --project-ref mwadppyrqzuzgstmwpuy --use-api`
3. `npx supabase functions deploy extract-email --project-ref mwadppyrqzuzgstmwpuy --use-api`
4. Push `main`.

Secrets already present in the project: `CAPTURE_SHARED_SECRET`, `ANTHROPIC_API_KEY`.

## Cloudflare (one time, Scott)

Run `npm test` in `infra/inbound-mail` before any Worker deploy — CI runs it too, but the Worker deploys outside CI.

```bash
cd infra/inbound-mail && npm install
npm test
npx wrangler login
npx wrangler secret put SUPABASE_URL          # https://mwadppyrqzuzgstmwpuy.supabase.co
npx wrangler secret put CAPTURE_SHARED_SECRET # same value as the Supabase secret
npx wrangler deploy
```

Then Cloudflare dashboard → symphony-os.com → Email → Email Routing → Routing rules:

- keep the existing `hello@` rule (custom addresses win over the catch-all);
- Catch-all: action **Send to a Worker** → `symphony-inbound-mail`.

The Worker never replies, forwards, or rejects. A recipient that is not a 16-hex-char token is dropped silently. A 5xx from the edge function makes the Worker throw so Cloudflare retries delivery; a 4xx is final.

## A household's address

```sql
select ensure_inbound_token(id) from households where id = '<household id>';
```

→ `<token>@symphony-os.com`. The RPC is member-only and idempotent. The Settings card (client phase) will expose this in the app.

The address is a credential: anyone who knows it can write into the household. Never publish it in a screenshot, a doc, or a support thread. There is no rotation path yet — a leaked token means editing `households.inbound_token` by hand.

## Smoke test

With the shared secret (the Fly connectors worker holds it: `fly ssh console -a symphony-connectors`), POST a fixture email straight to the edge function, bypassing Cloudflare:

```bash
curl -s -X POST "https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/inbound-email" \
  -H "content-type: application/json" -H "x-capture-secret: $CAPTURE_SHARED_SECRET" \
  -d '{"token":"<token>","message_id":"<smoke-1@test>","from":"Hillside Elementary <news@hillside.org>","subject":"Weekly Update","received_at":"2026-09-02T12:00:00Z",
       "text":"Hi families! Picture Day is Thursday September 10. Students should bring their payment envelope and wear school colors. Field trip permission forms are due September 15. Reminder: early dismissal every Friday at 1:30."}'
```

Expected: `202 {"ok":true,"capture_id":"..."}`. Within about 15 seconds, in Symphony: an all-day family event "Picture Day" on Sep 10 with a subtask per child (payment envelope needed the night before, school colors on the day), an inbox task for the permission forms, and a note "From Hillside Elementary: Weekly Update" carrying the early-dismissal line. Repeating the same curl returns `200 {"duplicate":true}` and writes nothing.

To test the real path, forward any email to the household address and watch `npx wrangler tail` in `infra/inbound-mail`.

## Failure modes

| Symptom | Where to look |
|---|---|
| `captures.status = 'failed'` | `captures.error` says why. Retry: POST `{"capture_id":"…"}` to `extract-email` with the shared secret. Retries are idempotent (placed blocks, inbox rows and the note are all deduped). |
| Nothing arrives | `wrangler tail` shows whether the Worker ran. A non-token recipient is dropped by design. A 404 from `inbound-email` means the token does not match any household. |
| Event landed in Inbox instead of on its day | Confidence below 0.75, or the date was in the past. The row's notes say which. |
| A child's item is unassigned | The email used a name that is not a household member's first name, or two members share the first name. The name is kept in the item text. |
