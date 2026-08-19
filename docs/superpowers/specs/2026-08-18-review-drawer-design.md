# Review drawer: active backlog management — design

**Date:** 2026-08-18 · **Approved by:** Scott ("go" on the proposed drawer +
"make it so that the week and month lists can be seen and items can be triaged
from them" + suggestions hidden by default)

## Problem

The backlog footer made carried-over and needs-attention *visible* but nothing
*managed* them — 24 items, oldest 248 days, with only a navigate-away Review.
Scott: "we need active management of carried over and need attention — either
or both in the morning planning session or in the evening planning session."
Separately, the week and month pools were invisible since the analog-planning
de-nav.

## Design

**One drawer (`ReviewDrawer.tsx`), two flavors** — replaces `EndOfDayReview`:

- **evening** (⋯ menu → "End of day review"): wins + highlight + sweep today's
  loose ends (unchanged ritual), then the shared triage sections.
- **morning** (backlog footer → Review): straight to triage. This replaces the
  navigate-to-/week Review — Scott explicitly asked for management *from
  Today*, and a summoned modal keeps the page's one-line budget intact.

**Triage sections** (both modes; every verdict writes through the same
handlers the page rows use — pushTask / updateTask / deleteTask):

1. **Backlog** — carried-over + attention, deduped, **oldest first, capped at
   5 per session** (`BACKLOG_SESSION_CAP`) with "+N more waiting". Oldest-first
   is the drain guarantee. Verdicts: Today · Tmrw · This wk · Someday · Delete.
2. **This week · N** — `selectHorizonPool('week')` for the current week, plus
   "Open week bench →". No "This wk" verb (it's already there).
3. **This month · N** — the rung above, per the streamlined vision's
   review-packet rule (packets always carry the rung above; no month page is
   resurrected). Verdicts include This wk. **2026-08-19 (Scott, after first
   real morning use): the month pool is NOT part of the review — it renders
   collapsed (chevron + count), opened on demand to look at and pick from.**

Leaving an item alone is always a legitimate verdict. Resolved rows show
"✓ <fate>" in place.

## Also in this change

`suggestionsPref` storage key rotated (`.v2`): devices that had 'on' under the
on-by-default era were opted in by inertia — everyone now starts hidden and
re-enables intentionally from the ⋯ menu ("Show suggestions · N").

## Known rough edge

~~"This month · 48" renders all 48 rows (scrollable, last section). If that
reads as endless in practice, cap it like the backlog.~~ Resolved 2026-08-19:
the month section is collapsed by default; all rows render only when opened.
