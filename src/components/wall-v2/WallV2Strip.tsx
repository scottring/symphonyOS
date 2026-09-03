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

import { HelpCircle, MessageCircle, Phone, UtensilsCrossed } from 'lucide-react';
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

export function WallV2DinnerStripCard({
  tonight, rows, onTap, onSelectDay,
}: {
  tonight: string | null;
  rows: MealRow[];
  onTap?: () => void;
  /** Opens another night's recipe — the prev/next arrows the hero used to carry. */
  onSelectDay?: (dateKey: string) => void;
}) {
  const rest = rows.filter((r) => !r.isToday).slice(0, 3);
  return (
    <div className={`${WALL.dinnerCard} flex flex-col min-w-0 px-4 py-3 overflow-hidden`}>
      <button type="button" onClick={onTap} className="text-left shrink-0 active:scale-[.99] transition-transform">
        <div className={`${WALL.dinnerLabel} mb-1.5 flex items-center gap-1.5`}>
          <UtensilsCrossed className="w-3.5 h-3.5" />
          Tonight
        </div>
        <div className={`font-display text-[1.5rem] leading-tight truncate ${tonight ? WALL.inkStrong : WALL.warn}`}>
          {tonight ?? 'Nothing planned'}
        </div>
      </button>
      {/* Each night is its own tap target. This replaces the hero's prev/next
          arrows: picking Tuesday directly beats stepping to it, and it keeps
          every planned night one tap from its recipe. */}
      <div className="mt-2 flex flex-col gap-1 min-h-0">
        {rest.map((r) => (
          <button
            key={r.dateKey}
            type="button"
            onClick={() => onSelectDay?.(r.dateKey)}
            disabled={r.isGap}
            className="flex items-baseline gap-2 min-w-0 text-left disabled:cursor-default active:scale-[.99] transition-transform"
          >
            <span className={`${ROW_KEY} ${WALL.muted}`}>{r.dayLabel}</span>
            <span className={`${ROW} ${r.isGap ? WALL.warn : WALL.ink}`}>
              {r.isGap ? 'Nothing planned' : r.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the strip asks when a handoff is unclaimed. Outranks the discussion
 * prompt: "who's walking tomorrow?" has an answer the house needs by 7am,
 * a conversation starter does not.
 */
export interface HandoffAsk {
  /** "Tomorrow · 7:15a" */
  lead: string;
  /** "Who's walking Ella & Kaleb to school?" */
  prompt: string;
  /** Questions beyond the one shown. */
  more: number;
}

export function WallV2QuestionStripCard({ question, handoff, onTap }: { question: string | null; handoff?: HandoffAsk | null; onTap?: () => void }) {
  if (handoff) {
    return (
      <button
        type="button"
        onClick={onTap}
        aria-label={`${handoff.prompt} Tap to answer`}
        className={`${WALL.card} flex flex-col min-w-0 px-4 py-3 overflow-hidden text-left border-[#E0BE7E] dark:border-[#6B5430] active:scale-[.99] transition-transform`}
      >
        <div className={`${WALL.label} shrink-0 mb-2 flex items-center gap-1.5 text-[#A8600F] dark:text-[#E0A959]`}>
          <HelpCircle className="w-3.5 h-3.5" />
          Who's on? · {handoff.lead}
        </div>
        <p className={`font-display text-[1.2rem] leading-snug line-clamp-3 ${WALL.inkStrong}`}>
          {handoff.prompt}
        </p>
        <p className={`mt-auto text-[0.9rem] font-bold ${WALL.muted}`}>
          {handoff.more > 0 ? `Tap to answer · +${handoff.more} more` : 'Tap a face to answer'}
        </p>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!question}
      className={`${WALL.card} flex flex-col min-w-0 px-4 py-3 overflow-hidden text-left disabled:cursor-default active:scale-[.99] transition-transform`}
    >
      <div className={`${WALL.label} shrink-0 mb-2 flex items-center gap-1.5`}>
        <MessageCircle className="w-3.5 h-3.5" />
        Tonight's question
      </div>
      {question ? (
        // The one place on this wall that is not a schedule. It gets the serif
        // and room to wrap — it is meant to be read aloud, not glanced at.
        <p className={`font-display italic text-[1.15rem] leading-snug line-clamp-4 ${WALL.ink}`}>
          &ldquo;{question}&rdquo;
        </p>
      ) : (
        <p className={`${ROW} ${WALL.muted}`}>No question today</p>
      )}
    </button>
  );
}

export function WallV2Strip({
  tonight, meals, comingUp, question, handoff, onCall, onTapDinner, onSelectDinnerDay, onTapQuestion, onTapHandoff,
}: {
  tonight: string | null;
  meals: MealRow[];
  comingUp: ComingUpRow[];
  question: string | null;
  handoff?: HandoffAsk | null;
  onCall: () => void;
  onTapDinner?: () => void;
  onSelectDinnerDay?: (dateKey: string) => void;
  onTapQuestion?: () => void;
  onTapHandoff?: () => void;
}) {
  return (
    // Fixed height so the board above absorbs whatever the screen gives.
    //
    // Four cells, and the reason the board could take the full width: the
    // right column's dinner hero and question moved down here, which is what
    // buys the timeline its ~810px of track. At ~540px a one-hour bar was 90px
    // and every label clipped to five characters — the mockup's failure,
    // reproduced. Width is the whole ballgame for a Gantt.
    <div className="shrink-0 h-[188px] flex gap-3 min-w-0">
      <WallV2CallTile onTap={onCall} />
      <div className="flex-1 min-w-0 grid grid-cols-3 gap-3">
        <WallV2DinnerStripCard tonight={tonight} rows={meals} onTap={onTapDinner} onSelectDay={onSelectDinnerDay} />
        <WallV2QuestionStripCard question={question} handoff={handoff} onTap={handoff ? onTapHandoff : onTapQuestion} />
        <WallV2ComingUpCard rows={comingUp} />
      </div>
    </div>
  );
}