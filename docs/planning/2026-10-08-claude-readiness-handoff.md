# Friends-and-family readiness: Claude handoff

October 8, 2026. Work from Claude Code on the readiness assessment and the live new-user walkthrough. Nothing is merged or deployed: every change is in a PR to `main` (#166 is stacked on #160) or in the local integration branch. Production was read but never changed: no deploys, no migrations, no edge-function deploys, no auth or dashboard settings, no account resets, and no invites. Read-only SQL was used to confirm policies and indexes.

## PRs

| PR | Branch @ head | Worktree | What it does |
| --- | --- | --- | --- |
| [#160](https://github.com/scottring/symphonyOS/pull/160) | `claude/beta-persistence` @ `7e73da8b` | `.worktrees/beta-persistence` | Setup only finishes once the household and people are saved. Retries keep stable person ids. Guide progress has a dated Stop, a serialized save queue with version-checked acknowledgements, and an in-memory current copy. |
| [#161](https://github.com/scottring/symphonyOS/pull/161) | `claude/ff-auth-callback` @ `4038e74d` | `.worktrees/ff-auth-callback` | Expired or used email links are explained, with a choice between a confirmation resend and a password reset. Other link errors show the provider's own text. Signup faults aren't relabeled invite-only. |
| [#162](https://github.com/scottring/symphonyOS/pull/162) | `claude/ff-first-success` @ `a6d4f00a` | `.worktrees/ff-first-success` | After the first task, a quiet "Your first thing is on Today" line with optional next steps. |
| [#163](https://github.com/scottring/symphonyOS/pull/163) | `claude/ff-filter-feedback` @ `49ac7640` | `.worktrees/ff-filter-feedback` | A new item hidden by the people or area filter gets a durable notice and a view-only Show it, plus an active-filter line. |
| [#164](https://github.com/scottring/symphonyOS/pull/164) | `claude/ff-page-purpose` @ `66bb641d` | `.worktrees/ff-page-purpose` | Year/Season/Month get a purpose line, an empty-list example, Saved to…, Next…, and Plan or Resume guidance. Close the day confirms and marks Reviewed. The older-work wording is corrected. |
| [#165](https://github.com/scottring/symphonyOS/pull/165) | `claude/ff-paper-next` @ `ff59a689` | `.worktrees/ff-paper-next` | After a paper import: a next-step panel with Continue planning and Done for now. No goal/task choice above the week. Photo-reader instructions keep the user's words (needs a `parse-page` redeploy). |
| [#166](https://github.com/scottring/symphonyOS/pull/166) | `claude/ff-tour` @ `fda981eb` (base `claude/beta-persistence`) | `.worktrees/ff-tour` | Optional "Show me where things go" coach on the guided plan. It points at one real control, waits for the real save, then says where the item went. |

Each PR body lists its exact changed files, copy, tests, and limits. Worktrees live under `/Users/scottkaufman/Developer/Developer/symphonyOS/`.

**Suggested merge order:** #160 → retarget #166 to main → #161, #162 → #163 → #164 → #165. #163, #164, #165, and #166 touch the same planning pages. Conflicts are small; their resolutions are shown in the integration branch.

## Integration candidate

- **Branch:** `claude/ff-integration` (local and pushed; not a PR). Worktree: `.worktrees/ff-integration`. It contains every head above, merged from origin/main `d2146693` (checked with `git merge-base --is-ancestor`).
- **Conflicts resolved:**
  - `TodayView.tsx`: Today's filter notice sits above the add bar, and the bar keeps `data-guide-target="today-add"`.
  - `PlanPageV2.tsx`, `YearPageV2.tsx`: after an add, the filter notice shows when the item is hidden (it already names where the item was saved); otherwise "Saved to …" shows. This avoids two "Saved to" lines.
  - `WeekV2.tsx`: the "Add to this week" button carries both the guide anchor and the paper hint's `aria-describedby`.
  - `index.css`: both blocks kept.
- **Checks on the integration branch:**
  - `tsc -p tsconfig.app.json` is clean.
  - `npm run build` passes.
  - Full `vitest run`: 790 files, 8260 passed, 3 skipped, 0 failed.
  - ESLint shows 0 errors. There are 3 new `react-refresh/only-export-components` warnings: 2 in `PlanPurpose.tsx` (from #164) and 1 in a changed file. They are dev-only fast-refresh warnings with no runtime effect.
- **Local URL:** http://localhost:5198. It's a `vite preview` of the integration build started in the background for this session. It won't survive a reboot. To restart:

```
cd .worktrees/ff-integration
npm run build
npx vite preview --port 5198 --strictPort
```

- Port 5198 has **no saved session**, so it shows the sign-in screen. Sign in there with a disposable test household.
- Port 5196 holds the signed-in session of Scott's personal account (smkaufman@). Don't use 5196 for testing that writes data.
- The app talks to the **production Supabase project**; there is no local or staging database. Anything done while signed in is real data.

## Verification: what was proven and how

**Mocked (unit and component tests, Supabase faked):** every PR has regression tests, and each fails on the code it fixes (counts are in the PR bodies). These tests don't prove email delivery, Google consent, RLS, or cross-device behaviour.

**Actual browser (Chrome, local `vite preview` builds):**
- **#161 auth, signed out, nothing written:**
  - The expired-link hash URL shows the explanation and resend form; focus lands on the heading; the error params are stripped.
  - The 390px iframe harness has no sideways scroll.
  - An unknown error with `<b>` in its description renders the tag as text, and the unrelated `?x=1` param survives.
  - The reset/confirm choice added after review is covered by tests only.
- **#162 first-success, view-only on Scott's account:** the record was forced via localStorage and removed afterwards. It renders on desktop above the masthead. At 390px there's no sideways scroll and the targets are 44px.
- **#163 filters, view-only:** with the area view set to Family only, Month shows "Showing only Family · Show all areas". Clicking it restored all four areas, and the original value was confirmed afterwards. The post-add notice wasn't exercised, because it needs a write.
- **#164 page purpose, view-only:** Season on desktop and Year at 390px show the purpose line, the Next link, and Plan with guidance, with no sideways scroll. Saved to, Close the day, and Reviewed weren't exercised, because they need writes.
- **Integration (#165 panel and interactions), view-only on Scott's account:**
  - The import panel was injected through sessionStorage (local only). On desktop and at 390px it sits clear of the dock (panel 585–705px, dock 777px and below) with no sideways scroll.
  - Continue planning opens Week 41 with October expanded and the "From your page" hint. Both session keys were cleared afterwards.
  - Open observation: on the phone Week page, the month-reference rows show large empty squares before each title. I didn't compare this against origin/main, so it may be pre-existing.
- **#160 and #166:** no browser check. Setup needs a new account. Starting a guided run saves guide progress to the signed-in account, and the only session available was personal.

## Outstanding limits and decisions

1. **Rehearsals still to run with disposable test households** on port 5198 or a preview deployment:
   - fresh signup and setup, including a forced setup failure and retry;
   - a guided run with the coach on, on desktop and a real phone;
   - pausing on one device and resuming or stopping on a second;
   - a paper import (it uploads a photo and calls `parse-page`);
   - an add hidden by a filter;
   - Close the day and the Reviewed mark.
2. **Supabase dashboard (not done, needs Scott):**
   - Brand the confirmation emails as Symphony.
   - Optionally add a flow marker to the reset and confirm redirect URLs, which would need the redirect allowlist checked.
3. **`parse-page` edge function:** the title-preserving prompt only takes effect after a redeploy.
4. **Behaviour change in #164:** Close the day writes an `evening_reflections` row even when the reflection is blank (upsert on `(user_id, date)`). That row is the Reviewed mark.
5. **Known gaps:**
   - Covered by tests but never exercised in the browser:
     - the ⌘K and Year paths of #163;
     - Today's "default assignee" rule in #163, which repeats the one in `HomeViewContainer` rather than sharing it.
   - The other "Plan from paper" flow (from Today and the sidebar) still has its own goal/task choice.
   - The coach doesn't detect a routine chosen for Today, and paper imports on the Year step are untraced.
   - An unconfirmed sign-in still shows the raw "Email not confirmed".
   - The iOS app has the old invite-only classification.
   - First-success persistence is per browser.
6. **Independent-review findings on #160:** all three are fixed with regression tests (comments on #160). The reviewer's first guide repro expects two writes in flight at once, which the queue now prevents, so it fails with `pending[1] is not a function`. The same scenario is covered by `an older success never claims a newer, failed save reached the account`.
