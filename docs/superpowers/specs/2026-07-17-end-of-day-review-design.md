# End-of-day review — design

**Date:** 2026-07-17
**Problem:** the "End of day review" card at the bottom of the Today timeline was a no-op (`onOpenReview={() => {}}`, "wired in Phase 2"). Bring it to life.

## Decision (with Scott)
A **lightweight evening drawer**, not the immersive planning wizard — it's a nightly ~1–2 min ritual, so it should be quick and low-friction. Uses the purpose-built `evening_reflections` table (already exists: `date`, `highlight`, `notes`; RLS "Users manage own reflections").

## The four beats
1. **Look back** — "You closed N things today" (today's completed tasks; a gentle line when none). Lists the first few.
2. **The day's highlight** — one-line input → `evening_reflections.highlight`, plus an optional notes textarea → `.notes`.
3. **Loose ends** — today's unfinished tasks; each has "→ Tomorrow" (push: `bucket:'timed'`, `scheduledFor` = tomorrow same time), shown as "tomorrow ✓" once moved.
4. **Close the day** — saves the reflection and closes.

## Pieces
- `src/hooks/useEveningReflection.ts` — loads today's row, update-or-insert on save (no empty rows created). `useAuth` + `supabase`, mirrors the existing hook pattern.
- `src/components/schedule/EndOfDayReview.tsx` — the drawer (bottom-sheet on mobile, centered card on desktop). Self-contained: computes today's completed/unfinished from `tasks` + `viewedDate`; overlay/backdrop click and ✕ both save+close.
- `TodayView` — `EndOfDayCard`'s `onOpenReview` now opens the drawer (`eodReviewOpen` state); passes `tasks`, `viewedDate`, `onUpdateTask`.

"Today's tasks" = tasks whose `scheduledFor` is on `viewedDate`.

## Testing
Component test (mocking `useEveningReflection`): celebrates completed, pushes an unfinished item to tomorrow (calls `onUpdateTask` + shows "tomorrow"), renders nothing when closed. Full suite green. Visual check on Today before shipping.

## Out of scope
- Tomorrow's-schedule peek (kept minimal; can add later).
- Reminders/nudges to *do* the review (surfacing is the existing banner).
- A history view of past reflections.
