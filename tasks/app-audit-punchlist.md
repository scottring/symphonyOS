# App Audit Punch List

Living findings log for the fresh-account walkthrough audit.
Spec: `docs/superpowers/specs/2026-07-20-app-audit-walkthrough-design.md`
Account: `symphonygoals@gmail.com` — reset to true zero (onboarding cleared) 2026-07-20.

**Severity:** P0 blocker · P1 broken · P2 janky · P3 polish
**Status:** open · fixing · fixed+verified

## Finding template

```
### [P?] Short title (surface)
- Repro:
- Expected:
- Actual:
- Diagnosis:
- Status: open
```

---

## Session 1 — First run (onboarding → capture → triage)

**Checklist:**
- [x] Log in fresh → lands on Today (onboarding removed per S1 finding; verified 2026-07-20)
- [x] ~~Every onboarding step~~ — n/a, onboarding removed
- [x] ~~Household/family setup during onboarding~~ — n/a; family setup covered in S4
- [x] ~~Sample plan page~~ — n/a, route removed
- [x] Landing after login — Today, "Your day is clear" empty state renders correctly
- [x] Empty states: Today, inbox, projects, goals — all pass (Scott, 2026-07-20)
- [x] First quick captures — 6 tasks captured, no issues
- [x] Triage: dates (today + Aug 1), context=family, assignee all set correctly; bucket='timed' invariant holds in DB
- [x] Scheduled tasks appear on Today (All day section)
- [x] Complete + undo — works (Scott); DB state clean after undo
- [x] Realtime Scott→parallel session: captures + triage appeared live, no refresh

**Session 1 complete 2026-07-20 — one finding (fixed+verified). Deferred P3s: fresh-account greeting shows “Good morning, Symphonygoals” (email-derived name; no name prompt exists post-onboarding-removal) and briefly “Good morning, there” before profile load.**

**Findings:**

### [P1] Only onboarding that exists is meal-planning onboarding (onboarding)
- Repro: fresh account (onboarding_completed_at null) → log in → redirected to /onboarding
- Expected: general Symphony first-run (tasks/planning/domains — the whole product)
- Actual: entire flow is meal-first: Welcome copy "plan the week your family actually eats" + meal preview cards; HouseholdScreen "Who's eating?" (kid mods, portions); GoalsScreen options like "cook once, eat thrice"; RhythmsScreen "Any nights you don't cook?". Sample page is "Family Meal Plan".
- Diagnosis: v2 flow was built as a meal-first first-run (`2500507e feat(onboarding): meal-first first-run flow`); a later commit (`0bd9bdad`) removed the meal habits/brief/generate *steps* but all copy/framing stayed meal-specific. There is no general onboarding — v2 is the only flow, mounted at /onboarding by AuthGate. Completion works (NowWhatScreen sets onboarding_completed_at), so it's passable, just wrong-product framing.
- **Decision (Scott, 2026-07-20): REMOVE the meal onboarding entirely** — it's from an older version of the meal feature (pre chat-first rebuild). Fresh users land straight on Today's empty state. A general onboarding is a separate future design task.
- Status: fixed+verified (2026-07-20, prod f7f0275c) — meal onboarding removed; verified on demo account: fresh login lands directly on Today's empty state, no redirect, no console errors (one transient weather refetch timeout). Removal map (executed):
  1. `src/main.tsx` — drop `/onboarding` + `/onboarding/sample` routes (~L155-156) and the `OnboardingFlow, SamplePlanPage` lazy import (~L97).
  2. `src/components/lazy.ts` — drop `OnboardingFlow`, `SamplePlanPage`, `HelpPanel` exports (~L53-62).
  3. `src/components/auth/AuthGate.tsx` — strip the whole onboarding check (state, useEffect, supabase query, `<Navigate to="/onboarding">` at ~L143-147); gate becomes auth-only. Remove now-unused `Navigate` + `supabase` imports.
  4. `src/components/auth/AuthGate.test.tsx` — remove supabase/onboarding mock + the "redirects to /onboarding" test; retitle "signed in and onboarded" test.
  5. `src/shell/ShellLayout.tsx` — remove `HelpPanel` import (L11), `helpOpen`/`helpButtonRef` (L114-115), the "?" button (~L323-332), render block (~L478-483).
  6. `src/apps/tasks/TasksApp.tsx` — remove `HelpPanel` import, `helpButtonRef`/`helpOpen` state, help fields from the chrome memo, render block (~L72-77); `Suspense`/`useRef`/`useState` imports become unused — clean up.
  7. `src/contexts/AppShellChromeContext.tsx` — remove `helpOpen`/`onHelpOpenChange`/`helpButtonRef` from the interface.
  8. `src/components/home/HomeHeader.tsx` — remove "?" button (~L142-149) + help destructure (L43).
  9. Delete `src/components/onboarding/` (whole dir), `src/contexts/OnboardingContext.tsx`, `src/hooks/useOnboarding.ts`.
  10. Keep `user_profiles.onboarding_completed_at` column + `src/types/userProfile.ts` field (DB mirror, harmless; demo account's flag is currently null — irrelevant once gate is gone).
  - Verified no other consumers: HelpPanel used only by ShellLayout/TasksApp/HomeHeader "?" wiring; OnboardingContext/useOnboarding only by v2 screens; no GeneratePlanProvider/OnboardingShell/WHITMAN refs outside `src/components/onboarding/`.
  - After edits: `npm run build` + `npx vitest run`, push to main (auto-deploys).

---

## Session 2 — Today deep pass

**Checklist:** timeline rendering, drag/reschedule, detail panels (task/event), quick capture from Today, domain switcher, assignee filter, carried-over, Up Next hero, unscheduled section.

**Findings:**

### [P1] Assign picker shows 9 duplicate "symphonygoals" family members (detail panel)
- Repro: fresh account first load → open any assign-to-family picker
- Expected: one self member row
- Actual: 9 identical rows, all created within ~70ms of first login (10:55:54Z)
- Diagnosis: useFamilyMembers auto-seed race. The 2026-06-27 fix added a DB re-check before insert, but N simultaneously-mounted hook instances all pass the empty-check before any insert lands; per-instance seedingRef can't serialize across instances. NOT demo-only: real users tim.rappold (2 dupes) and meganhryan (3 dupes) had the same corruption.
- Fix (2026-07-20): (1) data repair — for every affected user kept oldest self row, repointed all 16 FK columns referencing family_members, deleted dupes; (2) DB partial unique index `family_members_one_self_row` (one is_full_user/null-auth_user_id row per user_id) applied to prod + recorded in supabase/migrations/2026-07-20_family_members_one_self_row.sql; (3) module-level shared seed promise in useFamilyMembers + adopt-winner-on-insert-failure; regression test w/ stateful mock DB.
- Status: fixed+verified (2026-07-20) — picker shows exactly one member on demo account, task assignment intact after FK repoint; code fix 95cae0b2 with regression test; unique index live in prod blocks any recurrence

---

## Session 3 — Planning

**Checklist:** Five Horizons wizard end-to-end, goals page + sharpen, month/year grids drag-to-place, week→today cascade, per-domain sessions.

**Findings:**

---

## Session 4 — Structure

**Checklist:** projects (create/view/link tasks), routines (create/steps/pause/Today surfacing), lists + items, contacts, family page.

**Findings:**

---

## Session 5 — Life systems

**Checklist:** meals (chat-first planner, recipes, week plan), morning/bedtime pages, meds, history, settings (every pane).

**Findings:**

---

## Session 6 — Mobile pass

**Checklist:** phone browser on same account — responsive layout, bottom-sheet panels, capture, triage icons, timeline touch interactions.

**Findings:**

---

## Cross-cutting (log anytime)

⌘K assistant, realtime sync misses, console errors, slow loads, visual inconsistencies.

**Findings:**

---

## Known gaps (excluded from this audit)

- Physical wall Pi + kid-phone (real household only); `/wall-v2` smoke check in browser only.
- Google Calendar flows — demo account has no calendar connection; test later on real account.
