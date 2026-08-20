// src/components/wall-v2/WallV2Lanes.tsx
//
// The stack of person lanes, plus the "everyone's in the same place" case.
//
// When three or more lanes resolve to the same commitment the wall collapses
// them into one full-width band. The instinct people have here is a slot
// machine, and the spin is a fine transition to build later — but the value is
// the merge itself: printing "Dinner at Grandma's" once at full width instead
// of four times in four lanes is a legibility win the animation doesn't
// provide.

import { WALL, personAccent } from './wallTheme';
import { WallV2Flap } from './WallV2Flap';
import { WallV2PersonLane } from './WallV2PersonLane';
import { mergeAlignedLanes, type WallLane } from './wallLanes';

function AlignedBand({ lanes }: { lanes: WallLane[] }) {
  const merged = mergeAlignedLanes(lanes);
  const involved = lanes.filter((l) => merged.memberIds.includes(l.memberId));

  return (
    // When the whole household converges, the wall should feel like it's
    // announcing something — so the band takes the room the four lanes gave up
    // and centers, rather than sitting as a thin strip in a tall empty card.
    <div
      className={`${WALL.dinnerCard} flex flex-col items-center justify-center gap-[3vh] px-10 py-8 flex-1 min-h-0 overflow-hidden`}
    >
      <div className="flex -space-x-6 shrink-0">
        {involved.map((l, i) => (
          <img
            key={l.memberId}
            src={`/wall/portrait-${l.memberId}.png`}
            alt=""
            className={`w-[min(132px,18vh)] h-[min(132px,18vh)] rounded-2xl border-4 border-[#FCF5E7] dark:border-[#332A1D] object-cover shadow-[0_2px_10px_rgba(90,75,55,.16)] ${personAccent(i)}`}
          />
        ))}
      </div>

      <div className="text-center min-w-0 max-w-full">
        <div className={WALL.dinnerLabel}>Everyone</div>
        <div className={`font-display text-[clamp(1.8rem,6vh,4.2rem)] leading-tight truncate ${WALL.inkStrong}`}>
          {merged.label}
        </div>
      </div>

      {merged.time && (
        <div className="flex items-baseline gap-3 shrink-0">
          <WallV2Flap
            value={merged.time}
            className={`font-display text-[clamp(2.2rem,7vh,5rem)] leading-none tabular-nums ${WALL.inkStrong}`}
          />
          <span className={`text-[1.8rem] font-bold ${WALL.muted}`}>{merged.meridiem}</span>
        </div>
      )}
    </div>
  );
}

export function WallV2Lanes({
  lanes, onTapLane,
}: {
  lanes: WallLane[];
  onTapLane?: (itemId: string | null, label: string | null) => void;
}) {
  const merged = mergeAlignedLanes(lanes);

  // Aligned: one band, plus lanes for anyone not swept into it (a kid who
  // isn't coming to the thing still needs their own line).
  if (merged.aligned) {
    const leftovers = lanes.filter((l) => !merged.memberIds.includes(l.memberId));
    return (
      <div className="flex flex-col gap-3 min-h-0 flex-1">
        <AlignedBand lanes={lanes} />
        {leftovers.map((lane) => (
          <WallV2PersonLane
            key={lane.memberId}
            lane={lane}
            index={lanes.findIndex((l) => l.memberId === lane.memberId)}
            onTap={onTapLane}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 min-h-0 flex-1">
      {lanes.map((lane, i) => (
        <WallV2PersonLane key={lane.memberId} lane={lane} index={i} onTap={onTapLane} />
      ))}
    </div>
  );
}
