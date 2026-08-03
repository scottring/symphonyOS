# The Thread — throwaway mock

**Date:** 2026-08-03
**Status:** Design approved, mock not yet built
**Branch:** `thread`

## Why

Symphony is 1,249 source files, ~176k lines, 18 registered apps, ~25 sidebar
destinations, 6 horizon rungs, 7 `Tap*Panel` implementations, and three parallel
ways to look at the same task (`DetailPanelRedesign.tsx` is 3,498 lines alone).

The size is not the problem. This is: **Symphony makes the user the router.**
Every feature shipped as a destination. "What you need exactly when you need it"
requires the system to decide what surfaces; a sidebar requires the user to
decide. Those are opposite architectures, and Symphony has been building the
second while promising the first. The clicking, the duplicated work, and the
confusion are symptoms of that one thing.

A smarter detail panel does not fix it. A panel is structurally subordinate — it
opens only after the user has already navigated somewhere and selected
something. The navigation cost is paid before the panel appears.

## The bet

Replace destinations with a single composed thread. This mock exists to find out
whether that feels obviously better *before* anything is deleted.

**Scope decision (2026-08-03):** built for Scott alone. Not a product bid. The
generality in the current app — configurable everything, empty states, 18
registered apps — is what produced the sprawl. Single-user hard-coding lives in
*what* the thread composes, not *how*; making it multi-tenant later is a
data-scoping problem, not a redesign. So this does not foreclose selling it.

## The atom: a moment

Today the atom is an **entity** — task, calendar event, routine instance, med
dose. In the thread the atom is a **moment**: something true right now that might
need Scott.

Same rows from the same tables. The difference is selection and ordering by
**liveness**, not by schedule. A task list shows everything scheduled today. A
thread shows what changes if you don't act, plus what you'll need in the next
hour.

A moment renders with its context already inlined — no click-through.

## Composition: three bands, then nothing

1. **Now** — live in this moment. The 2:40 pickup. The call that only works
   during business hours when it's already 4:15. The dose. Target 1–5 items.
   More than five means the composer is failing, not the user.
2. **Next** — the shape of the rest of the day, compressed, with prep attached
   to events.
3. **Loose** — unanchored and decaying: inbox, overdue, things promised and not
   done. Triage happens here in place, not on a separate page.

Below Loose: nothing. No projects section, no goals section, no horizon rungs.
Those become material to be summoned (phase two, not in this mock).

## Context inlines

This is the differentiator and the thing that must land visually.

Today a card shows a title and chips; the phone number is two clicks away. In
the thread:

- A moment that means calling someone renders the number as a tappable button on
  the card.
- An appointment renders its address as tap-to-navigate.
- A moment attached to a project renders that project's most recent note.
- Attachments and links render inline, not behind a disclosure.

Fewer rows, each one complete. That is the trade, and it makes "exactly when you
need it" structural rather than aspirational.

## What gets built

- New route `/thread`. Sidebar hidden on that route only.
- **Nothing is deleted and nothing is migrated.** Every existing surface keeps
  working exactly as it does today.
- Real data through existing hooks. `src/lib/today/computeTodayData.ts` already
  assembles the merged day (tasks, events, routine instances, med doses) — the
  composer sits on top of it rather than re-querying.
- A first-pass composer that sorts the merged day into the three bands.
- Moment cards with context inlined per the section above.
- Three actions per moment: complete, snooze, defer.
- One capture input at the top. Text in, task out. Nothing clever.
- Legible at 8 feet so it can be judged on the kitchen wall as well as the
  laptop.

## What does not get built

- Summoning / ask-the-thread. The input captures only.
- Any deletion or migration of existing surfaces.
- Drag, reorder, grouping.
- Mobile polish.
- Editing beyond the three actions.
- Tests beyond whatever the composer needs to not be obviously wrong. This is a
  throwaway.

## Known unknown

The composer is where this succeeds or fails, and its rules are being guessed
rather than specified. The first version will be wrong about roughly a third of
what it calls "live." That is accepted: being visibly wrong is more useful here
than more design conversation.

## Kill criterion

Scott opens `/thread`. If he still finds himself wanting the sidebar, the
experiment is over and the cost was one day.
