# Supernote → Symphony setup

One-time provisioning for the scratchpad ingest pipeline. Spec:
`docs/superpowers/specs/2026-08-25-supernote-scratchpad-ingest-design.md`

## 1. Link the tablet

Supernote → Settings → Sync → Dropbox → link the account. The device creates
`/Supernote/` in the Dropbox root with `Note/`, `Document/`, and `EXPORT/`.

**The trigger is Export, not sync.** Symphony only ever reads
`/Supernote/EXPORT`. A page enters the pipeline when you export it; nothing you
merely write is ingested.

## 2. Create the Dropbox app

Dropbox App Console → Create app → **Scoped access** → **Full Dropbox**.

Full access is unavoidable: Supernote syncs to the account root and offers no
app-folder target. The mitigation is on our side — `dropbox-poll` reads one
hard-coded path and takes no path parameter.

Permissions tab: enable `files.metadata.read` and `files.content.read`, then
**Submit**. Generate a refresh token with `token_access_type=offline`.

## 3. Set the function secrets

```bash
npx supabase secrets set \
  DROPBOX_APP_KEY=... \
  DROPBOX_APP_SECRET=... \
  DROPBOX_REFRESH_TOKEN=... \
  SUPERNOTE_USER_ID=... \
  --project-ref mwadppyrqzuzgstmwpuy
```

`SUPERNOTE_USER_ID` is Scott's `auth.users.id`.

## 4. Deploy the functions

```bash
npx supabase functions deploy parse-page --project-ref mwadppyrqzuzgstmwpuy
npx supabase functions deploy dropbox-poll --project-ref mwadppyrqzuzgstmwpuy
```

## 5. Run the SQL

Paste `supabase/migrations/2026-08-25_supernote_ingest.sql` into the Supabase
SQL editor and run it. It adds the `captures` DELETE policy and schedules
`supernote-poll` every 15 minutes.

## 6. First run

The first poll **arms the checkpoint and ingests nothing** — that is deliberate,
so linking Dropbox does not sweep in a year of old exports. Export a page after
the first run and it appears in the Symphony inbox within 15 minutes.

## Troubleshooting

- **Nothing appears:** `select * from cron.job_run_details where jobname = 'supernote-poll' order by start_time desc limit 5;`
- **A page failed:** `select source_label, status, error from captures where source_key = 'supernote:export' order by created_at desc limit 10;`
- **Reset the watermark:** `delete from capture_checkpoints where source_key = 'supernote:export';` — the next run re-arms it (and still ingests nothing).
