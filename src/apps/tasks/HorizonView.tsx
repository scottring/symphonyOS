// src/apps/tasks/HorizonView.tsx
//
// Phase 2b — the horizon-scoped view each rhythm rung routes to.
//
// This file used to hold all four (five, counting Someday) horizon pages in
// one 1,300-line component branching on a `horizon` prop. It has been
// mechanically split into `src/apps/tasks/horizons/{WeekPage,MonthPage,
// SeasonPage,YearPage,SomedayPage,shared}.tsx` — same behavior, one file per
// rung, sharing data wiring via `useHorizonPageData` in `shared.tsx`. This
// file now only re-exports under the names routes/importers already use.
//
// INVARIANT (still true, now enforced inside `shared.tsx`): a horizon page
// shows ONLY that horizon's scoped pool (`selectHorizonPool`) + carry-over
// (`selectOverdue`) — never the full task list. Today keeps its rich view
// (HomeViewContainer); this container serves Week / Month / Season / Someday.
// Year is a goals-level horizon and renders a placeholder pointing at Goals
// (its session is Phase 3).

export { WeekPage as WeekView } from './horizons/WeekPage';
export { MonthPage as MonthView } from './horizons/MonthPage';
export { SeasonPage as SeasonView } from './horizons/SeasonPage';
export { YearPage as YearView } from './horizons/YearPage';
export { SomedayPage as SomedayView } from './horizons/SomedayPage';
