# Symphony Connectors

An always-on worker that reads two family feeds and posts them to Symphony's
capture pipeline. It **never writes** to either service — see
`src/whatsapp/adapter.ts` for why that is enforced rather than assumed.

## What it does

Buffers new messages from allowlisted threads, renders them into the
transcript format `extract-capture` parses, and POSTs them to
`capture-to-inbox` at the configured local hours (default noon and 8pm).
Candidates land in Symphony's inbox and surface in the "School" dropdown on
Today.

## Which threads it reads

Only rows in the `capture_sources` table with `is_active = true`. Anything
absent is never buffered, read, or transmitted. To add a WhatsApp group,
insert a row with `source_key = 'whatsapp:<jid>'` — the jid is printed in the
worker log the first time a message arrives from a group you are in.

## First deploy

```bash
fly launch --no-deploy --name symphony-connectors
fly volumes create connector_state --size 1 --region ewr

fly secrets set \
  SUPABASE_URL=https://mwadppyrqzuzgstmwpuy.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY=... \
  CAPTURE_SHARED_SECRET=... \
  CAPTURE_USER_EMAIL=smkaufman@gmail.com \
  CAPTURE_USER_ID=...

fly deploy
```

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

- `fly logs` — flush lines report delivered/failed counts per tick.
- `connector_health` in Supabase — `last_ok_at` per connector. A stale
  timestamp means the feed is dead, not quiet.
- `fly status` — one machine, always. Two machines would hold two WhatsApp
  sessions and deliver everything twice.

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
