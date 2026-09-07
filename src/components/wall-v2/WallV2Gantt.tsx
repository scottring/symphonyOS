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
import { BookOpen, HelpCircle, Home, Repeat, Star } from 'lucide-react';
import { WALL, personAccent } from './wallTheme';
import { HOUSEHOLD_ID } from './wallEventAttribution';
import { ZONE_SHOWN } from './wallGantt';
import type { GanttBoard, GanttBlock, GanttTrack } from './wallGantt';

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
/**
 * The zone column's own width: the board reserves `zoneW` px for it, and the
 * row already draws GAP between columns, so the element is that much narrower
 * and the track still starts at exactly NAME_W + zoneW.
 */
const zoneInner = (zoneW: number) => zoneW - GAP;

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
 * The zone: what this row has to say that has no place on a clock. Today's
 * special, an open homework sheet, a routine rare enough to be news. Three
 * lines, then "and N more" — the person's page has the rest, and on a person's
 * row the whole zone is the tap that opens it. A row never counts its own
 * items as a score; "and 1 more" is a door, not a tally.
 */
function Zone({ track, width, onTap }: { track: GanttTrack; width: number; onTap?: () => void }) {
  type Line = { key: string; icon: typeof Star; text: string; tone: string };
  const lines: Line[] = [
    ...(track.live ? [{ key: 'live', icon: BookOpen, text: track.live, tone: 'text-[#2E4638] dark:text-[#7FA893]' }] : []),
    // Homework first: it is the thing to DO on this row; the rest is what
    // the day looks like.
    ...track.homework.map((h) => ({
      key: `h-${h.id}`, icon: BookOpen, text: h.label,
      tone: h.late ? 'text-[#A8600F] dark:text-[#E0A959]' : 'text-[#2E4638] dark:text-[#BFE3CF]',
    })),
    ...track.zone.map((z) => ({
      key: `z-${z.id}`, icon: z.kind === 'routine' ? Repeat : Star, text: z.title, tone: WALL.ink,
    })),
  ];
  const shown = lines.slice(0, ZONE_SHOWN);
  const more = lines.length - shown.length;
  const body = (
    <>
      {shown.map((l) => (
        <span key={l.key} className={`flex items-center gap-1.5 min-w-0 text-[0.95rem] font-bold leading-tight ${l.tone}`}>
          <l.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{l.text}</span>
        </span>
      ))}
      {more > 0 && <span className={`text-[0.85rem] font-bold ${WALL.muted}`}>and {more} more</span>}
    </>
  );
  const cls = 'shrink-0 flex flex-col justify-center gap-0.5 min-w-0 text-left';
  if (!onTap) return <div data-testid="zone" style={{ width }} className={cls}>{body}</div>;
  return (
    <button
      type="button"
      data-testid="zone"
      onClick={onTap}
      aria-label={`${track.name}'s day, today`}
      style={{ width }}
      className={`${cls} active:scale-[.98] transition-transform`}
    >
      {body}
    </button>
  );
}

function Track({ track, index, zoneW, onTapItem, onTapMember }: { track: GanttTrack; index: number; zoneW: number; onTapItem?: (id: string) => void; onTapMember?: (memberId: string) => void }) {
  const hasBars = track.blocks.length > 0;
  const zoneEmpty = track.zone.length === 0 && track.homework.length === 0 && !track.live;
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

      {/* The zone column is reserved board-wide (zoneW is the same for every
          row) so the track still starts at one x for all of them and the
          ruler above means what it says. */}
      {zoneW > 0 && (
        <Zone
          track={track}
          width={zoneInner(zoneW)}
          onTap={onTapMember && track.memberId !== HOUSEHOLD_ID ? () => onTapMember(track.memberId) : undefined}
        />
      )}

      <div className="relative flex-1 min-w-0 h-full flex flex-col justify-center py-1">
        {/* The track is only reserved when something is actually drawn on it.
            Holding 44px open on an empty row is what made the evening wall
            read as broken rather than calm. */}
        {hasBars && (
          <div className="relative h-[44px] shrink-0">
            {track.blocks.map((b) => <Bar key={b.id} block={b} index={index} onTap={onTapItem} />)}
          </div>
        )}
        {!hasBars && track.laterCount > 0 && (
          <span className={`text-[1.05rem] font-bold ${WALL.muted}`}>+{track.laterCount} later</span>
        )}
        {/* A row with nothing on the clock and nothing in its zone says so
            once. A row whose zone has the words keeps the track quiet. */}
        {!hasBars && track.laterCount === 0 && zoneEmpty && (
          <span className={`text-[1.05rem] ${WALL.muted}`}>Nothing scheduled</span>
        )}
        {hasBars && track.laterCount > 0 && (
          <span className={`absolute right-0 top-0 text-[0.85rem] font-bold ${WALL.muted}`}>+{track.laterCount} later</span>
        )}
      </div>
    </div>
  );
}

export function WallV2Gantt({ board, onTapItem, onTapMember }: { board: GanttBoard; onTapItem?: (id: string) => void; onTapMember?: (memberId: string) => void }) {
  const { axis, tracks } = board;
  const trackLeft = BORDER_L + PAD_L + NAME_W + GAP + board.zoneW;
  // The 'Today' label sits over the zone column when there is one — those
  // are the words about today — and over the names otherwise.
  const todayLeft = BORDER_L + PAD_L + (board.zoneW > 0 ? NAME_W + GAP : 0);
  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Axis header. The offset is computed from the same pieces the tracks
          use — the labels are useless if they don't sit over their bars. */}
      <div className="shrink-0 relative h-6">
        <div style={{ left: todayLeft }} className="absolute bottom-0">
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
          <Track key={t.memberId} track={t} index={i} zoneW={board.zoneW} onTapItem={onTapItem} onTapMember={onTapMember} />
        ))}
      </div>
    </div>
  );
}
