# Launch rehearsal findings — evaluation + fixes (2026-09-04)

External reviewer ran a rehearsal on the signed-in demo account and filed six
launch-blockers plus polish items. Each was checked against the code and the
live database before anything was changed. Verdicts and fixes below.

## Launch-blocking

### 1. Demo reset is broken — CONFIRMED, two separate bugs
`loadDemoData` inserted into a `task_links` table. **That table does not exist**
in the database (verified against `information_schema`; the only reference to it
anywhere in the repo was this one insert). Every load threw there.

`resetDemo` clears first, then loads — so the clear succeeded, the load died,
and the account was left half-empty, exactly as reported.

The `Unknown error` was a second, independent bug: the catch read
`error instanceof Error ? error.message : 'Unknown error'`, and a
Supabase/PostgREST error is a **plain object**, not an `Error`. Every database
failure in this file rendered as the literal string "Unknown error".

Fixed:
- The link now rides the project insert on `projects.links` (jsonb), which is
  where links actually live. The demo keeps the link DemoControls advertises.
- `describeError()` reads the PostgREST shape (message/details/hint/code).
- `clearDemoData` now **checks** each delete's error. They were all discarded,
  so a clear blocked by RLS still reported success and the caller reseeded on
  top of the leftovers.
- A reset whose reload fails now says the account is empty and to press
  "Load Data", instead of leaving the operator guessing.

### 2. Admin/waitlist exposure — CONFIRMED, and worse than reported
Not just a UI problem. The `waitlist` table's RLS granted **SELECT, UPDATE and
DELETE to the `authenticated` role with `USING (true)`**. Any signed-up user
could read every waitlist email address and delete the list, from the browser
console — hiding the tab would have been theatre.

There was no admin concept in the database at all.

Fixed (`supabase/migrations/2026-09-04_app_admins_waitlist_rls.sql`, applied):
- `app_admins` table + `is_app_admin()` SECURITY DEFINER predicate. No INSERT
  policy — membership is granted by migration or service role, never self-serve.
  A user can SELECT only their own row, so the roster never leaks.
- Waitlist SELECT/UPDATE/DELETE now require `is_app_admin()`. The **anonymous
  INSERT policy stays** — the landing page signup depends on it, and
  insert-only is not a read hole.
- Seeded `smkaufman@gmail.com` as admin, by email lookup rather than a
  hardcoded uuid.
- Client: `useIsAppAdmin()`; the Settings Admin tab (demo controls + waitlist)
  no longer renders for non-admins.

### 3. Date/time parsing — CONFIRMED, reproduced both cases
Reproduced directly against chrono-node with a fixed reference date:
- `"…soccer at 6"` → **06:00**. chrono leaves a bare hour as written.
- `"dentist thu 2pm"` typed on a Friday → **Thursday Sept 3, yesterday**.
  chrono resolves a bare weekday to the closest one *in either direction*, so
  the task arrived already overdue.

Fixed in `quickInputParser` (`resolveDateMatch`), not by replacing chrono:
- A bare hour of 1–6 with no meridiem reads as PM. 7+ is genuinely ambiguous
  (7am school run vs 7pm dinner) and is left alone. Matches the heuristic the
  older `parseNaturalDate` already used, so the two parsers agree.
- If the corrected time is still in the past **and the text named no calendar
  date**, chrono's own `forwardDate` reading of the same text is used.
  A named date is deliberate — `"sept 1 review"` stays in 2026 rather than
  being pushed to 2027, and `"call mom yesterday"` stays yesterday.

8 new tests pin both bugs and the three ways over-correcting would break things.

### 4. Paper Plan imports times as notes — CONFIRMED
The `parse-page` prompt had no `time` field and explicitly told the model to put
`'before 3pm'` in `note`. `planItemToAddTaskArgs` then hardcoded
`isAllDay: true`. So "Dentist 2pm" could only ever land as an all-day chip.

Fixed end to end:
- Prompt gains a `time` field ("HH:MM", 24h) and a rule that a clock time on an
  item line goes there, never into `note` or the title — plus the same bare-hour
  evening rule the typed parser now uses, so paper and keyboard agree.
- Validated server-side and again client-side; a time only survives on a real
  date placement (nothing renders one on This week / Inbox).
- `planItemToAddTaskArgs` writes a real block at that time with
  `isAllDay: false`; no time still means an all-day chip.
- The review sheet shows the parsed time in an editable field, so a misread is
  visible and correctable **before** anything is written. Changing a row off a
  date clears its time.

Edge function deployed.

### 5. Cross-module routing — PARTLY FIXED, partly a real feature gap
Two different things were reported together:

**Grocery/list intent — fixed.** The "To buy" nudge already existed, but it only
rendered on the **Today timeline**. A captured "Buy strawberries" that was never
scheduled had no route onto the list at all — it just sat in the inbox. The
nudge now also renders in the inbox, which is where the triage decision actually
belongs.

**Meal intent ("Dinner: tacos" → a meal) — NOT built.** There is no
task→meal routing anywhere in the product. This is a feature, not a bug, and it
touches the meal planner's week/day model. Deliberately not built blind; it
needs a decision about whether capture should route into meals automatically or
suggest-and-confirm the way "To buy" does.

### 6. Inbox state contradicts itself — CONFIRMED
`ShellLayout`'s badge counted **every** inbox task. `InboxView` renders tasks
filtered by the active domain layers. An item in an unchecked layer therefore
showed as "1" in the chrome while the inbox and Focus mode both said "Inbox
zero". The badge now runs the same `filterTasksForLayers` the view does.

## Polish

- **"Looks like a purchase" on "Pick up Michael"** — CONFIRMED. `isBuyish`
  matched a bare `^pick up`. It now rules out "pick up X **from/at** somewhere"
  (a school run, whoever X is) and "pick up \<a known household member or
  contact\>". "pick up milk" and "buy a rug from Etsy" still nudge.

## Not addressed in this pass

- Week grid chip truncation.
- Empty states leaning on keyboard shortcuts.
- Explaining whether Work/Family/Personal are privacy buckets or planning
  categories (they are both — worth saying so in the UI).
- Landing page claim audit. "scheduled, assigned, and placed" is now *more*
  true for paper-plan times than it was, but the claim should still be re-read
  against behavior. Note the landing deploy is manual (`vercel --prod` inside
  `landing/`); a push to main does not ship it.
- Meal routing (see #5).

## Verification

- `npx tsc --noEmit -p tsconfig.app.json` — clean.
- `npx vitest run` — 5311 passed, 3 skipped. One pre-existing unrelated failure:
  `connectors/src/whatsapp/adapter.test.ts` cannot resolve
  `@whiskeysockets/baileys` (needs `npm install` inside `connectors/`).
- `npm run build` — clean.
- Waitlist policies re-queried after the migration to confirm the lockdown and
  that the anonymous signup insert survived.
