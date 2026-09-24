# Usability phase — review drafts

**Review-only. Nothing here is app code, and nothing here is implemented.** Codex
leads design and review; this is the grunt work for that review.

| File | What it is |
| --- | --- |
| `planning-journey-mockup.html` | One clickable journey, standalone. Open it in a browser; no server, no build, no network calls, no storage. |
| `check-mockup.mjs` | 29 headless assertions against the mockup's own claims. `node outputs/onboarding-usability/check-mockup.mjs` from the repo root. Currently all pass. |
| [`../../docs/planning/2026-09-24-printable-planning-guide-draft.md`](../../docs/planning/2026-09-24-printable-planning-guide-draft.md) | The printable guide's content draft — the wording and the shape of the paper, with sources and open questions. |

The mockup carries a black bar at the top saying it is a mockup, and the paper-review
screen carries its own "Sample" panel. Reloading resets everything, deliberately: a
file that must not look like it saved something should not be able to.

---

## The one journey

Three screens, switched from the bar under the navigation.

**1 · The month — October 2026, the real Islanders goal.** Scott's
`Take Kaleb to an Islanders game in DC` is a month goal on October with two next
actions under it — `Research games dates and tickets` and `Buy game tickets` — and
neither has a week or a day. That is the actual state in the demo database, read
2026-09-24, and it is exactly the situation the journey has to answer.

**2 · Plan from paper (sample).** How a filled-in sheet comes back for review.

**3 · The printable guide.** The five bands, and the sources.

---

## What it is arguing, and where to push back

1. **The timing control is always there.** Today the row verbs are hover-only on
   desktop and behind a Move menu on a phone. Here every next action carries a real
   button showing its current state — "No week or day yet", "Week of Oct 11" — at
   every width. Below 620px it takes its own line rather than shrinking out of reach.
2. **Choosing happens in place.** The button opens a small panel under itself with
   October's five weeks, a date field, and "no week or day yet". No detail page, no
   modal, no navigation. One press to open, one to choose.
3. **The goal and the period survive the choice.** Each row states "October 2026 ·
   under Take Kaleb to an Islanders game in DC" and keeps saying it after a week is
   chosen; the confirmation repeats it. This is the thing walkthroughs kept losing.
4. **Saved and no-change are different sentences.** Choosing a different week says
   "Saved — … is on Week of Oct 11. Still on October, still under the goal." and
   offers Undo. Choosing the week it already had says "No change" and offers no Undo,
   because nothing happened. Clearing says what clearing did.
5. **The bigger picture is optional and honest about being empty.** "Where this sits"
   is collapsed. Opened, it shows October and then says plainly that no season and no
   year goal are chosen — which is true of this goal — and that both stay blank until
   someone chooses.
6. **Three doors, no gate.** Capture now / plan the next few weeks / set a season or
   year. One is marked as the screen you are on. The card is dismissible and comes
   back from one link. Nothing blocks anything.
7. **What October already holds stays on screen through the paper review.** The sample
   scan's "research game dates + tickets" is a line Scott already has on October under
   this goal, so the review says so and offers to attach rather than create a second
   one. A review that cannot see existing plans is how a scan turns into duplicates.
8. **The paper review is visibly a sample.** Classification and relationship are
   editable controls, uncertainty is flagged rather than resolved ("Oct 1?" stays
   unset because the question mark is on the page), blanks stay blank, and there is a
   box for telling it what the page means. It says in its own panel that no page was
   scanned, no model ran, and nothing would be created.

### Against Codex's review gates (program doc, 2026-09-24)

| Gate | Where |
| --- | --- |
| Timing usable without opening details | Month screen, points 1–2 |
| Visible goal/period relationship | Point 3 |
| No forced horizon ladder | Point 6 — three doors, dismissible, one is just "you are here" |
| Existing plans visible during review | Point 7 |
| Accurate no-change and save feedback | Point 4 |
| Paper interpretation distinguishable from commitments | Point 8, and the "not yet decided" area in the guide |
| Editable classification/relationships before approval | Paper screen, every proposal |
| No invented dates or owners | "Oct 1?" left unset; blanks called out as blanks |
| Individuals and families both supported | **Guide only.** The mockup is one person's month; the household columns and the shared/personal split live in the guide draft. Flagged as open decision 8. |
| AI dialogue proposed, not promised | The sample panel says no model ran and nothing would be created |

**Preserved unchanged:** the place tint, the skyline band (same two-layer construction
and masks as `PlaceBand`/`PlaceSkyline`), Crimson Pro headings on DM Sans body, white
cards on the tinted page. The horizon navigation is drawn as it already is and is not
part of the proposal.

---

## Acceptance baseline

Taken from Codex's `docs/planning/2026-09-24-autonomous-walkthrough.md` § Current core
coverage summary — the journeys that have actually been walked.

| Walked and verified | How the mockup answers it |
| --- | --- |
| Month task scheduling | The timing control and the inline week/day panel |
| Goal-link preservation during week carry-forward | The context line and the confirmation both name the goal and the month, before and after |
| Year → season → month links and detail navigation | "Where this sits", truthful when the chain is empty |
| Capture / triage / completion | The "capture now" door, which says the item waits in the Inbox and does not join October |
| Seven-day Week URL / reload / back / forward | Untouched — no navigation redesign |
| Failed capture recovery and Add-button retry | Untouched — that repair is already in the app |

**Not claimed, and the mockup does not pretend otherwise:** external calendar creation,
real Plan-from-paper analysis, real-iPhone keyboard and safe areas, cross-household
access, weekend and custom-range restoration. Goal archive semantics (S2-22) is still an
open product decision and is not represented.

---

## Open design decisions — for Codex

1. **Does the timing control belong on the goal too, or only on its next actions?**
   Drafted as actions-only, because a goal is an outcome for a period and has no date.
   But a reader who wants "this goal by mid-October" currently has nowhere to say it.
2. **Where the day picker sits.** Drafted as a date field inside the same panel, below
   the weeks. It could instead be a second step, which is cleaner but adds a press to
   the less common choice.
3. **How long the confirmation stays.** Drafted as persistent until the next action,
   with Undo alongside. A timed toast would be quieter but takes the Undo away with it.
4. **Whether "Where this sits" should offer to fill itself in.** It currently states the
   absence and stops. Offering "name a season goal" right there would save a trip, but
   it puts a second decision on a screen whose point is fewer steps.
5. **Whether the three doors survive first use.** Drafted as permanent and dismissible.
   They could disappear once the month has any content, which is tidier but makes the
   season/year door hard to find again.
6. **Per-item approval in the paper review.** The draft shows editable fields but no
   approve control, because a page of checkboxes may be worse than one "create these
   five" with the list visible. Needs a decision before layout.
7. **Should the mockup show a household at all?** It is deliberately one person's
   month, so the journey stays legible. The family case is carried entirely by the
   guide. If Codex wants it in the mockup, the natural place is an owner chip on each
   next action — but that is a second control on the row the whole proposal is trying
   to simplify.
8. **The child's name.** The mockup uses the real goal title, including Kaleb, because
   Scott asked for the existing Islanders example and this file is internal. The project
   convention is Liam/Mia for anything public — **this file must be changed before it is
   shown outside the team.**
