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

## ClassDojo: the one-time code

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
