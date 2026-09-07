---
title: Wall — high-value board + widget person pages
date: 2026-09-07
project: symphony-os
status: approved, not started
surface: Claude Code, symphonyOS repo, /wall-v2
---

# Brief

THE JOB
Rebuild the kitchen wall (/wall-v2) so it shows only what a family member would want to glance at from eight feet: timed appointments on the axis, and today's rare routines, homework, and school special days beside the name. Everyday rhythm disappears from the board. Then turn the tap-an-avatar day page into a widget grid shaped for the person: kids get assignments, chores, and trackers (reading, screen time); adults get appointments, chores, the kids, needed-today, and dinner. Ship as three pushes to main, in this order, each one deployable on its own:
1. Axis carries timed items only; each person row gains a labelled off-axis "today" zone; untimed tasks leave the board for the strip.
2. The high-value rule for routines, applied everywhere the board and the row zone read routines.
3. The person page as a widget grid, kid shape and adult shape.

THE WHY
This is for the four of us reading a TV on the kitchen wall at 1024x768 from across the room. The current board floats untimed tasks on an hour axis, so the wall reads as clutter and nobody trusts it. It needs to answer "what's unusual about today for me" in one look, and the person page needs to be the place a kid or adult checks their own day.

THE GUARDRAILS
- Only touch the wall: src/components/wall-v2, src/lib/wall, and one new routine predicate in src/lib/routineUtils.ts. Leave Today, /week, Routines, and the planning pages alone; they have their own visibility ladder and the wall has never adopted it.
- The high-value rule for a routine: it earns the wall when its recurrence is monthly, quarterly, yearly, or since_last, or has an interval above 1, or is weekly/specific_days with two or fewer days, or names specific dates. Daily and three-plus-days-a-week routines are rhythm and never draw on the board or the Everyone row. Keep isEverydayRoutine as is; other surfaces and tests depend on its Mon–Fri meaning.
- Collection steps never draw on their own; the existing drop stays.
- Completed commitments vanish; completed all-day rotations (Specials) and free stays stay, because "did you have gym today" has the same answer after someone taps it done.
- Board row zone: under the name, at most three short lines, then "and N more" that opens the person's page.
- Kid page widgets, one grid, no scrolling: MY DAY (the daily routine checklist, banded morning / after school / evening, long-press to complete, no counts) owns the left column; HOMEWORK (one tappable card per assignment with its due chip; class-wide homework on both kids); TODAY AT SCHOOL (Specials + notices + the next special day such as Picture Day); READING (ring + Start timer, earns screen time); SCREEN TIME (minutes banked, parent +/-); COMING UP (this kid's next three days, one line each).
- Adult page widgets, same grid: APPOINTMENTS owns the left column (timed events, hour large, location or note beneath; free stays as a quiet line); CHORES (rare routines due today + untimed tasks assigned to me, by band, long-press to complete); THE KIDS (each child's special today plus any handoff I'm driving; tapping a kid's name opens their page, one level deep and no deeper); NEEDED TODAY (the existing needed-today items for this person); DINNER (tonight's meal, opens the existing recipe viewer); COMING UP (my next three days).
- Header on both pages: avatar, name, day, one "Next:" line with the next timed thing, weather chip. Both pages reuse the existing full-screen overlay, idle-close, and toggle handlers.
- The wall is a Raspberry Pi touchscreen where touch is a mouse: targets 80px or larger, no hover states, no drag, no modals. No emoji; lucide icons. No counts or scoreboards on rows. Fixed-pixel and preview-mode traps are real on this device, so check the layout in a 1024x768 iframe with the demo account, not by resizing a desktop window.
- Work in a feature worktree off origin/main, never in the main worktree. Each push to main deploys to production, so each of the three parts must build and pass tests before its push.
- Make routine judgment calls yourself: widget proportions, band ordering, wording. Ask only if the high-value rule turns out to hide something on the real wall that a family member would obviously want.

DONE MEANS
- Unit tests cover the routine predicate (each recurrence shape) and the board adapter (timed items on the axis, high-value untimed items in the row zone, everyday routines absent from every row including Everyone, untimed tasks in the strip only).
- A 1024x768 screenshot of the live wall, one kid page, and one adult page, saved to the vault under projects/symphony-os/assets, showing the real family's data.
- Three commits on origin/main, one per part, each deployed.
- Report: the three commit hashes, the screenshot paths, and three short bullets on what changed. Nothing more.

Before reporting progress, audit each claim against a tool result from this session. Only report work you can point to evidence for; if something is not yet verified, say so explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step was skipped, say that; when something is done and verified, state it plainly without hedging.

# Mockups (1024x768)

Kid page:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ●Ella   Monday, Sep 7          Next: FFG at 6:30 with Kaleb     ☀ 80°│
├───────────────────┬───────────────────────┬──────────────────────────┤
│ MY DAY            │ HOMEWORK              │ TODAY AT SCHOOL          │
│ ○ Make bed        │ ▢ Math sheet   due Tue│ Visual Art               │
│ ○ Pack lunch      │ ▢ Reading log  due Fri│ Picture Day Thursday     │
│ ● Brush teeth     │                       │ Bring a water bottle     │
│ ○ Hamper          ├───────────────────────┼──────────────────────────┤
│ ○ Read 20 min     │ READING          ◔ 12/20 │ SCREEN TIME            │
│                   │ [   Start timer    ] │   35 min banked   − +     │
│                   ├───────────────────────┴──────────────────────────┤
│                   │ COMING UP   Tue Library · Wed Music · Fri FFG    │
└───────────────────┴──────────────────────────────────────────────────┘
```

Adult page:

```
┌──────────────────────────────────────────────────────────────────────┐
│ ●Scott  Monday, Sep 7          Next: Dentist 4:00 · then FFG 6:30 ☀ 80°│
├───────────────────┬───────────────────────┬──────────────────────────┤
│ APPOINTMENTS      │ CHORES                │ THE KIDS                 │
│ 4:00  Dentist     │ ○ Laundry (Sat)       │ Ella  Visual Art · FFG   │
│       Main St     │ ○ Take out bins       │ Kaleb PE · FFG           │
│ 6:30  Ella & Kaleb│ ○ Respond to Christian│ 6:30 you drive to FFG    │
│       to FFG      │ ○ Add weeding         │                          │
│                   ├───────────────────────┼──────────────────────────┤
│                   │ NEEDED TODAY          │ DINNER                   │
│                   │ Bench receipt         │ Tacos                    │
│                   │ Rug measurements      │ [ Open recipe ]          │
│                   ├───────────────────────┴──────────────────────────┤
│                   │ COMING UP   Wed Wheelies · Sat Bicycle Connection│
└───────────────────┴──────────────────────────────────────────────────┘
```

# Decisions made in the interview (2026-09-07)
- Everyday rhythm leaves the wall entirely, including the Everyone row. Kid pages keep the daily checklist.
- Threshold: ≤2 days/week, or any interval / monthly / quarterly / yearly / since_last / specific dates.
- Board keeps the time axis for timed items only; untimed tasks go to the strip; untimed high-value items sit in a labelled off-axis zone on the row.
- Person page is widget/graphical, reached by tapping the avatar (already wired for every member; today's page is kid-shaped).
