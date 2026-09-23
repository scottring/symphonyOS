// Each place as a skyline silhouette for the wide, shallow band behind the
// desktop navigation (PlaceBand). The round medallions don't crop into a
// strip — a slice of Densely Urban read as a grid of windows, "like a prison"
// (Scott, 2026-09-23) — so the band gets its own art: two layers of simple
// shapes in the place's own colour, no windows, legible at a glance.
import type { PlaceId } from '@/config/places'
import { usePlaceOrDefault } from '@/hooks/usePlace'

const W = 640
const G = 88 // the ground line; every shape stands on it

type Shape =
  | ['rect', number, number, number] // x, top, width
  | ['gable', number, number, number, number] // x, eave, width, roof height
  | ['pine', number, number, number] // centre x, tip, width
  | ['tree', number, number, number] // centre x, crown centre y, radius
  | ['dome', number, number, number] // centre x, centre y, radius
  | ['poly', string] // points

interface Scene { far: Shape[]; near: Shape[] }

const rects = (xs: Array<[number, number, number]>): Shape[] => xs.map(([x, y, w]) => ['rect', x, y, w])

const SCENES: Record<PlaceId, Scene> = {
  urban: {
    far: rects([[0, 60, 34], [30, 50, 26], [60, 62, 24], [84, 40, 22], [120, 56, 30], [150, 44, 26], [176, 30, 16], [200, 52, 34],
      [240, 36, 24], [270, 54, 34], [310, 42, 28], [345, 58, 26], [372, 32, 22], [398, 48, 30], [432, 40, 26], [462, 56, 30],
      [494, 34, 18], [516, 50, 30], [550, 42, 26], [580, 58, 28], [610, 50, 30]]),
    near: [
      ...rects([[0, 70, 42], [40, 58, 24], [66, 72, 28], [96, 50, 26], [124, 66, 34], [160, 60, 22], [184, 54, 20], [206, 70, 36],
        [250, 50, 22], [276, 72, 26], [304, 62, 30], [336, 56, 22], [362, 68, 20], [384, 46, 26], [414, 66, 30], [446, 58, 24],
        [472, 64, 34], [510, 48, 22], [536, 70, 30], [568, 60, 26], [596, 68, 44]]),
      ['rect', 256, 26, 10], ['poly', '257,26 261,8 265,26'], // the tall spire
      ['rect', 102, 42, 14], ['rect', 516, 36, 10],
      ['poly', '384,46 397,36 410,46'],
    ],
  },
  'small-city': {
    far: [['poly', `0,${G} 0,64 80,54 160,62 240,52 320,58 400,50 480,60 560,52 ${W},58 ${W},${G}`]],
    near: [
      ['gable', 0, 68, 34, 10], ['gable', 36, 62, 30, 12], ['tree', 80, 70, 9], ['gable', 94, 66, 34, 11], ['gable', 130, 58, 28, 12],
      ['gable', 160, 70, 30, 9], ['tree', 206, 68, 10], ['gable', 222, 62, 30, 12],
      // the clock tower
      ['rect', 292, 34, 26], ['dome', 305, 34, 13], ['poly', '303,22 305,8 307,22'],
      ['gable', 262, 66, 28, 10], ['gable', 320, 64, 30, 11],
      ['gable', 356, 60, 28, 12], ['tree', 400, 70, 9], ['gable', 414, 68, 34, 9],
      // the church
      ['gable', 452, 56, 30, 12], ['rect', 486, 38, 12], ['poly', '486,38 492,20 498,38'],
      ['gable', 502, 66, 30, 10], ['tree', 548, 68, 10], ['gable', 564, 62, 32, 11], ['gable', 600, 70, 40, 9],
    ],
  },
  'mountain-town': {
    far: [['poly', `0,${G} 0,56 60,22 110,50 170,10 230,46 280,28 340,54 400,14 460,44 520,24 580,50 ${W},30 ${W},${G}`]],
    near: [
      ['pine', 12, 58, 16], ['pine', 30, 64, 14], ['pine', 48, 56, 16],
      ['gable', 70, 68, 26, 10], ['gable', 100, 72, 22, 8], ['pine', 136, 60, 16], ['pine', 152, 66, 14],
      ['gable', 180, 66, 28, 11], ['gable', 212, 70, 24, 9],
      // the church in the square
      ['gable', 250, 62, 30, 11], ['rect', 282, 40, 12], ['poly', '282,40 288,22 294,40'],
      ['gable', 300, 68, 26, 10], ['pine', 344, 58, 16], ['pine', 362, 64, 14],
      ['gable', 386, 66, 30, 11], ['gable', 420, 72, 22, 8], ['pine', 458, 56, 16], ['pine', 476, 62, 14],
      ['gable', 500, 68, 28, 10], ['pine', 546, 60, 16], ['pine', 564, 54, 18], ['pine', 586, 62, 14], ['pine', 612, 58, 16], ['pine', 630, 64, 14],
    ],
  },
  cabin: {
    far: [
      ['pine', 10, 40, 22], ['pine', 34, 50, 18], ['pine', 58, 34, 24], ['pine', 84, 46, 20], ['pine', 110, 38, 22], ['pine', 136, 52, 18],
      ['pine', 160, 36, 24], ['pine', 186, 48, 20], ['pine', 212, 42, 22], ['pine', 238, 54, 18], ['pine', 400, 44, 22], ['pine', 426, 36, 24],
      ['pine', 452, 50, 18], ['pine', 476, 40, 22], ['pine', 502, 32, 24], ['pine', 528, 46, 20], ['pine', 554, 38, 22], ['pine', 580, 50, 18],
      ['pine', 604, 36, 24], ['pine', 630, 46, 20],
    ],
    near: [
      ['pine', 206, 30, 26], ['pine', 236, 44, 22], ['pine', 262, 38, 22],
      // the cabin, its chimney and a thread of smoke
      ['gable', 290, 62, 64, 20], ['rect', 336, 44, 8],
      ['dome', 342, 36, 4], ['dome', 347, 28, 5], ['dome', 354, 19, 6],
      ['pine', 380, 36, 24], ['pine', 408, 46, 20], ['pine', 434, 40, 22],
    ],
  },
  farm: {
    far: [['poly', `0,${G} 0,62 100,52 200,60 300,50 400,58 500,48 ${W},56 ${W},${G}`]],
    near: [
      ['tree', 40, 64, 12], ['tree', 64, 70, 9],
      ['gable', 120, 64, 34, 14], // the farmhouse
      ['tree', 178, 66, 11],
      // the barn, the silo and the windmill
      ['gable', 262, 52, 60, 22], ['rect', 326, 36, 16], ['dome', 334, 36, 8],
      ['rect', 398, 34, 3], ['poly', '399.5,34 399.5,14 402,33'], ['poly', '399.5,34 419,32 401,36'], ['poly', '399.5,34 399,54 397,35'], ['poly', '399.5,34 380,36 398,32'],
      ['tree', 470, 66, 11], ['tree', 496, 70, 8],
      ['gable', 540, 70, 26, 9], ['tree', 598, 66, 12], ['tree', 624, 70, 9],
    ],
  },
}

function draw(shape: Shape, i: number) {
  switch (shape[0]) {
    case 'rect': { const [, x, y, w] = shape; return <rect key={i} x={x} y={y} width={w} height={G - y} /> }
    case 'gable': {
      const [, x, y, w, roof] = shape
      return <polygon key={i} points={`${x},${G} ${x},${y} ${x + w / 2},${y - roof} ${x + w},${y} ${x + w},${G}`} />
    }
    case 'pine': { const [, cx, y, w] = shape; return <polygon key={i} points={`${cx - w / 2},${G} ${cx},${y} ${cx + w / 2},${G}`} /> }
    case 'tree': {
      const [, cx, cy, r] = shape
      return <g key={i}><circle cx={cx} cy={cy} r={r} /><rect x={cx - 1.5} y={cy} width={3} height={G - cy} /></g>
    }
    case 'dome': { const [, cx, cy, r] = shape; return <circle key={i} cx={cx} cy={cy} r={r} /> }
    case 'poly': return <polygon key={i} points={shape[1]} />
  }
}

export function PlaceSkyline({ place, className = '' }: { place?: PlaceId; className?: string }) {
  const current = usePlaceOrDefault()
  const scene = SCENES[place ?? current]
  return (
    <svg viewBox={`0 0 ${W} ${G}`} preserveAspectRatio="xMidYMax meet" className={className} aria-hidden="true">
      <g className="place-skyline-far">{scene.far.map(draw)}</g>
      <g className="place-skyline-near">{scene.near.map(draw)}</g>
    </svg>
  )
}
