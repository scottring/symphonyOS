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
- [ ] Log in fresh → onboarding flow appears (not a blank/broken screen)
- [ ] Every onboarding step: copy, inputs, back/forward, skip paths
- [ ] Household/family setup during onboarding
- [ ] Sample plan page (`/onboarding/sample`) if offered
- [ ] Landing after onboarding — where do you end up, does it make sense empty?
- [ ] Empty states: Today, inbox, projects, goals — anything broken/ugly at zero data?
- [ ] First quick captures (5–10 tasks): speed, focus behavior, enter-to-add
- [ ] Triage from inbox: schedule (Today/Tomorrow/date), context tag, assign
- [ ] Scheduled task appears on Today timeline correctly
- [ ] Complete + undo a task
- [ ] Realtime: change on one screen appears on the other

**Findings:**

_(none yet)_

---

## Session 2 — Today deep pass

**Checklist:** timeline rendering, drag/reschedule, detail panels (task/event), quick capture from Today, domain switcher, assignee filter, carried-over, Up Next hero, unscheduled section.

**Findings:**

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
