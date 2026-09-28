# Due routines with Show in Today on: on their days, untimed (2026-09-27)

Branch `claude/today-daybound-routines`, from main `6653a7e6`. It is local only: not pushed, merged or deployed. No migration is needed, and no user records were edited.

## The bug

"Water houseplants every weekend" is Active, Show in Today on, Every Sun, untimed. On Sunday it was missing from Today's main list and appeared only in Shelves ("Choose … for today" off).

The cause was `selectDayPlan` (`src/lib/today/dayPlan.ts`). It sent every untimed, unpinned occurrence to the chooser unless its instance had `planned_on` set, even when the recurrence already named the day. The week journal (`routineDayState`) made the same split.

## Final semantics (after Codex review of 9830ae80)

**A routine is on its due days, untimed, with no second "Choose" when both hold:**
1. Show in Today is positively on: `show_on_timeline === true`.
2. Its rule names its due days (`namesDueDays`): `daily`; `weekly` with any listed days (Sun; Tue/Thu; Sat+Sun); `monthly`; `quarterly`; `yearly`; `specific_days`.

Where it shows:
- On Today it is on the main list once (in the untimed "For today" group). The chooser lists it as "On today's schedule", never offered, and it is not counted as a choice.
- On the Week journal it is one of the day's untimed entries. Schedule's all-day cell shows it too, because it reads the journal.

**Still a choice (offered in Shelves, not placed):**
- A rule that leaves the day open: the `weekend` window ("either day, once"), `since_last`, or weekly with no days.
- A routine whose Show in Today is `null` ("not said"). This is never read as a deliberate choice.

**Off Today** (`false`) keeps it off Today and the week entirely, as before.

**Hide daily** (the generic sweep) yields to a routine positively set to show in Today on a day it is due. It still sweeps everyday routines that did not say (`null`). With no day at all (`date: null`, the guided session's drag pool) it sweeps as before, so planning pools are unchanged.

**Unchanged:**
- frequency and occurrence identity;
- actual recurrence dates, interval weeks, and pauses (resting);
- skips, completions (one occurrence, done), and deferrals (moved away = absent);
- privacy, people and life-area filters;
- the completed fold and collection de-duplication (a collection shows once, with its steps inside);
- timed routines (at their time) and pinned/dosed routines.

**Copy:** the On Today helper now says what will happen:
- timed: "Takes a row on Today and the week grid at its time."
- names its due days: "On Today and the week on each day it's due — no time needed."
- leaves the day open: "Offered on Today to choose — it has no set day."

## Unavoidable ambiguity: documented, no records changed

`routines.show_on_timeline` is nullable with **default `true`**. Production today, counted without reading any content, has **93 routines `true`, 12 `false`, 0 `null`, 0 pinned**. A routine saved with the default is therefore indistinguishable from one switched on. As implemented, "explicit On wins over hide-daily" means:
- **Hide daily no longer hides any of the 93** on a day they are due.
- **Every untimed daily or listed-day routine with Show in Today on now appears on Today and the week on its days**, instead of waiting to be chosen.

To keep one off Today, switch it Off Today; that setting is respected everywhere. No stored values were changed to hide this. If Scott wants hide-daily to keep sweeping by default, that needs a real "explicitly shown" signal (a new column or a data decision), which is not in this change.

## Evidence

- **Unit and component tests.** Full suite: 7,501 pass. The one failing file is the connectors WhatsApp dependency, as on main. `tsc` and eslint are clean.
  - `dayPlan.test.ts` (due-routines block) covers:
    - Sunday: once, untimed, "on today", not offered; Saturday: absent;
    - daily: every day;
    - Tue/Thu: Tuesday yes, Wednesday no;
    - explicit Sat+Sun: on both days, while the weekend window stays a choice;
    - since-last: a choice; Off Today: absent; `null`: offered;
    - generic hide-daily vs explicit On (and still sweeping the unspecified, keeping pinned);
    - chosen: no duplicate; completed, moved-away and skipped cases;
    - paused: absent; timed keeps its time; monthly and listed dates;
    - assignee lens and layers; a collection shows once.
  - `dueRoutineParity.test.ts`: Today and the Week journal give the same "on the day" set and the same "offered" set for daily, Sun, Sat+Sun, Tue/Thu, weekend window, unspecified and off routines on Sunday.
  - `WeekViewV2.test.tsx`: a due routine is one Sunday entry in the journal and the all-day cell, Monday is empty, and the Routines switch still hides it.
  - `weekDensity.test.ts`, `weekRoutineChoices.test.ts`, `statusMaps.test.ts`, the visibility corpus (explicit On beats hide-daily on a due day, with `date: null` unaffected), and `todayParity.test.ts` (the divergence from the frozen legacy pipeline is declared) all cover this change.
  - Hide-daily tests in Today, Week, Month and River keep their intent, using fixtures whose Show in Today is `null`.
- **Local stack**, as the fictional Sky on Sunday Sep 27 (`outputs/today-daybound/t4.mjs`):
  - Today's main list has Water houseplants (Every Sun), Kids clean rooms (Sat+Sun) and Vitamins (daily), each ×1, with no times.
  - Piano (Tue/Thu), the weekend window, Saturday-only and Off Today are absent.
  - The Week journal's Sunday entries and the Schedule's Sunday all-day cell list the same three.
  - Earlier checks (`t2`, `t3`): Shelves shows "On today's schedule" with no Choose, and at 390px there is one row and no sideways scroll.
