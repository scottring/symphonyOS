# Symphony Connectors

An always-on worker that reads two family feeds and turns them into **one
daily email digest**. It **never writes** to either service — see
`src/whatsapp/adapter.ts` for why that is enforced rather than assumed — and
it never writes to Symphony either: no tasks, no notes, no inbox rows. The
email is the whole product.

## What it does

Buffers new messages from allowlisted threads all day. At the configured
local hour (default 5pm, `FLUSH_HOURS_LOCAL`), it pulls the day's ClassDojo
posts, renders every source's transcript, and POSTs them all in one request
to the `school-digest` edge function. That function asks Claude for a short
digest (to-do / good to know / chatter, per source) and sends it as an email
from the user's own Gmail (the Google connection Symphony already holds, with
the `gmail.send` scope) to `DIGEST_TO` — or, if that is unset, to the Gmail
account itself.

If the send fails, every batch goes back in the buffer and the next 5-minute
tick retries within the same hour. Nothing is delivered twice: the per-source
high-water marks advance only on a 2xx.

## Which threads it reads

Only rows in the `capture_sources` table with `is_active = true`. Anything
absent is never buffered, read, or transmitted. To add a WhatsApp group,
insert a row with `source_key = 'whatsapp:<jid>'` — the jid is printed in the
worker log the first time a message arrives from a group you are in.
ClassDojo channels the feed carries but you are not watching are written to
`capture_sources` as inactive; flip `is_active` to start reading one.

## First deploy

```bash
fly launch --no-deploy --name symphony-connectors
fly volumes create connector_state --size 1 --region ewr

fly secrets set \
  SUPABASE_URL=https://mwadppyrqzuzgstmwpuy.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  CAPTURE_SHARED_SECRET=... \
  CAPTURE_USER_EMAIL=smkaufman@gmail.com \
  CAPTURE_USER_ID=... \
  DIGEST_TO=smkaufman@gmail.com,partner@example.com

fly deploy
```

`school-digest` needs `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
`CAPTURE_SHARED_SECRET` and the service role key as Supabase secrets — all
already present for the other functions. Deploy it with
`supabase functions deploy school-digest`.

## Linking WhatsApp (one time)

The first boot has no saved session, so it prints a QR code.

```bash
fly logs
```

On the phone: WhatsApp -> Settings -> Linked Devices -> Link a Device, and
scan the QR from the log output. The session persists on the volume across
deploys and restarts.

If the log says `device unlinked`, the phone dropped the link — repeat the
scan. Nothing is lost; the high-water marks stay on the volume.

## Why the phone still gets notifications

`markOnlineOnConnect: false`. A linked device that marks itself online takes
over notification delivery from the handset. Do not change it.

## Operational checks

- `fly logs` — one `digest: N source(s) sent` line per day.
- `connector_health` in Supabase — `last_ok_at` per connector. A stale
  timestamp means the feed is dead, not quiet. `last_error = 'digest send
  failed'` means the email leg is broken (usually the Google token).
- `fly status` — one machine, always. Two machines would hold two WhatsApp
  sessions and send the digest twice.

## ClassDojo: the session cookie

ClassDojo refuses scripted password logins from a datacenter IP — it answers
`ERR_MUST_USE_OTC_ANOMALOUS_LOGIN` and emails a one-time code, and its
code-completion path is entangled with a password reset and an SSO branch
that a Google-linked account cannot satisfy. So the connector authenticates
with a session cookie captured from a logged-in browser.

To capture one:

1. Log into https://home.classdojo.com in Chrome.
2. DevTools -> Application -> Storage -> Cookies -> `https://home.classdojo.com`.
3. Copy the value of the session cookie (the `httpOnly` one, typically
   `dojo_login.sid` or similar — not `OptanonConsent`, not `dojo_log_session_id`).
4. `fly secrets set CLASSDOJO_COOKIE='<name>=<value>' --app symphony-connectors`

The worker writes it to `/data` on boot, so it survives restarts and deploys.
When it eventually expires, `connector_health.last_error` reads "classdojo
session expired..." and you repeat the four steps.

## ClassDojo: the one-time code (does not currently work)

ClassDojo treats a login from a datacenter IP as anomalous and emails a
one-time code, so the connector cannot log in with a password alone. Do this
once per machine:

```bash
fly ssh console --app symphony-connectors
cd /app && node --experimental-strip-types src/classdojo/otcLogin.ts
```

It requests the code, waits for you to paste it from your email, then writes
the session cookie to `/data`. The connector reuses that across restarts and
deploys, so it is genuinely one-time — until ClassDojo expires the session,
at which point `connector_health.last_error` reads
"awaiting one-time code" and you run it again.
