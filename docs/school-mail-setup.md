# School information for the beta

Candidate implementation, October 16, 2026. **Not deployed.** Automatic approval
review blocked the production migration pending explicit deployment authorization.
Production remains on the previously deployed baseline.

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

The extractor uses the existing `claude-sonnet-5` through the household cost guard.
It publishes proposals, never writes tasks/routines/notices. Source text is untrusted;
malformed/truncated model responses are retryable failures. Gmail confirmations
skip AI. A processing lease prevents concurrent duplicate model calls.

The save RPC validates proposal IDs, household membership, people, dates and times.
Selected writes and their receipt commit in one transaction. Repeated clicks, a
lost response or another parent's save return the original receipt. Exact existing
activities are skipped; differently worded duplicates still require parent judgment.

## Verification before rollout

- 109 focused component, hook, extraction and inbound validation tests.
- 7 extraction handler checks: authentication, processing lease, no plan writes,
  malformed/truncated responses, forwarding confirmation and publishing failure.
- 14 Worker checks including MIME, empty/attachment-only mail and retry behavior.
- 61 regression checks around onboarding, Settings, Inbox and Today.
- 19 checks in disposable PostgreSQL: no writes before Save, corrections,
  household/display isolation, atomic rollback, simultaneous saves, lost-response
  retries, duplicate email scope, routine visibility and child-specific notices.
- Desktop and 390px browser walkthrough using production components and synthetic
  examples: changed 09:00 to 15:00, omitted two suggestions, hid a routine from
  Today/Week, simulated failed Save and retried successfully. No horizontal overflow.
  This is UI evidence, not live email delivery or real-AI extraction.
- Migration rehearsed against hosted schema in a rolled-back transaction. The
  later notice-targeting refinement passed local transactional checks. No retained
  production migration and no real family records changed.

```sh
npx vitest run src/components/settings/SchoolMailCard.test.tsx src/components/settings/SchoolMailReview.test.tsx src/hooks/useSchoolMail.test.ts src/hooks/useUnreviewedCaptures.test.ts supabase/functions/extract-email supabase/functions/inbound-email/lib
node scripts/test-school-mail-review.mjs
cd infra/inbound-mail && npm test
```

The database script requires local PostgreSQL 17 and removes its own disposable
cluster; it never connects to production. UI preview:
`/scripts/school-mail-bench/panel-preview.html` on Vite. Examples and saves stay in
memory. This preview is not packaged into the main app.

## Remaining rollout and live checks

Approval needed: migration `20261016150000_school_mail_review.sql`, updates to the
existing inbound/extraction/retry functions, Worker and frontend. This changes
forwarded school email from automatic placement to parent review for all households.
Keep baseline frontend/function copies available; do not casually restore the old
automatic importer while reviews are pending.

1. Apply and record the migration atomically; deploy the three functions, retaining
   shared-secret protection for inbound/extraction and JWT for `capture-retry`.
2. Refresh Cloudflare login and deploy the Worker. Its saved token has expired.
   Fly connector login is also unavailable; no inbound secret was retrieved.
3. Test a real AI proposal with the synthetic normal account: zero plan writes
   before approval, corrected selected items saved once, retry returns same receipt.
4. Deploy the frontend and verify one actual forwarded-email delivery plus the
   Gmail confirmation/filter flow. These live checks are still outstanding.

Scope limits: PDFs/images are not parsed. At most 40 emails load, pending reviews
first, with up to 80 suggestions each. No review-specific Undo; saved activities
can be edited in existing views. Legacy captures say “Earlier import.” The private
pre-existing school-digest connector's homework behavior is separate and is not
enabled by this beta forwarding setup.
