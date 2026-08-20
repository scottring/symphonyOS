// src/components/wall-v2/WallV2PersonLane.tsx
//
// One person, one lane, one line. The lane is the wall's primary structure —
// what used to be a 116px family strip pinned under everything else is now the
// thing the wall is made of, which is why the portrait gets real size here.
//
// Deliberately absent: a second "then" item, a task count, a progress bar. The
// lane answers "where does this person need to be next" and nothing else. Every
// extra field is a vote to go back to the board of cards this replaced.

import { useState } from 'react';
import { WALL, personAccent } from './wallTheme';
import { WallV2Flap } from './WallV2Flap';
import type { WallLane } from './wallLanes';

function Portrait({ memberId, name }: { memberId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  // Sized FROM the lane, not fixed: the lanes are flex-1 of whatever height the
  // screen gives them, so a hard 128px portrait spills out of its card on any
  // display shorter than the one it was designed against. self-stretch takes
  // the lane's content height and aspect-square derives the width from it, with
  // a cap so it doesn't become absurd on a very tall screen.
  const shell =
    'self-stretch aspect-square max-h-[132px] shrink-0 rounded-2xl border-2 border-[#EEE1C7] dark:border-[#4A3D28]';

  // Same silent fallback the family strip uses: a bad id renders a monogram
  // rather than a broken image, so a missing face is a data bug, not a crash.
  if (failed) {
    return (
      <div
        className={`${shell} bg-[radial-gradient(circle_at_35%_28%,#F4E5CA,#DCC49A)] dark:bg-[radial-gradient(circle_at_35%_28%,#4A3D28,#332C22)] grid place-items-center font-display text-[3rem] text-[#6E5A3A] dark:text-[#D8BC85]`}
      >
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

export function WallV2PersonLane({
  lane, index, onTap,
}: {
  lane: WallLane;
  index: number;
  onTap?: (itemId: string | null, label: string | null) => void;
}) {
  return (
    <button
      type="button"
      disabled={lane.isEmpty}
      onClick={() => onTap?.(lane.itemId, lane.label)}
      className={`${WALL.card} border-l-4 ${personAccent(index)} flex items-center gap-7 px-6 py-4 min-h-0 flex-1 overflow-hidden text-left w-full disabled:cursor-default active:scale-[.995] transition-transform`}
    >
      <Portrait memberId={lane.memberId} name={lane.name} />

      <div className="w-[190px] shrink-0">
        <div className={`font-display text-[clamp(1.3rem,3.4vh,2.4rem)] leading-tight truncate ${WALL.inkStrong}`}>
          {lane.name}
        </div>
      </div>

      {/* The departure field. Fixed-width so four lanes align into a column
          even when one person's time is "9:05" and another's is "11:30". */}
      <div className="w-[268px] shrink-0 flex items-baseline gap-2">
        {lane.time ? (
          <>
            <WallV2Flap
              value={lane.time}
              className={`font-display text-[clamp(2rem,5.6vh,4rem)] leading-none tabular-nums ${WALL.inkStrong}`}
            />
            <span className={`text-[1.4rem] font-bold ${WALL.muted}`}>{lane.meridiem}</span>
          </>
        ) : (
          <span className={`font-display text-[clamp(1.2rem,3.2vh,2.2rem)] leading-none ${WALL.muted}`}>
            {lane.isEmpty ? '—' : 'All day'}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {lane.isEmpty ? (
          // The resting state. "Nothing scheduled" is a real answer and reads
          // calm; a blank lane reads broken.
          <div className={`text-[clamp(1.1rem,3vh,2.1rem)] ${WALL.muted}`}>Nothing scheduled</div>
        ) : (
          <div className="flex items-baseline gap-3 min-w-0">
            {/* A day qualifier only when the item isn't today — the rail already
                says what today is, so "Wed" on every lane would be noise. */}
            {lane.dayLabel && (
              <span
                className={`${WALL.label} text-[0.9rem] shrink-0 px-2.5 py-1.5 rounded-md bg-[#F2E4C4] dark:bg-[#4A3D28] text-[#7A5A2E] dark:text-[#D8BC85]`}
              >
                {lane.dayLabel}
              </span>
            )}
            <span className={`text-[clamp(1.3rem,3.4vh,2.4rem)] leading-tight truncate ${WALL.ink}`}>
              {lane.label}
            </span>
          </div>
        )}
      </div>
    </button>
  );
}
