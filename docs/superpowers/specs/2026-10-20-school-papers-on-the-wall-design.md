# School papers on the wall — design

**Date:** 2026-10-20
**Status:** Draft for Scott's review
**Author:** Scott + Claude
**Builds on:** `2026-09-02-wall-homework-and-school-notices-design.md` (homework as a task category, kid page checkbox), the school digest's homework pass (`supabase/functions/school-digest/lib/homework.ts`), the wall v1 Home screens (`KioskHomeV1.tsx`, picked by `kioskScreen.ts`), and the kid page (`KidDayView.tsx`).

## 1. Why

School papers that need a parent (forms to sign, permission slips, money to send, reports to read and return) get lost in two places (Scott, 2026-10-20):

- **The paper never surfaces.** Ella hands hers straight to Scott or Iris; Kaleb almost always forgets his are in his take-home folder.
- **The paper sits on the counter.** Once a parent has it, nothing says whose job it is or when it is due, so it waits "until someone remembers."

Either parent can handle any paper — "whoever grabs it first." A paper is **done only when it is back in the backpack**, not when it is signed.

The school digest already learns about most papers before they come home (ClassDojo posts, the HEMS parents' WhatsApp group): the 2026-09-11 digest named "Return Technology Contract and pink Health Information Form — due Thu Sep 10". Today the homework pass files such items as plain homework, with no notion of finding the paper, who has it, or the backpack.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every paper the school mentions appears on the wall for the right kid, with its due date, from the day it is mentioned until it is back in the backpack.
- Anyone at the wall can see, per paper, whether it has been found and which parent has it.
- A paper the school never mentioned can be added by photographing it on a phone.

**Non-goals**
- Parent-only items (volunteer sign-ups, tickets, PTO events, surveys). They stay in the digest email and the parents' own tasks, not on the wall — the homework pass already excludes them and keeps doing so.
- Reading PDF attachments, or Infinite Campus.
- Notifications of any kind.

**Anti-goals (Scott: "if it nags the kids or shows up on the wall wrong")**
- **Nothing addresses the kids.** No alerts, sounds, countdowns or "Kaleb, check your folder!" copy. Papers are stated as plain facts ("Pink health form · due Thu"). Overdue uses the wall's existing warm amber, never red.
- **Nothing shows wrong.** Wrong kid, wrong date, the same paper twice (3-01 and 3-02 post the same notice), or a paper that does not exist are the failures to design against (§6).

## 3. Decisions locked (2026-10-20)

| Question | Decision |
|---|---|
| Shape on the wall | **Read-only chips per kid** (option B of the mockups), like homework. Not a separate "papers" card, not a three-step tracker. |
| Where the taps live | **On the kid's page only.** Board chips are read-only and open the kid's page (consistent with the 2026-09-02 rule that a TV chip is too small to trust a checkbox on). |
| States | **Not found yet → [parent] has it → In backpack (done).** No separate "signed" step. |
| Who owns a paper | **Claimed, not assigned.** "I have it" on the kid's page opens the adults' faces; the tap records who has it. |
| Digest papers | **Straight onto the wall**, no parent approval step. Mistakes are removed after the fact with "Not ours". |
| Papers the school never mentioned | **Photo from a phone.** |
| Kids nagged | **Never** (anti-goal above). |

## 4. What it looks like

Mockups shown in conversation (2026-10-20): `papers-layout` option B and `kid-page-papers`.

### 4.1 The board (read-only)

A paper chip sits with that kid's school things on the wall v1 Home screens, beside homework but visually distinct (a paper glyph, or similar):

- **Dashed outline** = not found yet. On Kaleb's row this doubles as "there is a paper in his folder" without saying so to him.
- **Filled, with the holder's face** = a parent has it.
- Overdue: the date turns the wall's warm amber.
- Tapping a chip opens that kid's page.

Which Home screens carry the chips:
- **Home from school** — always, with that kid's homework. *(Builder's call how the chips sit beside the existing tickable `KidChecklist` rows; the papers themselves are never ticked from the board.)*
- **Out the door** — only papers due **today** that a parent has but which are not yet in the backpack, as part of the kid's bag line ("Pink health form"). *(My call, 2026-10-20 — a natural last chance, still a plain fact.)*
- Other screens: none.

### 4.2 The kid's page — a "Papers" card

On `KidDayView`, a Papers card lists the kid's open papers, oldest due first. Each row: title, due date, where it came from ("from Mr. Gorby, Oct 19" / "photo, Scott"), and state:

- **Not found yet** → button **"I have it"** → the adults' faces (Scott, Iris) → pick one → the row reads "Iris has it".
- **[Parent] has it** → the holder's face + button **"In backpack"** → done.
- **Done** rows stay struck through **until the next day**, then drop off, so the other parent can see it was handled. *(My call.)*
- **"Not ours"** on any open row removes it from the wall for good (§6). It sits behind a quiet secondary control so it is not tapped by accident. *(My call.)*
- Tapping the title expands the detail (what the form is, money, the quote it came from, the photo if any).

Touch targets ≥ 56px, as on every kid-page control.

### 4.3 On the phone — photographing a paper

In Symphony on a phone, "Photo of a school paper" (placement: builder's call, near the existing paper-capture entry): take a photo → Claude reads it → **one confirm card**: kid, title, due date, money if any, editable → Save. The saved paper is **already claimed by the person who photographed it** (they are holding it). The photo stays attached to the paper.

**Already on the wall?** Parents won't know whether the school mentioned a paper, so before saving, the card lists that kid's open **not-found-yet** papers that plausibly match (title similarity, due date). If one is picked, the photo is attached to that paper and it is claimed — no second row. If none fits, a new paper is saved. Still one card: the match appears as a pre-selected line ("This is: Pink health form, due Thu"), with "It's a different paper" to save it as new. *(My call, 2026-10-20.)*

Reading a printed form uses a **cheaper model than the Opus page reader** that plan-from-paper uses (~50¢ a page there); a typed permission slip doesn't need it. *(My call; any priced model — see the pricing check in `_shared/modelPricing.test.ts`.)*

## 5. Data

A paper is a task, the way homework is (2026-09-02):

- **`tasks.category = 'paper'`** — a new value on the category check constraint and in `TaskCategory`. **One row per kid per paper**, always `assigned_to` that kid — never `assigned_to_all`: each kid brings home their own physical copy, and who has it / in backpack / not ours belong to that copy. *(My call, 2026-10-20.)* Due date in `needed_on`/`scheduled_for` as homework does; `context = 'family'`; detail and source quote in `notes`.
- **Who has it:** a new nullable column, e.g. `tasks.held_by uuid references family_members(id)`. Null = not found yet. *(Name is the builder's call. It must not reuse `assigned_to`, which is the kid.)*
- **In backpack:** `completed = true` (+ `completed_at`).
- **Not ours:** the row is kept but marked dismissed (a nullable `dismissed_at`, or equivalent), so it can be excluded from the wall **and** used by the dedupe in §6. Deleting would let tomorrow's digest add it back.
- **Photo:** attached to the task with the existing `attachFile('task', id, blob)` (`src/lib/taskAttachments.ts`).

Migrations follow the repo's usual path; the category constraint change must land before the edge function that writes `'paper'` deploys (same ordering rule as the 2026-09-02 homework migration).

## 6. Getting it right (the "never wrong" anti-goal)

- **Classification at ingest.** The school-digest homework pass (`homework.ts`) already extracts "a form or slip the student brings back". It becomes a two-kind extraction: **homework** (work the kid does) vs **paper** (something a parent must read, sign, fill in or pay, that goes back to school). Parent-only items stay excluded. The pass stays one model call (cost: ~3¢/day today on Opus 5.5; do not add a call).
- **One paper per form per kid.** The same notice posted to 3-01 and 3-02 must produce one paper per kid, not two for the same kid. Reuse `planHomework`'s title matching, but match **per kid** (a row for Ella never absorbs Kaleb's), since §5 keeps one row per kid.
- **No resurrection.** Today's dedupe checks only **open** rows. For papers it must also check papers **completed or dismissed recently** (e.g. 30 days), or a paper put in the backpack Monday comes back when Tuesday's digest mentions it again. *(Window is the builder's call.)*
- **Which kid.** Ella and Kaleb get the same posts and the same take-home materials in both classes (Scott, 2026-10-20). So a paper from a class channel (3-01, 3-02), the parents' group or the school that names no child is **one paper for each kid**; a paper that names a child is that child's only. This replaces the earlier "kid unclear → no kid row" idea. (`capture_sources.child_member_id` stays unused for this.)
- **Confidence floor.** The homework pass drops items under 0.6 confidence; papers keep at least that floor.
- **Not ours** is the after-the-fact fix, and it sticks (§5).

## 7. Out of scope / later

- Infinite Campus (grades, missing assignments).
- PDF and image attachments in school email.
- The forwarded-email review path (`school_mail_reviews`, `save_school_mail_review`) learning the `paper` kind — it can follow once the digest path works.
- Scenes as the organizing model for the whole kiosk list (Scott, 2026-10-20) — papers sit in the Home-from-school scene here; the broader scene plan is separate.

## 8. Left to the builder

See §4.1 / §4.2 / §5 / §6 for the calls marked as the builder's.
