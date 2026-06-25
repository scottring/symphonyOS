# Spec #2 — Routine Editing UI (DRAFT NOTES, for Scott's review)

**Status:** DRAFT / pre-brainstorm. NOT an approved spec. Written overnight to tee up
the next-stage brainstorm. Each open fork below has my recommendation; decide them
with me in the morning and I'll turn this into a real spec → plan.

**Where we are:** Spec #1 (model + Today display + completion) is built and on
`routine-collections`. The model exists: a Routine has Steps (`parent_routine_id`,
`step_order`); a dosed step has `times_per_day`; completion is per-dose. What #1 does
NOT have: any way to *create or edit* collections by hand. Everything was either
agent-created (the HEP) or seeded via SQL. Spec #2 is the human editing surface.

## What #2 should let you do

1. **Create a routine collection** and name it ("Evening Shower", "Kids' Morning").
2. **Add / remove / edit Steps** within a collection (name, dose times, optional image).
3. **Reorder Steps** within a collection (writes `step_order`).
4. **Turn existing flat routines into a collection** — select several standalone
   routines and "group" them (sets their `parent_routine_id`).
5. **Promote a step back to standalone / move a step between collections** (un/re-parent).

## Open forks (decide these with me)

### Fork A — where does editing live?
- **(Rec) Redesign the existing Routines page** into a two-level list: collections
  expand to their steps; an editor panel (the existing detail panel pattern) edits a
  routine or step. Reuses the surface you already have; keeps Today read-only.
- Inline editing on Today (drag/drop a step right on the timeline). Powerful but
  conflates "doing" and "planning" — and Today is your execution view.
- A dedicated full-page collection editor. Heavier; probably overkill for v2.

My lean: **redesign the Routines page**; Today stays the calm execution view.

### Fork B — how do you create a collection?
- **(Rec) Both, but lead with "group existing":** a "New routine" creates an empty
  collection you add steps to; AND multi-select existing standalone routines → "Group
  into routine". The group path matters because your real data (kids' morning) is
  already a pile of flat routines that should become one collection.
- Only from-scratch (ignores existing data — you'd recreate the kids' routine by hand).

My lean: **both**, with multi-select grouping as the headline (it fixes your existing data).

### Fork C — Step editing depth
- **(Rec) Lightweight step editor:** name, dose times (add/remove pills), optional
  image, optional instructions. A step rarely needs the full routine editor (context,
  assignment, recurrence) because it inherits most of that from its collection.
- Full routine editor per step (heavier, more surface, more confusion).

My lean: **lightweight**, inheriting context/assignment/recurrence from the collection
(with an override only if you ask for it later).

### Fork D — reordering interaction
- **(Rec) Drag-and-drop reorder of steps within a collection**, writing `step_order`.
  The repo already ships `dnd-kit` (`vendor-dnd`), and `step_order` exists for exactly
  this. This is the contained, well-defined drag-and-drop.
- Up/down arrows (simpler, less satisfying).

My lean: **dnd-kit drag reorder of steps.** This is the safe, in-scope DnD.

## Related but SEPARATE — Today-wide drag-and-drop (your other idea)

You raised dragging *anything* on the Today timeline (tasks/events/routines), not just
steps. That is a **distinct feature** with an unresolved core question I will NOT decide
for you:

> On a time-ordered timeline, does a drop **reschedule** (position = time) or
> **reorder/prioritize** (position = manual order), or both-by-zone?

This needs its own brainstorm. It is NOT part of spec #2 (which is routine editing).
Precedent exists: `scheduleRoutineOnDate` already does drag-to-reschedule on the
"Plan day" grid — a Today-wide version would extend that. Flagging so we keep the two
DnD ideas separate: **step-reorder DnD = spec #2; Today-wide DnD = its own spec.**

## Rough scope estimate (once forks are decided)

Likely a similar 6-10 task plan: Routines-page two-level list → collection/step editor
panel → multi-select "group into routine" → dnd-kit step reorder (writes `step_order`)
→ un/re-parent → backward-compat with standalone routines. The data model is already in
place from #1, so #2 is mostly UI + a few CRUD wirings (no migration expected).

## My recommendation for the morning

Spend ~10 minutes confirming forks A-D (I expect you'll take most of my leans), then I
write the real spec #2 and plan and execute it the same way we did #1. Keep the
Today-wide DnD as a separate brainstorm we do after — or before, if it's what excites
you most.
