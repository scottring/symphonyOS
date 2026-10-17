# School information for the beta

Production rollout completed October 16, 2026. The user explicitly approved the
shared database, functions, mail worker and app deployment. All are deployed.
Actual SMTP delivery and Gmail forwarding/filter setup remain unverified.

App version **2026-10-16.7-school-review**, source `9f74011524b11658c6ccb4d6a46e0227f02407e3`,
Vercel deployment `dpl_5ED7NyzmQL3pTD4RhGHm4ESMEGTB`, serves both
`app.symphony-os.com` and `symphony-rebuild.vercel.app`. Migration
`20261016150000_school_mail_review` is applied and recorded atomically.
`inbound-email` v14 and `extract-email` v20 retain shared-secret authentication;
`capture-retry` v13 retains JWT verification plus the adult household check.
The planner remains `symphony-agent` v75. No real family records were edited.
Cloudflare worker `symphony-inbound-mail` version
`3a4c7aa6-c157-4dba-97f4-4f28eab57e94` serves 100% of traffic. Its existing secret
bindings are present, and the active `symphony-os.com` catch-all rule points to
that worker. No DNS or routing changes were made.

## A parent's path

1. Open Settings → General → School information, or follow “Bring in school
   emails” at the end of onboarding.
2. Choose **Get my forwarding address**. Simply opening Settings creates nothing.
3. Forward one school email. The page distinguishes an address being ready from
   an email actually arriving.
4. Open **Review**. Read the original email and quoted basis for suggestions.
   Check dates, people and unread attachment warnings. Uncheck unwanted items;
   use **Change** for corrections. Routines include a Today/Week visibility choice.
5. **Save selected items** adds only the selection. A durable receipt confirms it.
   “Finish without adding anything” retains the email without plan writes.
   Inbox links to emails awaiting review.

Full email text, forwarding addresses and review controls are unavailable to
paired displays and other households. Approved activities follow existing family
sharing. A notice assigned to one child appears on that child's shared-tablet
page; unassigned notices are household-wide. No Google Calendar events are created.

## Forwarding setup

Start with one manually forwarded message. In Gmail, add the household address
under Settings → See all settings → Forwarding and POP/IMAP (or Forwarding).
The verification message appears in Symphony for the parent to handle; Symphony
never follows its link or approves it automatically. Then create filters for school
senders, leaving forwarding of all mail disabled. See
[Google's instructions](https://support.google.com/mail/answer/10957?hl=en).

Other providers can use sender-specific forwarding rules where supported, or
manual forwarding. Google Calendar connection does not enable email access.
ClassDojo/WhatsApp content can enter when included in forwarded email text; this
beta setup does not log into those services. Keep the forwarding address private:
anyone holding it can submit mail for review. No self-service address rotation yet.

## Implementation and guarantees

Cloudflare Email Routing → `infra/inbound-mail` Worker → `inbound-email` →
`extract-email` → `school_mail_reviews` → parent Save → plan tables.

The extractor uses `claude-sonnet-4-6`, the working production planner model,
through the household cost guard. The live check caught the old extractor's
unpriced `claude-sonnet-5` configuration; it failed before a paid call. The model
name was corrected without changing limits, and a pricing-compatibility regression
check was added.
It publishes proposals, never writes tasks/routines/notices. Source text is untrusted;
malformed/truncated model responses are retryable failures. Gmail confirmations
skip AI. A processing lease prevents concurrent duplicate model calls.

The save RPC validates proposal IDs, household membership, people, dates and times.
Selected writes and their receipt commit in one transaction. Repeated clicks, a
lost response or another parent's save return the original receipt. Exact existing
activities are skipped; differently worded duplicates still require parent judgment.

## Verification before rollout

- 109 focused component, hook, extraction and inbound validation tests.
- 8 extraction handler checks: authentication, processing lease, no plan writes,
  malformed/truncated responses, forwarding confirmation, publishing failure and
  compatibility with the priced, bounded text-model configuration.
- 14 Worker checks including MIME, empty/attachment-only mail and retry behavior.
- 61 regression checks around onboarding, Settings, Inbox and Today.
- 21 checks in disposable PostgreSQL: no writes before Save, corrections,
  household/display/child isolation, atomic rollback, simultaneous saves, lost-response
  retries, duplicate email scope, routine visibility and child-specific notices.
- Desktop and 390px browser walkthrough using production components and synthetic
  examples: changed 09:00 to 15:00, omitted two suggestions, hid a routine from
  Today/Week, simulated failed Save and retried successfully. No horizontal overflow.
  This is UI evidence, not live email delivery or real-AI extraction.
- Migration rehearsed against hosted schema in a rolled-back transaction before
  the approved production deployment; later notice-targeting and child-login
  refinements passed local checks. The production migration is now retained.
- **14 live assertions** with the ordinary synthetic account in Baseline
  Verification Household: real AI extraction, unchanged plans before Save,
  attachment warning, correct date and weekly recurrence, parent-edited time,
  hidden routine, unselected items omitted, idempotent Save/extraction, and a
  synthetic Gmail confirmation dismissed without plan writes or another AI call.
- Hosted browser check on the release candidate: real AI proposal, selected one
  of three items, changed 13:00 to 17:00, saved, and read back exactly one event
  at `2026-10-22T21:00:00Z` (17:00 America/New_York) with no unselected notices.
  [Saved receipt](planning/beta-sessions/evidence/2026-10-16-school-hosted-save.png).
- Both public domains were checked after promotion and reported the exact release
  version and source commit. See [deployment evidence](planning/2026-10-16-school-mail-production.json).

```sh
npx vitest run src/components/settings/SchoolMailCard.test.tsx src/components/settings/SchoolMailReview.test.tsx src/hooks/useSchoolMail.test.ts src/hooks/useUnreviewedCaptures.test.ts supabase/functions/extract-email supabase/functions/inbound-email/lib
node scripts/test-school-mail-review.mjs
cd infra/inbound-mail && npm test
```

The database script requires local PostgreSQL 17 and removes its own disposable
cluster; it never connects to production. UI preview:
`/scripts/school-mail-bench/panel-preview.html` on Vite. Examples and saves stay in
memory. This preview is not packaged into the main app.

## Remaining live delivery checks

Deployment approval is already granted. Forwarded school emails now require
parent review for all households. Keep baseline frontend/function copies available;
do not casually restore the old automatic importer while reviews are pending.
Previous frontend deployment: `dpl_HanBwr5giz8rPuQFMZELxZ81Efr5`.

The worker update is deployed after the account holder completed Cloudflare sign-in.
Its unread-attachment markers and empty/attachment-only handling passed the 14
worker tests. Cloudflare reports the new version active at 100%, the two required
secret bindings remain configured, and the enabled catch-all routes to it.
Previous worker version for rollback: `648767ec-29b5-4038-8ad9-f938938aed87`.

1. Have the account holder forward one selected message to the synthetic household
   address. Verify receipt, review and Save from that actual delivery. The live
   tests above seeded fictional captures directly; they did not send SMTP mail.
2. If automatic forwarding is wanted, the account holder completes Gmail's real
   verification and sender-specific filter setup. The confirmation test above used
   a fixture, not a genuine Google confirmation or a mailbox permission change.

Scope limits: PDFs/images are not parsed. At most 40 emails load, pending reviews
first, with up to 80 suggestions each. No review-specific Undo; saved activities
can be edited in existing views. Legacy captures say “Earlier import.” The private
pre-existing school-digest connector's homework behavior is separate and is not
enabled by this beta forwarding setup.
