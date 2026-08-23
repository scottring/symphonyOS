// src/components/wall-v2/WallV2Strip.tsx
//
// The bottom strip: the mockup's four cards, resolved against 1024x768.
//
// The mockup drew these ~400px tall holding ~180px of content — about 40% of a
// 768px screen doing nothing. Here they are a fixed ~200px band, and each card
// shows the few rows that fit at a size readable from eight feet. Type never
// shrinks to make content fit; the adapters cap the rows instead.
//
// The phone lives HERE rather than in the header. It is the one control on
// this wall a child operates unaided, and the mockup put it in the top-right —
// the highest, farthest corner from a kid standing at a wall-mounted TV. Low
// and left is the reachable corner, and it keeps the dedicated always-visible
// one-tap target the phone is owed.

import { Phone } from 'lucide-react';
import { WALL } from './wallTheme';
import type { MealRow, DueRow, ComingUpRow } from './wallStrip';

/** Shared card chrome so the three content cards read as one system. */
function StripCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`${WALL.card} flex flex-col min-w-0 px-4 py-3 overflow-hidden`}>
      <div className={`${WALL.label} shrink-0 mb-2`}>{title}</div>
      <div className="flex flex-col gap-1.5 min-h-0">{children}</div>
    </div>
  );
}

/** 1rem floor everywhere in the strip — the kiosk minimum at eight feet. */
const ROW = 'text-[1rem] leading-tight truncate';
const ROW_KEY = 'text-[0.95rem] font-bold uppercase tracking-wide shrink-0 w-[3.2rem]';

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <div className={`${ROW} ${WALL.muted}`}>{children}</div>;
}

export function WallV2MealsCard({ rows }: { rows: MealRow[] }) {
  return (
    <StripCard title="Dinners">
      {rows.length === 0 && <EmptyRow>No meal plan yet</EmptyRow>}
      {rows.map((r) => (
        <div key={r.dateKey} className="flex items-baseline gap-2 min-w-0">
          <span className={`${ROW_KEY} ${r.isToday ? WALL.inkStrong : WALL.muted}`}>
            {r.dayLabel}
          </span>
          {/* A gap is the point of this card, so it gets the warn colour
              rather than being rendered as an absence. */}
          <span className={`${ROW} ${r.isGap ? WALL.warn : WALL.ink} ${r.isToday ? 'font-bold' : ''}`}>
            {r.isGap ? 'Nothing planned' : r.title}
          </span>
        </div>
      ))}
    </StripCard>
  );
}

export function WallV2DueTodayCard({ rows }: { rows: DueRow[] }) {
  return (
    <StripCard title={rows.length ? `Due today · ${rows.length}` : 'Due today'}>
      {rows.length === 0 && <EmptyRow>Nothing due — nice</EmptyRow>}
      {rows.map((r) => (
        <div key={r.id} className="flex items-baseline gap-2 min-w-0">
          <span className={`${ROW} ${WALL.ink} flex-1`}>{r.title}</span>
          {r.who && (
            <span className={`text-[0.85rem] font-bold shrink-0 ${WALL.muted}`}>{r.who}</span>
          )}
        </div>
      ))}
    </StripCard>
  );
}

export function WallV2ComingUpCard({ rows }: { rows: ComingUpRow[] }) {
  return (
    <StripCard title="Coming up">
      {rows.length === 0 && <EmptyRow>Clear ahead</EmptyRow>}
      {rows.map((r) => (
        <div key={r.dateKey} className="flex items-baseline gap-2 min-w-0">
          <span className={`${ROW_KEY} ${WALL.muted}`}>{r.dayLabel}</span>
          <span className={`${ROW} ${WALL.ink}`}>{r.summary}</span>
        </div>
      ))}
    </StripCard>
  );
}

/**
 * The phone target. Sized well past the 80x80 kiosk minimum and given the
 * strip's full height, because a child reaching for it is the worst case this
 * wall has to serve.
 */
export function WallV2CallTile({ onTap }: { onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label="Call"
      className={`${WALL.card} shrink-0 w-[140px] flex flex-col items-center justify-center gap-2 active:scale-[.97] transition-transform`}
    >
      <Phone className="w-11 h-11 text-[#2E4638] dark:text-[#7FA893]" />
      <span className={`font-display text-[1.5rem] leading-none ${WALL.inkStrong}`}>Call</span>
    </button>
  );
}

export function WallV2Strip({
  due, comingUp, onCall,
}: {
  due: DueRow[];
  comingUp: ComingUpRow[];
  onCall: () => void;
}) {
  return (
    // Fixed height, not flex-1: the lanes above should absorb whatever the
    // screen gives, and the strip should never grow into them.
    //
    // Two content cards, not the mockup's four. At 1024 wide, four cards plus
    // the phone leaves ~195px each — narrow enough that "Call Dr. Lewis about
    // Ella's referral" truncates, which is the exact failure the mockup's own
    // "Food shop…" labels demonstrate. Dinners moved to the right column, and
    // family notes are not built here at all (they need a table, RLS and a
    // phone write path — a fake one would be worse than none).
    <div className="shrink-0 h-[164px] flex gap-3 min-w-0">
      <WallV2CallTile onTap={onCall} />
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
        <WallV2DueTodayCard rows={due} />
        <WallV2ComingUpCard rows={comingUp} />
      </div>
    </div>
  );
}
