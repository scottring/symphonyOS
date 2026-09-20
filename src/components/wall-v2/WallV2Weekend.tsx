// src/components/wall-v2/WallV2Weekend.tsx
//
// The weekend board: three day columns. This file only paints — which days,
// what qualifies and what a column can hold all live in wallWeekend.ts.
//
// The one rule worth restating here, because it is a layout rule: NOTHING is
// sized in fixed px against one viewport. This wall runs from a laptop window
// to a 1080p TV, and the last two times something was pinned to a tested
// height it overflowed on the real hardware. Columns are `flex-1`, rows size
// to their type, and the anytime band is the only thing pinned to the foot.

import { WALL, personAccent } from './wallTheme';
import type { WeekendBoard, WeekendColumn, WeekendItem, WeekendAnytimeItem } from './wallWeekend';

/** The household's stripe: warm neutral, deliberately not a person's colour. */
const HOUSEHOLD_ACCENT = 'border-l-[#C4B79C] dark:border-l-[#5A4E3C]';

function accentFor(index: number): string {
  return index < 0 ? HOUSEHOLD_ACCENT : personAccent(index);
}

function Row({ item, onTap }: { item: WeekendItem; onTap?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={onTap ? () => onTap(item.id) : undefined}
      className={`${WALL.cardInset} ${accentFor(item.accentIndex)} border-l-4 w-full text-left
        flex items-start gap-[2.5%] px-[3%] py-2 min-w-0
        ${item.past ? 'opacity-45' : ''}`}
    >
      <span
        className={`text-[0.82rem] font-bold tabular-nums shrink-0 pt-px ${WALL.muted}`}
        style={{ minWidth: '3.6em' }}
      >
        {item.time}
      </span>
      <span className="min-w-0 flex-1">
        {/* The owner sits ON the title line, not under it. As a third line it
            cost ~16px a row, which is a whole row per column — and the colour
            stripe already says whose it is; the name only disambiguates. */}
        <span className="flex items-baseline gap-2 min-w-0">
          <span className={`text-[1.02rem] font-semibold leading-tight truncate ${WALL.ink}`}>
            {item.title}
          </span>
          {item.ownerName && (
            <span className={`shrink-0 text-[0.68rem] font-bold uppercase tracking-[0.08em] ${WALL.muted}`}>
              {item.ownerName}
            </span>
          )}
        </span>
        {item.note && (
          <span className={`block text-[0.78rem] leading-snug truncate ${WALL.muted}`}>
            {item.note}
          </span>
        )}
      </span>
    </button>
  );
}

function AnytimeBand({ items }: { items: WeekendAnytimeItem[] }) {
  return (
    <div className="shrink-0 mt-2 pt-2 border-t border-dashed border-[#DDD1B8] dark:border-[#4A3D28]">
      <span className={`${WALL.label} block mb-1`}>Anytime</span>
      {items.length === 0 ? (
        // An honest empty beats a band that vanishes: a disappearing section
        // reflows the column, so two days side by side stop being comparable.
        <span className={`text-[0.82rem] italic ${WALL.muted} opacity-70`}>Nothing parked</span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((a) => (
            <li key={a.id} className={`text-[0.88rem] truncate ${WALL.muted}`}>
              <span className="opacity-60">○ </span>
              {a.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Column({ col, onTapItem }: { col: WeekendColumn; onTapItem?: (id: string) => void }) {
  return (
    <div
      className={`${WALL.card} flex-1 min-w-0 flex flex-col px-[3.5%] py-3
        ${col.isToday ? 'bg-[#F6F0E2] dark:bg-[#332C22] border-[#DCCFB4] dark:border-[#4A3D28]' : ''}`}
    >
      <div className="shrink-0 pb-2 mb-2 border-b border-[#EDE3CF] dark:border-[#3E362A]">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className={`text-[1.15rem] font-bold tracking-[0.04em] ${WALL.inkStrong}`}>
            {col.dayLabel}
          </span>
          <span className={`text-[0.8rem] ${WALL.muted}`}>{col.dateLabel}</span>
          {col.isToday && (
            <span className="ml-auto shrink-0 text-[0.62rem] font-bold uppercase tracking-[0.12em]
              text-[#2E4638] dark:text-[#9FBCAC] bg-[#E2EAE2] dark:bg-[#2E3B33] px-1.5 py-0.5 rounded-md">
              Today
            </span>
          )}
        </div>
        {col.specials.length > 0 && (
          <div className={`text-[0.8rem] mt-0.5 truncate ${WALL.muted}`}>
            {col.specials.join(' · ')}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        {col.items.length === 0 && col.anytime.length === 0 && col.specials.length === 0 ? (
          <span className={`text-[0.9rem] italic ${WALL.muted} opacity-70`}>Nothing planned</span>
        ) : (
          col.items.map((it) => <Row key={it.id} item={it} onTap={onTapItem} />)
        )}
      </div>

      {/* OUTSIDE the clipped list, deliberately. Inside it, this line is the
          first thing the overflow rule eats — so a column that dropped work
          would look like a column that had none. It is the one element that
          must survive a column being too short. */}
      {col.overflowCount > 0 && (
        <span className={`shrink-0 pt-1 text-[0.82rem] font-semibold ${WALL.muted}`}>
          +{col.overflowCount} more
        </span>
      )}

      <AnytimeBand items={col.anytime} />
    </div>
  );
}

export function WallV2Weekend({
  board,
  onTapItem,
}: {
  board: WeekendBoard;
  onTapItem?: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex gap-3">
      {board.columns.map((col) => (
        <Column key={col.dateKey} col={col} onTapItem={onTapItem} />
      ))}
    </div>
  );
}
