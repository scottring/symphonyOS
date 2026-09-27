# Today: a routine whose rule names the day is on that day (2026-09-27)

Branch `claude/today-daybound-routines`, from main `6653a7e6`. It is local only: not pushed, merged or deployed, and it needs no migration.

## Bug

"Water houseplants every weekend" is Active, On Today, Every Sun, untimed and assigned to Scott. On Sunday it was missing from Today's main list and appeared only in Shelves › Routines ("Choose … for today" off). No records were changed.

The cause was in `selectDayPlan` (`src/lib/today/dayPlan.ts`). It sent every untimed, unpinned routine occurrence to the chooser (`available`, `offMainRoutineItemIds`) unless its instance had `planned_on` set. This happened even when the recurrence already selected the day, and even though `resolveRoutine` showed it.

## Fix

A new `isDayBoundRoutine` in `src/lib/routineUtils.ts` answers whether the rule names the day. It returns true for:
- weekly with exactly one day, at any interval;
- monthly, quarterly and yearly;
- `specific_days`.

`selectDayPlan` treats such an occurrence like a timed or pinned one:
- It is on the main list, with no time invented (it lands in the untimed group of "For today").
- It is listed once in the chooser, as "On today's schedule" (`onToday`).
- It is not counted as a choice and is not on the week's To-plan list.

Unchanged, and still offered as a choice:
- `daily`, and Mon–Fri weekly (the hide-daily setting still governs these);
- weekly with two or more days, e.g. a Sat+Sun chore, which is the "wall of weekend chores" decision of 2026-09-19;
- the `weekend` window;
- `since_last`.

Visibility is also unchanged. Off Today, resting, layers, people, and occurrences that are skipped, completed or moved away all come from `resolveRoutine` and the instance, exactly as before.

**Copy.** The On Today helper in `TapRoutinePanel` now says what will happen:
- a timed routine: "at its time";
- a day-bound routine: "On Today on the days it repeats — no time needed";
- a flexible routine: "Offered on Today to choose — it has no set day".

**Behaviour change.** A biweekly one-day routine ("every other Saturday") is now on Today on its week instead of waiting to be chosen. The existing test was updated to match.

## Evidence

- `dayPlan.test.ts` has a new block covering:
  - Sunday untimed: on the main list once, in the untimed group, "on today" in the chooser, never offered;
  - Saturday: absent;
  - Off Today: absent;
  - already chosen: still one row;
  - completed: one row, done;
  - moved away: absent;
  - skipped: identical to a timed routine's handling;
  - flexible weekend window / Sat+Sun / daily / since_last: still choices, with hide-daily still hiding daily only;
  - timed: keeps its time;
  - monthly and listed dates: day-bound;
  - assignee lens and layers still apply;
  - a Sunday collection: on the list once with its steps inside, while a Sat+Sun collection stays a choice.
- `TapRoutinePanel.test.tsx` covers the copy.
- Full suite: 7,489 pass. The one failing file is the connectors WhatsApp dependency, as on main. `tsc` and eslint are clean.
- Local stack, as the fictional Sky on Sunday Sep 27 (`outputs/today-daybound/`):
  - "For today" shows the Every-Sun routine once, untimed.
  - The Sat+Sun chore, weekend window, Saturday-only and Off-Today routines are not on the main list.
  - In Shelves › Routines, the Every-Sun routine reads "On today's schedule" with no Choose; the flexible ones offer Choose.
  - At 390px it appears once, with no sideways scroll.
  - No real-account data was read or written.

## Not changed: open for a decision

- **The week page** (`WeekViewV2` journal and Schedule, via `routineDayState` in `weekDensity.ts`) still treats an untimed one-day routine as "available", not an entry. Aligning it changes two deliberate week tests, and must move the journal and the Schedule grid together. It is left for a separate, explicit change.
- **Multi-day weekly rules** (e.g. Tue+Thu) remain choices, which is conservative. Say if those should be day-bound too.
