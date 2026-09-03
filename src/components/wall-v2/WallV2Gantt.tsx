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
import { BookOpen, HelpCircle, Home } from 'lucide-react';
import { WALL, personAccent } from './wallTheme';
import { HOUSEHOLD_ID } from './wallEventAttribution';
import type { GanttBoard, GanttBlock, GanttTrack, GanttHomework } from './wallGantt';

// Every row must start its track at the SAME x, or the shared axis — the only
// thing that makes a Gantt worth its cost — is a lie. These are the pieces of
// that offset, named once so the ruler, the tracks and the now line cannot
// drift apart. (They did: an all-day chip rendered inline before the track,
// so Ella's "Library" pushed her whole day ~90px to the right of the 9a tick
// while Kaleb's shorter "Art" pushed his ~65px.)
const BORDER_L = 4;   // border-l-4 on the track card
const PAD_L = 16;     // pl-4
const PAD_R = 12;     // pr-3
const GAP = 16;       // gap-4
const NAME_W = 168;   // portrait + name column
/** Untimed items named before a row starts counting instead. */
const ANYTIME_SHOWN = 4;
/** The same, on a row that drew no bars and can spend the track's space. */
const ANYTIME_SHOWN_ROOMY = 8;
/** Homework chips named before a row counts the rest. Its own cap: homework
 *  is the actionable thing on the row, so it never competes with specials. */
const HOMEWORK_SHOWN = 2;

/** A stay's edge, per person index — the same family as the bar fills. */
const STAY_EDGES = [
  'border-[#7A8E7E] dark:border-[#4E7261]',
  'border-[#C9A96B] dark:border-[#A8894B]',
  'border-[#D97F5E] dark:border-[#B4644A]',
  'border-[#7C93A8] dark:border-[#5E7488]',
] as const;

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
      className={`absolute top-1/2 -translate-y-1/2 h-[44px] rounded-lg ${
        // A stay is where someone IS, not something they do: pale box, the
        // person's tint as an edge, the words in ink. Dimmed only once over.
        block.stay
          ? `bg-[#F4ECDB] dark:bg-[#3A3227] border-2 ${STAY_EDGES[index % STAY_EDGES.length]} ${block.past ? 'opacity-50' : ''}`
          : block.openHandoff
            // Unclaimed: hollow, so the row says "someone" rather than "done".
            ? `border-2 border-dashed border-[#C2603A] dark:border-[#E0895F] bg-[#FBF1E6] dark:bg-[#3D2E22] ${block.past ? 'opacity-40' : ''}`
            : `${tint} ${block.past || block.free ? 'opacity-40' : ''}`
      } active:scale-[.98] transition-transform`}
    >
      {/* A bar wide enough carries its own label. A narrow one hands the label
          to whichever side has clear track, so the bar keeps its TRUE width —
          duration stays honest and the words stay readable, rather than
          trading one for the other and getting "Food shop…". */}
      {block.labelSide === 'in' && (
        <span className={`absolute inset-0 flex items-center gap-1.5 px-3 text-[1.05rem] font-bold truncate text-left ${
          block.stay ? WALL.inkStrong : block.openHandoff ? 'text-[#A8440F] dark:text-[#E0895F]' : 'text-white'
        }`}>
          {block.openHandoff && <HelpCircle className="w-5 h-5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{block.title}</span>
          {block.free && !block.stay && (
            <span className="shrink-0 text-[0.75rem] font-semibold uppercase tracking-wide opacity-90">Free</span>
          )}
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

/**
 * A chip in the untimed area.
 *
 * `carried` is work from before today. It reads quieter than today's own
 * items — outlined rather than filled — because a wall that shouts the
 * backlog at the same volume as tonight's dinner teaches people to stop
 * reading the wall.
 */
function Chip({ label, wide }: { label: string; wide: boolean }) {
  // Written out rather than composed onto WALL.prepChip: that token bakes in
  // its own padding and size, and two conflicting Tailwind utilities resolve
  // by CSS order, not by their order in the string.
  // The small size is the one-glance answer under a kid's School bar — "PE",
  // "Music" — and 0.8rem read as a footnote from the sink. 0.9rem still fits
  // beside a 44px bar in a 1024×768 row.
  const size = wide
    ? 'px-3 py-1 text-[0.95rem] max-w-[300px]'
    : 'px-3 py-0.5 text-[0.9rem] max-w-[240px]';
  return (
    <span className={`rounded-lg font-bold truncate shrink bg-[#F2E4C4] dark:bg-[#4A3D28] text-[#7A5A2E] dark:text-[#D8BC85] ${size}`}>
      {label}
    </span>
  );
}

/**
 * A homework chip. Filled in the forest tone so it reads as "yours to do",
 * distinct from the sand-coloured specials beside it. On a person's row it
 * opens their page (where the checkbox lives — a chip on a TV is too small
 * to be one); the household row has no page, so there it is just words.
 */
function HomeworkChip({ chip, wide, name, onTap }: { chip: GanttHomework; wide: boolean; name: string; onTap?: () => void }) {
  const size = wide ? 'px-3 py-1 text-[0.95rem] max-w-[300px]' : 'px-2.5 py-0.5 text-[0.8rem] max-w-[220px]';
  const tone = chip.late
    ? 'bg-[#F6E3C9] dark:bg-[#4A3620] text-[#A8600F] dark:text-[#E0A959]'
    : 'bg-[#DCE8DE] dark:bg-[#2F4A3B] text-[#2E4638] dark:text-[#BFE3CF]';
  const cls = `inline-flex items-center gap-1.5 rounded-lg font-bold shrink min-w-0 ${tone} ${size}`;
  const body = (
    <>
      <BookOpen className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{chip.label}</span>
    </>
  );
  if (!onTap) return <span className={cls}>{body}</span>;
  return (
    <button type="button" onClick={onTap} aria-label={`Open ${name}'s homework: ${chip.label}`} className={cls}>
      {body}
    </button>
  );
}

/**
 * Everything on this row that has no position on a clock — today's untimed
 * items and its routines, and nothing else. Carried-over work was shown here
 * briefly and removed: the board is the day.
 *
 * `roomy` is set when the row drew no bars at all. That row has 44px of track
 * reserved for nothing, so the chips take it: bigger type, wrapping onto a
 * second line, more of them named. A row earns its space by what it holds,
 * not by whether what it holds happens to have a time.
 */
function AnytimeArea({ track, roomy, name, onTapMember }: { track: GanttTrack; roomy: boolean; name: string; onTapMember?: () => void }) {
  const cap = roomy ? ANYTIME_SHOWN_ROOMY : ANYTIME_SHOWN;
  const shown = track.anytime.slice(0, cap);
  const more = track.anytime.length - shown.length;
  const homeworkMore = track.homework.length - HOMEWORK_SHOWN;
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${roomy ? 'flex-wrap content-center' : 'overflow-hidden'}`}>
      {track.live && (
        <span className={`inline-flex items-center gap-1.5 rounded-lg font-bold shrink-0 bg-[#2E4638] dark:bg-[#4E7261] text-white ${roomy ? 'px-3 py-1 text-[0.95rem]' : 'px-2.5 py-0.5 text-[0.8rem]'}`}>
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          {track.live}
        </span>
      )}
      {/* Homework first: it is the thing to DO on this row; the day's chips
          behind it are what the day looks like. */}
      {track.homework.slice(0, HOMEWORK_SHOWN).map((h) => (
        <HomeworkChip key={h.id} chip={h} wide={roomy} name={name} onTap={onTapMember} />
      ))}
      {homeworkMore > 0 && (
        <span className={`shrink-0 text-[0.9rem] font-bold ${WALL.muted}`}>+{homeworkMore}</span>
      )}
      {shown.map((t) => <Chip key={t} label={t} wide={roomy} />)}
      {more > 0 && (
        <span className={`shrink-0 text-[0.9rem] font-bold ${WALL.muted}`}>+{more}</span>
      )}
      {track.laterCount > 0 && (
        <span className={`shrink-0 text-[0.9rem] font-bold ${WALL.muted}`}>
          +{track.laterCount} later
        </span>
      )}
    </div>
  );
}

function Track({ track, index, onTapItem, onTapMember }: { track: GanttTrack; index: number; onTapItem?: (id: string) => void; onTapMember?: (memberId: string) => void }) {
  const hasBars = track.blocks.length > 0;
  const hasChips = track.anytime.length > 0 || track.laterCount > 0 || track.homework.length > 0 || !!track.live;
  const nameColumn = (
    <>
      <Face memberId={track.memberId} name={track.name} index={index} />
      <span className={`font-display text-[1.35rem] leading-tight truncate ${WALL.inkStrong}`}>
        {track.name}
      </span>
    </>
  );
  return (
    <div className={`${WALL.card} border-l-4 ${personAccent(index)} flex items-center gap-4 pl-4 pr-3 flex-1 min-h-0 overflow-hidden`}>
      {onTapMember && track.memberId !== HOUSEHOLD_ID ? (
        <button
          type="button"
          onClick={() => onTapMember(track.memberId)}
          style={{ width: NAME_W }}
          aria-label={`Open ${track.name}'s day`}
          className="shrink-0 flex items-center gap-3 min-w-0 text-left"
        >
          {nameColumn}
        </button>
      ) : (
        <div style={{ width: NAME_W }} className="shrink-0 flex items-center gap-3 min-w-0">
          {nameColumn}
        </div>
      )}

      {/* Nothing variable-width sits between the person block and the track,
          so every row's track starts at the same x and the ruler above them
          means what it says. */}
      <div className="relative flex-1 min-w-0 h-full flex flex-col justify-center gap-1.5 py-1">
        {/* The track is only reserved when something is actually drawn on it.
            Holding 44px open on an empty row is what made the evening wall
            read as broken rather than calm. */}
        {hasBars && (
          <div className="relative h-[44px] shrink-0">
            {track.blocks.map((b) => <Bar key={b.id} block={b} index={index} onTap={onTapItem} />)}
          </div>
        )}
        {hasChips
          ? (
              <AnytimeArea
                track={track}
                roomy={!hasBars}
                name={track.name}
                onTapMember={onTapMember && track.memberId !== HOUSEHOLD_ID ? () => onTapMember(track.memberId) : undefined}
              />
            )
          : !hasBars && (
              <span className={`text-[1.05rem] ${WALL.muted}`}>Nothing scheduled</span>
            )}
      </div>
    </div>
  );
}

export function WallV2Gantt({ board, onTapItem, onTapMember }: { board: GanttBoard; onTapItem?: (id: string) => void; onTapMember?: (memberId: string) => void }) {
  const { axis, tracks } = board;
  const trackLeft = BORDER_L + PAD_L + NAME_W + GAP;
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Axis header. The offset is computed from the same pieces the tracks
          use — the labels are useless if they don't sit over their bars. */}
      <div className="shrink-0 relative h-6">
        <div style={{ left: BORDER_L + PAD_L }} className="absolute bottom-0">
          <span className={WALL.label}>Today</span>
        </div>
        <div style={{ marginLeft: trackLeft, marginRight: PAD_R }} className="relative h-6">
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
            style={{ left: `calc(${trackLeft}px + (100% - ${trackLeft + PAD_R}px) * ${axis.nowPct / 100})` }}
            className="absolute top-0 bottom-0 w-[3px] bg-[#C2603A] dark:bg-[#E0895F] rounded-full z-10 pointer-events-none"
          >
            <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#C2603A] dark:bg-[#E0895F]" />
          </div>
        )}

        {tracks.map((t, i) => (
          <Track key={t.memberId} track={t} index={i} onTapItem={onTapItem} onTapMember={onTapMember} />
        ))}
      </div>
    </div>
  );
}
