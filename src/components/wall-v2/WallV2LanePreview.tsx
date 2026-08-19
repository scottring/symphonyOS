// src/components/wall-v2/WallV2LanePreview.tsx
//
// Design preview for the person-lane wall, mounted at /wall-lanes.
//
// It renders from a fixed payload rather than live data on purpose: the point
// is to judge composition on the actual TV, at the actual viewing distance,
// without needing an auth session on the Pi and without a quiet Tuesday making
// the layout look better (or worse) than it is. The real portraits ARE loaded,
// so what you see is the real art at the real size.
//
// This route is a staging area, not a destination. When the layout is settled,
// WallV2Shell adopts <WallV2Lanes/> against live `useWallData` days and this
// file goes away.

import { useEffect, useState } from 'react';
import { WALL } from './wallTheme';
import { WallV2Lanes } from './WallV2Lanes';
import type { WallLane } from './wallLanes';

const SCOTT = '4fd6259b-2246-4304-96c3-d93a12fd43ae';
const IRIS = '698227a4-1a01-43f0-b218-5c1307cf33ce';
const ELLA = 'cad5a788-e424-4b50-b7e8-fb35c4f11972';
const KALEB = 'aa264b2e-c4ee-44a8-be07-9c0cbdaa7277';

function lane(over: Partial<WallLane> & Pick<WallLane, 'memberId' | 'name'>): WallLane {
  return {
    time: null, meridiem: null, dayLabel: null, label: null,
    isToday: true, allDay: false, isEmpty: false, itemId: null, type: 'event',
    ...over,
  };
}

// Scene A — an ordinary weekday afternoon. Note Kaleb's lane falls forward to
// Friday: the case that would have rendered as a blank lane.
const SCENE_A: WallLane[] = [
  lane({ memberId: SCOTT, name: 'Scott', time: '3:45', meridiem: 'PM', label: 'Soccer pickup', itemId: 'a1' }),
  lane({ memberId: IRIS, name: 'Iris', time: '5:30', meridiem: 'PM', label: 'Call with the contractor', itemId: 'a2' }),
  lane({ memberId: ELLA, name: 'Ella', time: '4:15', meridiem: 'PM', label: 'Piano', itemId: 'a3' }),
  lane({ memberId: KALEB, name: 'Kaleb', time: '10:30', meridiem: 'AM', label: 'Dentist', dayLabel: 'Fri', isToday: false, itemId: 'a4' }),
];

// Scene B — the same wall a few hours later. Two lanes changed, one went to a
// resting state. Flipping between scenes is how you judge whether the motion
// reads as "look up" or as fidget.
const SCENE_B: WallLane[] = [
  lane({ memberId: SCOTT, name: 'Scott', time: '6:00', meridiem: 'PM', label: 'Dinner prep', itemId: 'b1' }),
  lane({ memberId: IRIS, name: 'Iris', time: '7:15', meridiem: 'PM', label: 'Book club', itemId: 'b2' }),
  lane({ memberId: ELLA, name: 'Ella', isEmpty: true, label: null, itemId: null }),
  lane({ memberId: KALEB, name: 'Kaleb', time: '10:30', meridiem: 'AM', label: 'Dentist', dayLabel: 'Fri', isToday: false, itemId: 'b4' }),
];

// Scene C — everyone converges. The merge case: one band instead of the same
// line printed four times.
const SCENE_C: WallLane[] = [
  lane({ memberId: SCOTT, name: 'Scott', time: '5:00', meridiem: 'PM', label: "Dinner at Grandma's", itemId: 'c1' }),
  lane({ memberId: IRIS, name: 'Iris', time: '5:00', meridiem: 'PM', label: "Dinner at Grandma's", itemId: 'c2' }),
  lane({ memberId: ELLA, name: 'Ella', time: '5:00', meridiem: 'PM', label: "Dinner at Grandma's", itemId: 'c3' }),
  lane({ memberId: KALEB, name: 'Kaleb', time: '5:00', meridiem: 'PM', label: "Dinner at Grandma's", itemId: 'c4' }),
];

const SCENES = [SCENE_A, SCENE_B, SCENE_C];

// Placeholder content only — post-its have no data model yet. Rendered so the
// composition can be judged with the band present; it is NOT a working feature.
const MOCK_NOTES = [
  { id: 'n1', text: 'Ella needs a white shirt for the concert', who: 'Iris' },
  { id: 'n2', text: 'Trash goes out tonight', who: 'Scott' },
  { id: 'n3', text: 'Library books are overdue', who: 'Iris' },
];

// Rotation is what separates a sticky note from a coloured rectangle, so it
// has to be visible at a glance — a fraction of a degree reads as a rendering
// bug, not as paper.
const NOTE_TINTS = [
  'bg-[#FBEFC0] dark:bg-[#4A4128] -rotate-[2.2deg]',
  'bg-[#E9F0D8] dark:bg-[#37402C] rotate-[1.6deg]',
  'bg-[#FADFD0] dark:bg-[#4A3629] -rotate-[1.1deg]',
];

function PostItBand() {
  return (
    // Notes are square-ish and left-packed rather than stretched full-width:
    // a note that spans a third of a TV stops looking like something someone
    // scribbled and starts looking like a banner. Extra vertical padding gives
    // the rotation room so the corners aren't clipped by the viewport edge.
    <div className="h-[196px] shrink-0 flex items-center gap-7 px-3">
      {MOCK_NOTES.map((n, i) => (
        <div
          key={n.id}
          className={`${NOTE_TINTS[i % NOTE_TINTS.length]} w-[248px] h-[158px] shrink-0 rounded-[3px] px-5 py-4 shadow-[0_3px_12px_rgba(90,75,55,.22)] flex flex-col justify-between`}
        >
          <div className="text-[1.35rem] leading-snug text-[#4A3D28] dark:text-[#EFE7D8]">
            {n.text}
          </div>
          <div className="text-[0.8rem] font-bold uppercase tracking-[0.15em] text-[#8A7D68] dark:text-[#A79A82]">
            {n.who}
          </div>
        </div>
      ))}
      <div className="w-[248px] h-[158px] shrink-0 rounded-[3px] border-2 border-dashed border-[#DDD0B4] dark:border-[#4A3D28] grid place-items-center text-[0.8rem] font-bold uppercase tracking-[0.15em] text-[#A79A82]">
        No data model yet
      </div>
    </div>
  );
}

export function WallV2LanePreview() {
  const [scene, setScene] = useState(0);

  // Auto-advance so the flap board can be judged from across the room without
  // anyone standing at the screen tapping. Slow on purpose: the question is
  // whether a change catches your eye, not whether the animation is pretty.
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setScene((s) => (s + 1) % SCENES.length), 6000);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <div className={`${WALL.root} h-screen w-screen p-5 flex flex-col gap-4`}>
      <div className="flex items-baseline justify-between shrink-0">
        <div>
          <div className={WALL.label}>Lane layout — design preview</div>
          <div className={`font-display text-[2rem] leading-tight ${WALL.inkStrong}`}>
            Wednesday, August 19
          </div>
        </div>
        <div className="flex items-center gap-2">
          {SCENES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setAuto(false); setScene(i); }}
              className={`w-11 h-11 rounded-xl font-bold ${
                i === scene
                  ? 'bg-[#2E4638] text-[#F5EFE2]'
                  : 'bg-[#EFE6D4] dark:bg-[#3E362A] text-[#8A7D68]'
              }`}
            >
              {String.fromCharCode(65 + i)}
            </button>
          ))}
          <button
            onClick={() => setAuto((a) => !a)}
            className={`h-11 px-4 rounded-xl font-bold ${
              auto ? 'bg-[#2E4638] text-[#F5EFE2]' : 'bg-[#EFE6D4] dark:bg-[#3E362A] text-[#8A7D68]'
            }`}
          >
            {auto ? 'Auto' : 'Manual'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4">
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <WallV2Lanes lanes={SCENES[scene]} />
        </div>

        {/* The two survivors from the old right column, at the width they'd
            actually get. Static here — the point is how much room the lanes
            have left, not these cards' content. */}
        <div className="w-[300px] shrink-0 flex flex-col gap-3">
          <div className={`${WALL.dinnerCard} p-5 flex-1`}>
            <div className={WALL.dinnerLabel}>Dinner</div>
            <div className={`font-display text-[1.9rem] leading-tight ${WALL.inkStrong}`}>
              Sheet-pan chicken
            </div>
            <div className={`mt-2 ${WALL.prepChip} inline-block`}>Prep 4:45 – 5:30</div>
          </div>
          <div className={`${WALL.card} p-5 flex-1`}>
            <div className={WALL.label}>At a glance</div>
            <div className={`mt-2 text-[1.05rem] leading-relaxed ${WALL.ink}`}>
              4 events today<br />2 tasks left<br />Trash night
            </div>
          </div>
        </div>
      </div>

      <PostItBand />
    </div>
  );
}
