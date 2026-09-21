---
name: walkthrough
description: Use when Scott wants to be walked through Symphony step by step as a new user — "onboard me", "hold my hand", "walk me through the app", "audit the flow", "/walkthrough". A joint front-to-back UI/UX audit that also drafts the real onboarding.
---

# /walkthrough — guided pass, findings log, onboarding draft

**Why:** Symphony reads as "slick if you already know what to do." The only way
to see it with a stranger's eyes is to walk it front to back with Scott as the
stranger, log every stall without fixing it, and keep the steps that read
cleanly as the onboarding. One pass, two outputs.

## Trigger

`/walkthrough [demo|real] [resume] [no-wipe] [start at <route or step>]`

Default: `demo`, wiped, from step 0. `real` never wipes and skips step 0.

## Two outputs, written as you go

| File | Voice | Holds |
| --- | --- | --- |
| `~/Documents/scotts-world/projects/symphony-os/briefs/<date>-walkthrough.md` | Auditor | §1 Setup · §2 Findings log · §3 Ranked · §4 Batches |
| `docs/onboarding.md` (repo) | New user | One section per step: Where you are · Why it exists · Do this · You'll see · Status |

Create both at pre-flight (or open them on `resume`). Append after every step.
Never hold entries in your head for a later dump.

## Pre-flight (once per session)

In this order — the surface is confirmed before anything is wiped.

1. **Surface.** Ask which URL Scott is on and who the header greets. Prod
   `app.symphony-os.com` runs `origin/main` after `git fetch` (`git rev-parse --short=8
   origin/main`; `npx vercel ls` shows the latest Production build Ready). A worktree dev
   server runs that worktree's HEAD. Greeting "Symphonygoals" = demo; "Smkaufman" = real
   (memory `feedback_confirm_surface_before_diagnosing`).
2. **Account.** `demo` = `symphonygoals@gmail.com` (uid `f9ff9f28-ea44-4763-9454-9eb4e4ea2ef7`,
   password in memory `demo_guy_blank_slate_2026_09_08`). Wipe with the vault script,
   from the main checkout root (it reads `.env` there) — dry run first, show Scott the
   counts, wipe only on his "go":
   ```bash
   S=~/Documents/scotts-world/projects/symphony-os/assets/wipe-demo-account.mjs
   NODE_PATH=./node_modules node --experimental-default-type=module -e "$(cat $S)"          # counts only
   WIPE=1 NODE_PATH=./node_modules node --experimental-default-type=module -e "$(cat $S)"   # after "go"
   ```
   The script is hard-wired to the demo uid and keeps family_members, user_profiles
   and the Chen household. It cannot touch Scott's account. `no-wipe` skips this.
   Scott reloads after the wipe; the tab holds the old rows until he does.
3. **Follow along.** Open the same route in the Chrome automation tab and look at what
   Scott looks at; screenshot findings into the vault `assets/` and embed with `![[…]]`.
   If that tab is not signed in as the demo account, ask Scott once to sign it in.
   If he would rather not, walk on his reports and pasted screenshots and say so in §1.
   Never type a password.
4. **Touch nothing else.** Do not pre-set the tag or people filter. Defaults are part
   of the audit; log what they do.
5. Write §1 Setup: date, surface, build, account, wipe state, follow-along mode,
   Scott's device.

## The loop

One step per turn, in this exact shape, then stop and wait:

```
**Step N · /route**
Where you are: <one line>
Why it exists: <one line, the product reason, no feature list>
Do this: <one action>
You'll see: <what a correct result looks like>
```

Scott answers with **next**, **back**, **skip**, **park <note>** (log without stopping),
**done**, or free text. Free text is an observation: log it, answer it in one or two
sentences, and only then offer the next step. If it needs a workaround to keep moving,
give the workaround in one line and put it in the entry's recommendation slot.

If the observation is about a route other than the step on the table, log it under
that route's own step number, then bring Scott back to the open step. The walk stays
in path order; a detour is logged, not followed, unless Scott says "continue from here".

**Every log entry has this shape** (append to §2 the moment it happens):

```
- <date> · Step N, /route · "<Scott's words, or what the screen showed>" · **<verdict>** · <blocks | slows | cosmetic> · <one-line recommendation or "—">
```

Verdicts: **understanding gap** (the model is not explained) · **copy gap** (the words on
screen mislead) · **product gap** (the obvious gesture does nothing or the wrong thing) ·
**layout gap** (right thing, wrong place or weight) · **bug**. Tiebreak: the control
exists somewhere on the page, not where the eye goes → layout gap; it exists only on
another page or behind ⌘K → product gap; it exists and does the wrong thing → bug.

Log Claude's own observations too, marked `(Claude)`: a wrong default, a hover-only
control, a count that disagrees with the rows, a phone overflow.

## Rules that hold under pressure

- **Log, don't fix.** A fix mid-pass breaks the flow and pre-empts a design call Scott
  has not made (memory `feedback_walkthrough_log_dont_fix`). Fix only what blocks the
  next step, and log the fix as its own entry.
- **The surface before the diagnosis.** A missing row is a filter, an account, or a
  stale tab before it is a bug. Check, then log.
- **No counts, no scores.** Neither in the script nor in the app copy you draft.
- **Scott's words, verbatim.** Paraphrase loses the evidence.
- **The onboarding step is written before the finding.** Each step's section in
  `docs/onboarding.md` gets its Status line only when Scott answers that step:
  `reads cleanly`, `needs #N` pointing at the finding, or `skipped`. A step Scott
  detoured away from stays open and is presented again. Do not rewrite the step to
  paper over a gap.

## The path (front to back)

Walk in this order unless `start at` says otherwise. A step Scott skips is logged as
skipped, not dropped from the script.

| # | Route | The one thing to learn |
| --- | --- | --- |
| 0 | Sign-in → first-run setup | Name the household and the people. Presented only on a dev build, forced with `localStorage.setItem('symphony.firstRun.force','1')` before sign-in. On prod a wiped account never sees it (the gate skips any account with household members): log one `(Claude)` entry under Step 0 and open with Step 1. |
| 1 | /today (empty) | The day is the page. What an empty day says and offers. |
| 2 | ⌘K capture | Something goes in fast. Where it lands and whether the app says so. |
| 3 | /inbox | Deciding is separate from capturing. One capture → a verdict. |
| 4 | /year | A goal is an outcome, not a task. |
| 5 | /season | A step under a goal. The season list vs the goal. |
| 6 | /month | Pulling from the season. What the season row shows afterwards. |
| 7 | /week — Journal | The week's own work. Planning panel: unfinished, "Plan for this week". |
| 8 | /week — Schedule | A task gets a time. Drag, and the time picker. |
| 9 | /routines | A repeating pattern, and giving one a day. |
| 10 | /today (live) | Add task by the date · Planning: "Plan for today" · Schedule · ⋯ menu · complete · "Review carried-over work". |
| 11 | Task detail | Notes, people, attachments, To-buy suggestion, back arrow. |
| 12 | Reference | /notes, /lists, meals, contacts — is context near the task? |
| 13 | Settings | Calendar connection, household, life areas, sign out. |
| 14 | Phone | Same path at 390px via the iframe recipe (memory `narrow_screen_check_without_login`). |
| 15 | Kitchen wall (optional) | What the family sees without signing in. |

## Ending ("done")

1. Rank §2 into §3: blocks first, then slows, then cosmetic; ties by how early in the
   path they hit. Keep Scott's words in each line.
2. Group §3 into §4 Batches of work that ship together (a batch is one PR). Name the
   design calls that need Scott's word before any batch starts. No fixes yet.
3. Mark every step's Status in `docs/onboarding.md`. The steps that read cleanly are
   the onboarding; the others carry their finding number.
4. Save a memory: date, surface, build, count of findings by verdict, the top three,
   and where the two files are.
5. Reply in four sentences: where the log is, the top three, the first batch, the
   design calls that block.

## Resume

`/walkthrough resume` reads the newest `*-walkthrough.md` brief, finds the last
Step N in §2, restates §1 Setup in one line, and offers Step N+1.
