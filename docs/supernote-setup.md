# Supernote → Symphony setup

One-time provisioning for the scratchpad ingest pipeline. Spec:
`docs/superpowers/specs/2026-08-25-supernote-scratchpad-ingest-design.md`

## Step 0 — deploy `parse-page` BEFORE merging to `main`

This is not part of the provisioning below. It has to happen first.

```bash
npx supabase functions deploy parse-page --project-ref mwadppyrqzuzgstmwpuy
```

Every push to `main` auto-deploys the client (`vercel.json` sets
`git.deploymentEnabled`). The client that ships includes "Plan from paper",
which calls the `parse-page` edge function on every page it reads. Function
deploys are a separate, manual step — a push to `main` does not carry them.

**If the branch merges before `parse-page` is deployed, "Plan from paper" is
broken in production for everyone until someone runs the command above:** every
capture 404s and the user sees "Couldn't read the page", with no hint that the
cause is a missing function rather than their handwriting.

So: deploy `parse-page`, confirm it responds, then merge. The rest of this doc
(Dropbox, secrets, `dropbox-poll`, SQL) can follow at any time — until it is
done the poller simply never runs, and the manual camera flow works on its own.

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

## 4. Deploy the poller

```bash
npx supabase functions deploy dropbox-poll --project-ref mwadppyrqzuzgstmwpuy
```

`parse-page` is already deployed — that was step 0, before the merge.
`dropbox-poll` calls it, so re-deploy `parse-page` here too if it has changed
since.

## 5. Run the SQL

Paste `supabase/migrations/2026-08-25_supernote_ingest.sql` into the Supabase
SQL editor and run it. It adds the `captures` DELETE policy and schedules
`supernote-poll` every 15 minutes.

Until the DELETE policy is in place, reviewing a page cannot clear it: the
delete is rejected, the inbox line stays put, and Symphony says so. That is the
safe failure — the page is never lost — but the same page will keep asking to
be reviewed until the SQL is run.

## 6. First run

The first poll **arms the checkpoint and ingests nothing** — that is deliberate,
so linking Dropbox does not sweep in a year of old exports. Export a page after
the first run and it appears in the Symphony inbox within 15 minutes.

## Troubleshooting

- **"Couldn't read the page" on every capture:** `parse-page` is not deployed. See step 0.
- **Nothing appears:** `select * from cron.job_run_details where jobname = 'supernote-poll' order by start_time desc limit 5;`
- **A page failed:** `select source_label, status, error from captures where source_key = 'supernote:export' order by created_at desc limit 10;`
- **A reviewed page will not clear:** the `captures` DELETE policy is missing — run step 5.
- **Reset the watermark:** `delete from capture_checkpoints where source_key = 'supernote:export';` — the next run re-arms it (and still ingests nothing).
