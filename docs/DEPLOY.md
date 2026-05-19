# Deployment

Production: **app.symphony-os.com** (Vercel project `symphony-rebuild`).

## Auto-deploy

The GitHub repo `scottring/symphonyOS` is connected to the Vercel project with
production branch `main`. **Pushing to `main` auto-builds and deploys
production.** No manual `vercel deploy` step is required.

(Before 2026-05-19 the project had no Git connection — `link: null` — so pushes
to `main` never deployed and production required manual `vercel deploy --prod`.
The Git integration was connected on 2026-05-19; this file's first commit was
the verification push.)

## Manual deploy (fallback)

From a Vercel-linked checkout: `vercel deploy --prod --yes`, then confirm the
output shows `target: production` and `Aliased: https://app.symphony-os.com`.
