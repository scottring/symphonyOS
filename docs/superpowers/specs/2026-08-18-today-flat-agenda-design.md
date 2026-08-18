# Today: flat agenda — design

**Date:** 2026-08-18 · **Approved by:** Scott (in conversation, "go for it")

## Problem

Scott, on seeing his Today page: *"i just need to see my events tasks etc. now
they're buried under headings and ai suggestions."* His day had 3 real items;
the page wrapped them in ~7 layers of furniture: a full-size AI suggestion
paragraph (the loudest element on the page), an Up Next hero that lifted the
next event out of the timeline (leaving MORNING an empty heading reading
"· up next"), three period headings structuring three items, plus separate
carried-over and needs-attention rows framing the list. Asked which parts were
noise, he selected **all four**.

## Design

Today becomes one time-ordered list, the way a paper day-plan reads:

1. **No Up Next hero.** The next commitment stays in the timeline and is
   emphasized in place: a small amber "UP NEXT · starts in ~N" marker line
   plus a tinted row. `UpNextHero.tsx` deleted; `selectUpNext` and
   `formatUpNextStatus` unchanged. Group-card chrome wins over the tint
   (never break a group's border to tint its parent).
2. **No period headings.** EARLY MORNING / MORNING / EVENING etc. no longer
   render. The band *structure* survives underneath because bands are the
   drag drop-targets — during a live drag the `DaySectionHeader`s reappear
   as labels to aim at. Timed sections never collapse anymore (nothing to
   collapse behind). The **Anytime** row keeps its permanent header and full
   fold behavior — its collapsed "Anytime · M of N done" summary is the
   fixed-budget answer for the untimed-routine slab.
3. **Suggestions collapse to one quiet line** — "✦ N suggestions" — tap to
   expand the full reasoning inline, tap to fold. The ⋯ menu's "Hide
   suggestions" still silences the tier wholesale. The unprompted tier is
   never a paragraph above the schedule by default again.
4. **One backlog footer** (`TodayBacklogFooter`): "7 carried over · 24 need
   attention · oldest 248 days · Review", below the list. The carried-over
   segment expands the (now headerless-capable) `OverdueSection` inline;
   Review navigates to `reviewDestination(attentionItems)`. Renders outside
   the totalItems ternary — both branches — so a "clear" day can never hide
   backlog. `AttentionLine.tsx` deleted; its floor-guarantee and mobile FAB
   clearance moved onto the footer.

## Invariants preserved

- **Commitment surface:** non-commitments keep a fixed space budget that does
  not grow with backlog (`TodayInvariant.test.tsx` still green).
- Per-section cap and its honest "+N more today" count unchanged; the full
  count's everyday home is now that control (headers still get full
  `items.length` when they render mid-drag).
- No write-side changes anywhere.

## Deliberately not done

- Auto-showing period headings on heavy days (>10 timed items). Start fully
  flat; add only if packed days actually hurt.
