// src/components/wall-v2/WallV2Gantt.tsx
//
// The timeline board: one row per person, bars against a shared time axis.
//
// What makes this readable at eight feet is not the bars, it's the NOW line.
// A Gantt's cost is that you have to locate the present before anything else
// means something; drawing it removes that step, so the row reads "what am I
// in the middle of, and what's next" without the viewer doing the arithmetic.
//
// Geometry, window and label-fitting all live in wallGantt.ts — this file only
// paints. See there for why the window rolls and why narrow bars put their
// labels outside.

import { useState } from 'react';
import { Home } from 'lucide-react';
import { WALL, personAccent } from './wallTheme';
import { HOUSEHOLD_ID } from './wallEventAttribution';
import type { GanttBoard, GanttBlock, GanttTrack } from './wallGantt';

/** Bar fills per person index, matching the lane accents. */
const BAR_TINTS = [
  'bg-[#7A8E7E] dark:bg-[#4E7261]',
  'bg-[#C9A96B] dark:bg-[#A8894B]',
  'bg-[#D97F5E] dark:bg-[#B4644A]',
  'bg-[#7C93A8] dark:bg-[#5E7488]',
] as const;

function Face({ memberId, name, index }: { memberId: string; name: string; index: number }) {
  const [failed, setFailed] = useState(false);
  const shell = `w-12 h-12 shrink-0 rounded-xl border-2 border-[#EEE1C7] dark:border-[#4A3D28] ${personAccent(index)}`;

  // The household row is not a person. Left as a monogram it renders "E" for
  // Everyone, directly under Ella's E — the same token at this distance.
  if (memberId === HOUSEHOLD_ID) {
    return (
      <div className={`${shell} bg-[#EFE3CB] dark:bg-[#463A28] grid place-items-center`}>
        <Home className="w-6 h-6 text-[#6E5A3A] dark:text-[#D8BC85]" />
      </div>
    );
  }
  if (failed) {
    return (
      <div className={`${shell} bg-[#F4E5CA] dark:bg-[#4A3D28] grid place-items-center font-display text-[1.4rem] text-[#6E5A3A] dark:text-[#D8BC85]`}>
        {name.charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      src={`/wall/portrait-${memberId}.png`}
      alt=""
      onError={() => setFailed(true)}
      className={`${shell} object-cover`}
    />
  );
}

function Bar({ block, index, onTap }: { block: GanttBlock; index: number; onTap?: (id: string) => void }) {
  const tint = BAR_TINTS[index % BAR_TINTS.length];
  // The label sits INSIDE the bar's positioning context, so a percentage
  // resolves against the BAR, not the track. labelRoomPct is a share of the
  // track, so convert: a 30%-of-track gap beside a 12%-of-track bar is 250% of
  // the bar. Getting this wrong renders every outside label as "GA…", which is
  // worse than leaving it inside.
  const roomAsPctOfBar = block.widthPct > 0
    ? (block.labelRoomPct / block.widthPct) * 100
    : 100;
  return (
    <button
      type="button"
      onClick={() => onTap?.(block.id)}
      style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
      className={`absolute top-1/2 -translate-y-1/2 h-[46px] rounded-lg ${tint} ${
        block.past ? 'opacity-40' : ''
      } active:scale-[.98] transition-transform`}
    >
      {/* A bar wide enough carries its own label. A narrow one hands the label
          to whichever side has clear track, so the bar keeps its TRUE width —
          duration stays honest and the words stay readable, rather than
          trading one for the other and getting "Food shop…". */}
      {block.labelSide === 'in' && (
        <span className="absolute inset-0 flex items-center px-3 text-[1.05rem] font-bold text-white truncate text-left">
          {block.title}
        </span>
      )}
      {block.labelSide === 'right' && (
        <span
          style={{ maxWidth: `${roomAsPctOfBar}%`, width: 'max-content' }}
          className={`absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 text-[1.05rem] font-bold truncate ${WALL.ink}`}
        >
          {block.title}
        </span>
      )}
      {block.labelSide === 'left' && (
        <span
          style={{ maxWidth: `${roomAsPctOfBar}%`, width: 'max-content' }}
          className={`absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 text-[1.05rem] font-bold truncate text-right ${WALL.ink}`}
        >
          {block.title}
        </span>
      )}
    </button>
  );
}

function Track({ track, index, onTapItem }: { track: GanttTrack; index: number; onTapItem?: (id: string) => void }) {
  const empty = track.blocks.length === 0 && track.allDay.length === 0;
  return (
    <div className={`${WALL.card} border-l-4 ${personAccent(index)} flex items-center gap-4 pl-4 pr-3 flex-1 min-h-0 overflow-hidden`}>
      <div className="w-[168px] shrink-0 flex items-center gap-3 min-w-0">
        <Face memberId={track.memberId} name={track.name} index={index} />
        <span className={`font-display text-[1.35rem] leading-tight truncate ${WALL.inkStrong}`}>
          {track.name}
        </span>
      </div>

      {/* All-day items have no position on a clock, so they ride as chips
          before the track rather than being stretched across the whole width
          and pretending to be a duration. */}
      {track.allDay.length > 0 && (
        <div className="shrink-0 flex gap-1.5 max-w-[200px]">
          {track.allDay.slice(0, 2).map((t) => (
            <span key={t} className={`${WALL.prepChip} truncate max-w-[96px]`}>{t}</span>
          ))}
        </div>
      )}

      <div className="relative flex-1 min-w-0 h-full">
        {empty ? (
          <span className={`absolute left-0 top-1/2 -translate-y-1/2 text-[1.05rem] ${WALL.muted}`}>
            Nothing scheduled
          </span>
        ) : (
          track.blocks.map((b) => <Bar key={b.id} block={b} index={index} onTap={onTapItem} />)
        )}
      </div>

      {track.laterCount > 0 && (
        <span className={`shrink-0 text-[0.95rem] font-bold ${WALL.muted}`}>
          +{track.laterCount} later
        </span>
      )}
    </div>
  );
}

export function WallV2Gantt({ board, onTapItem }: { board: GanttBoard; onTapItem?: (id: string) => void }) {
  const { axis, tracks } = board;
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Axis header. The 168px offset lines the ruler up with the tracks
          below it — the labels are useless if they don't sit over their bars. */}
      <div className="shrink-0 flex items-end gap-4 pl-4 pr-3">
        <div className="w-[168px] shrink-0">
          <span className={WALL.label}>Today</span>
        </div>
        <div className="relative flex-1 min-w-0 h-6">
          {axis.ticks.map((t) => (
            <span
              key={t.min}
              style={{ left: `${t.leftPct}%` }}
              className={`absolute bottom-0 -translate-x-1/2 text-[0.95rem] font-bold tabular-nums ${WALL.muted}`}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 flex flex-col gap-2">
        {/* The now line, drawn over every track. This is the single element
            that makes a time axis worth its cost on a wall: without it the
            viewer has to find the present before the board means anything. */}
        {axis.nowPct !== null && (
          <div
            aria-hidden
            style={{ left: `calc(168px + 16px + 12px + (100% - 168px - 16px - 12px - 12px) * ${axis.nowPct / 100})` }}
            className="absolute top-0 bottom-0 w-[3px] bg-[#C2603A] dark:bg-[#E0895F] rounded-full z-10 pointer-events-none"
          >
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#C2603A] dark:bg-[#E0895F]" />
          </div>
        )}

        {tracks.map((t, i) => (
          <Track key={t.memberId} track={t} index={i} onTapItem={onTapItem} />
        ))}
      </div>
    </div>
  );
}
