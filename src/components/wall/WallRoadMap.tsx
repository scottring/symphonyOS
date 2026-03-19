import { useRef, useCallback, useState, useMemo, useLayoutEffect } from 'react'
import type { TimelineItem } from '@/types/timeline'
import confetti from 'canvas-confetti'

// ============================================================================
// TYPES
// ============================================================================

interface WallRoadMapProps {
  choreItems: TimelineItem[]
  taskItems: TimelineItem[]
  onComplete: (item: TimelineItem) => void
  overdueItems: TimelineItem[]
  currentTime: Date
}

interface PlacedBuilding {
  item: TimelineItem
  x: number
  y: number
  roadX: number  // point on the road (for time labels)
  roadY: number
  side: 'left' | 'right'
  fraction: number
}

// ============================================================================
// CONSTANTS
// ============================================================================

// SVG viewBox dimensions
const VB_W = 1200
const VB_H = 700

// The snaking road path (bottom-left → top-right, 3 S-curves)
const ROAD_PATH =
  'M 80 640 C 200 640 320 540 420 480 C 520 420 280 340 200 280 C 120 220 300 160 480 140 C 660 120 780 200 860 160 C 940 120 1000 80 1120 80'

// Day boundaries (6 AM → 9 PM = 15 hours)
const DAY_START_MIN = 6 * 60  // 360
const DAY_END_MIN = 21 * 60   // 1260
const DAY_SPAN = DAY_END_MIN - DAY_START_MIN // 900

// Building offset from road center
const BUILDING_OFFSET = 55

// Min spacing between buildings along the path (in path-length units)
const MIN_SPACING = 50

// ============================================================================
// HELPERS
// ============================================================================

function timeToFraction(startTime: Date | null): number {
  if (!startTime) return 0.5 // unscheduled → middle
  const d = new Date(startTime)
  const minutes = d.getHours() * 60 + d.getMinutes()
  return Math.max(0, Math.min(1, (minutes - DAY_START_MIN) / DAY_SPAN))
}

function formatItemTime(item: TimelineItem): string | null {
  if (!item.startTime) return null
  const d = new Date(item.startTime)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p' : 'a'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`
}

function getEmojiIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('walk') && lower.includes('jax')) return '🐕'
  if (lower.includes('teeth')) return '🪥'
  if (lower.includes('jax') || lower.includes('dog') || lower.includes('feed')) return '🦴'
  if (lower.includes('read') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep') || lower.includes('routine')) return '🛏️'
  if (lower.includes('clean') || lower.includes('tidy') || lower.includes('kitchen')) return '🧹'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('dress') || lower.includes('clothes')) return '👕'
  if (lower.includes('homework')) return '📝'
  if (lower.includes('pick') && lower.includes('up')) return '🚶'
  if (lower.includes('school') || lower.includes('walk kids')) return '🎒'
  if (lower.includes('dinner') || lower.includes('meal') || lower.includes('cook')) return '🍽️'
  if (lower.includes('shower') || lower.includes('bath')) return '🚿'
  if (lower.includes('cancel') || lower.includes('call') || lower.includes('phone')) return '📞'
  if (lower.includes('plan') || lower.includes('childcare') || lower.includes('find')) return '📋'
  return '⭐'
}

// Get building color palette by item type
function getBuildingColors(item: TimelineItem): { wall: string; roof: string; accent: string } {
  switch (item.type) {
    case 'routine':
      return { wall: '#F26E63', roof: '#C0504D', accent: '#FFD4D0' }
    case 'event':
      return { wall: '#6DC4A7', roof: '#4A9B82', accent: '#D0F0E4' }
    case 'playbook':
      return { wall: '#A78BFA', roof: '#7C5FD3', accent: '#E4D8FF' }
    case 'task':
    default:
      return { wall: '#F9C35C', roof: '#D4A033', accent: '#FFF3D0' }
  }
}

// Get normal vector at a point along the path (perpendicular to tangent)
function getNormalAtLength(path: SVGPathElement, len: number, totalLen: number): { nx: number; ny: number } {
  const delta = 1
  const p1 = path.getPointAtLength(Math.max(0, len - delta))
  const p2 = path.getPointAtLength(Math.min(totalLen, len + delta))
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  const mag = Math.sqrt(dx * dx + dy * dy) || 1
  return { nx: -dy / mag, ny: dx / mag }
}

// ============================================================================
// BUILDING SVG COMPONENTS
// ============================================================================

function HouseBuilding({ colors }: { colors: { wall: string; roof: string } }) {
  return (
    <g>
      <ellipse cx={0} cy={22} rx={24} ry={6} fill="rgba(0,0,0,0.12)" />
      <rect x={-18} y={-10} width={36} height={32} rx={3} fill={colors.wall} />
      <polygon points="-22,-10 0,-30 22,-10" fill={colors.roof} />
      <rect x={8} y={-28} width={6} height={12} rx={1} fill={colors.roof} />
    </g>
  )
}

function ShopBuilding({ colors }: { colors: { wall: string; roof: string } }) {
  return (
    <g>
      <ellipse cx={0} cy={22} rx={26} ry={6} fill="rgba(0,0,0,0.12)" />
      <rect x={-20} y={-8} width={40} height={30} rx={3} fill={colors.wall} />
      <path d="M-22,-8 L-22,-14 C-22,-14 -11,-6 0,-14 C11,-6 22,-14 22,-14 L22,-8 Z" fill={colors.roof} />
    </g>
  )
}

function PublicBuilding({ colors }: { colors: { wall: string; roof: string } }) {
  return (
    <g>
      <ellipse cx={0} cy={22} rx={28} ry={6} fill="rgba(0,0,0,0.12)" />
      <rect x={-24} y={-6} width={48} height={28} rx={3} fill={colors.wall} />
      <polygon points="-26,-6 0,-24 26,-6" fill={colors.roof} />
      <line x1={0} y1={-24} x2={0} y2={-34} stroke={colors.roof} strokeWidth={1.5} />
      <polygon points="0,-34 10,-30 0,-26" fill={colors.roof} />
    </g>
  )
}

function CastleBuilding({ colors }: { colors: { wall: string; roof: string } }) {
  return (
    <g>
      <ellipse cx={0} cy={22} rx={26} ry={6} fill="rgba(0,0,0,0.12)" />
      <rect x={-14} y={-16} width={28} height={38} rx={3} fill={colors.wall} />
      <rect x={-22} y={-10} width={10} height={32} rx={1} fill={colors.wall} />
      <polygon points="-22,-10 -17,-18 -12,-10" fill={colors.roof} />
      <rect x={12} y={-10} width={10} height={32} rx={1} fill={colors.wall} />
      <polygon points="12,-10 17,-18 22,-10" fill={colors.roof} />
      <rect x={-14} y={-20} width={6} height={4} fill={colors.roof} />
      <rect x={-2} y={-20} width={6} height={4} fill={colors.roof} />
      <rect x={8} y={-20} width={6} height={4} fill={colors.roof} />
    </g>
  )
}

function BuildingSVG({ item }: { item: TimelineItem }) {
  const colors = getBuildingColors(item)
  switch (item.type) {
    case 'routine': return <HouseBuilding colors={colors} />
    case 'event': return <PublicBuilding colors={colors} />
    case 'playbook': return <CastleBuilding colors={colors} />
    case 'task':
    default: return <ShopBuilding colors={colors} />
  }
}

// ============================================================================
// LANDSCAPE DECORATIONS
// ============================================================================

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      <rect x={-3} y={0} width={6} height={14} rx={1} fill="#8B6914" />
      <circle cx={0} cy={-6} r={14} fill="#5CB85C" />
      <circle cx={-8} cy={0} r={10} fill="#4CAF50" />
      <circle cx={8} cy={0} r={10} fill="#4CAF50" />
    </g>
  )
}

function Bush({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <ellipse cx={0} cy={0} rx={14} ry={10} fill="#5CB85C" />
      <ellipse cx={-8} cy={2} rx={10} ry={8} fill="#4CAF50" />
      <ellipse cx={8} cy={2} rx={10} ry={8} fill="#4CAF50" />
    </g>
  )
}

function Cloud({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`} opacity={0.5}>
      <ellipse cx={0} cy={0} rx={30} ry={14} fill="white" />
      <ellipse cx={-18} cy={4} rx={20} ry={10} fill="white" />
      <ellipse cx={18} cy={4} rx={20} ry={10} fill="white" />
    </g>
  )
}

function Signpost({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-2} y={-24} width={4} height={34} rx={1} fill="#8B6914" />
      <rect x={-42} y={-38} width={84} height={22} rx={5} fill="#D4A033" />
      <rect x={-40} y={-36} width={80} height={18} rx={4} fill="#F9C35C" />
      <text x={0} y={-23} textAnchor="middle" fontSize={12} fontWeight="900" fill="#5C3D0A" letterSpacing={1.5}>
        {label}
      </text>
    </g>
  )
}

function TrafficLight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-2} y={-24} width={4} height={28} rx={1} fill="#555" />
      <rect x={-6} y={-38} width={12} height={20} rx={3} fill="#333" />
      <circle cx={0} cy={-32} r={3} fill="#E74C3C" />
      <circle cx={0} cy={-26} r={3} fill="#F1C40F" />
      <circle cx={0} cy={-20} r={3} fill="#2ECC71" />
    </g>
  )
}

function StopSign({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-1.5} y={-16} width={3} height={22} rx={1} fill="#888" />
      {/* Octagon approximated as circle */}
      <circle cx={0} cy={-22} r={8} fill="#E74C3C" />
      <text x={0} y={-19} textAnchor="middle" fontSize={5} fontWeight="900" fill="white">STOP</text>
    </g>
  )
}

function Flower({ x, y, color = '#FF69B4' }: { x: number; y: number; color?: string }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-1} y={0} width={2} height={8} fill="#4CAF50" />
      <circle cx={0} cy={-2} r={4} fill={color} />
      <circle cx={0} cy={-2} r={2} fill="#FFD700" />
    </g>
  )
}

// Bicycle "now" marker
function BicycleMarker({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`} className="wall-road-bike">
      {/* Glow */}
      <circle cx={0} cy={0} r={18} fill="rgba(109, 196, 167, 0.25)" className="wall-road-bike-glow" />
      {/* Back wheel */}
      <circle cx={-10} cy={4} r={7} fill="none" stroke="#333" strokeWidth={2} />
      <circle cx={-10} cy={4} r={1.5} fill="#666" />
      {/* Front wheel */}
      <circle cx={10} cy={4} r={7} fill="none" stroke="#333" strokeWidth={2} />
      <circle cx={10} cy={4} r={1.5} fill="#666" />
      {/* Frame */}
      <line x1={-10} y1={4} x2={-2} y2={-6} stroke="#E74C3C" strokeWidth={2} strokeLinecap="round" />
      <line x1={-2} y1={-6} x2={10} y2={4} stroke="#E74C3C" strokeWidth={2} strokeLinecap="round" />
      <line x1={-10} y1={4} x2={4} y2={4} stroke="#E74C3C" strokeWidth={2} strokeLinecap="round" />
      <line x1={4} y1={4} x2={-2} y2={-6} stroke="#E74C3C" strokeWidth={2} strokeLinecap="round" />
      {/* Handlebars */}
      <line x1={8} y1={-4} x2={12} y2={-6} stroke="#333" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={10} y1={4} x2={8} y2={-4} stroke="#333" strokeWidth={1.5} strokeLinecap="round" />
      {/* Seat */}
      <line x1={-4} y1={-8} x2={0} y2={-8} stroke="#333" strokeWidth={2} strokeLinecap="round" />
      <line x1={-2} y1={-6} x2={-2} y2={-8} stroke="#333" strokeWidth={1.5} strokeLinecap="round" />
    </g>
  )
}

// Completed checkmark flag on a building
function CompletedFlag() {
  return (
    <g transform="translate(16, -28)">
      <line x1={0} y1={0} x2={0} y2={-14} stroke="#4CAF50" strokeWidth={1.5} />
      <rect x={0} y={-14} width={12} height={9} rx={1} fill="#4CAF50" />
      <text x={6} y={-7} textAnchor="middle" fontSize={7} fill="white">✓</text>
    </g>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function WallRoadMap({ choreItems, taskItems, onComplete, overdueItems, currentTime }: WallRoadMapProps) {
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [pathReady, setPathReady] = useState(false)
  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Signal when path element is available for measurement
  useLayoutEffect(() => {
    if (pathRef.current) setPathReady(true)
  }, [])

  // Combine all items into a single timeline
  const allItems = useMemo(() => {
    const overdueIds = new Set(overdueItems.map(i => i.id))
    const combined = [
      ...choreItems,
      ...taskItems.filter(i => !overdueIds.has(i.id)),
      ...overdueItems.filter(i => !i.completed),
    ]
    // Sort by start time (null times last)
    combined.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : Infinity
      const bTime = b.startTime ? new Date(b.startTime).getTime() : Infinity
      return aTime - bTime
    })
    return combined
  }, [choreItems, taskItems, overdueItems])

  // Compute building positions along the path
  const placedBuildings = useMemo((): PlacedBuilding[] => {
    const path = pathRef.current
    if (!path || !pathReady) return []

    const totalLen = path.getTotalLength()
    const buildings: PlacedBuilding[] = []
    let lastPlacedLen = -MIN_SPACING * 2

    allItems.forEach((item, index) => {
      const fraction = timeToFraction(item.startTime ? new Date(item.startTime) : null)
      let targetLen = fraction * totalLen

      // Enforce minimum spacing
      if (targetLen - lastPlacedLen < MIN_SPACING) {
        targetLen = lastPlacedLen + MIN_SPACING
      }
      // Clamp to path length
      targetLen = Math.min(targetLen, totalLen - 10)
      lastPlacedLen = targetLen

      const point = path.getPointAtLength(targetLen)
      const { nx, ny } = getNormalAtLength(path, targetLen, totalLen)
      const side = index % 2 === 0 ? 'left' : 'right'
      const sign = side === 'left' ? 1 : -1

      buildings.push({
        item,
        x: point.x + nx * BUILDING_OFFSET * sign,
        y: point.y + ny * BUILDING_OFFSET * sign,
        roadX: point.x,
        roadY: point.y,
        side,
        fraction: targetLen / totalLen,
      })
    })

    return buildings
  }, [allItems, pathReady])

  // "Now" position on the road
  const bikePosition = useMemo(() => {
    const path = pathRef.current
    if (!path || !pathReady) return null
    const fraction = timeToFraction(currentTime)
    const totalLen = path.getTotalLength()
    const point = path.getPointAtLength(fraction * totalLen)
    return { x: point.x, y: point.y }
  }, [currentTime, pathReady])

  // Section signpost positions (1/3 and 2/3 of path)
  const signpostPositions = useMemo(() => {
    const path = pathRef.current
    if (!path || !pathReady) return []
    const totalLen = path.getTotalLength()
    const morningEnd = path.getPointAtLength(totalLen * 0.33)
    const afternoonEnd = path.getPointAtLength(totalLen * 0.67)
    return [
      { x: morningEnd.x, y: morningEnd.y, label: 'AFTERNOON' },
      { x: afternoonEnd.x, y: afternoonEnd.y, label: 'EVENING' },
    ]
  }, [pathReady])

  // Long-press completion handler
  const handlePointerDown = useCallback((e: React.PointerEvent, item: TimelineItem) => {
    e.stopPropagation()
    if (item.completed) {
      onComplete(item) // undo
      return
    }
    setPressingId(item.id)
    const svg = svgRef.current
    if (!svg) return

    timeoutRef.current = setTimeout(() => {
      setPressingId(null)
      // Get screen position for confetti
      const rect = svg.getBoundingClientRect()
      // Approximate: center of SVG
      const cx = (rect.left + rect.width / 2) / window.innerWidth
      const cy = (rect.top + rect.height / 2) / window.innerHeight
      confetti({ particleCount: 80, spread: 60, origin: { x: cx, y: cy }, colors: ['#6DC4A7', '#F9C35C', '#F26E63', '#FFFFFF'] })
      setTimeout(() => onComplete(item), 300)
    }, 700)
  }, [onComplete])

  const handlePointerCancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingId(null)
  }, [])

  return (
    <div className="w-full h-full relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid slice"
        style={{ touchAction: 'none' }}
      >
        {/* ═══ LANDSCAPE BACKGROUND ═══ */}
        <rect x={0} y={0} width={VB_W} height={VB_H} fill="#7ec850" rx={16} />

        {/* Grass variation patches */}
        <ellipse cx={150} cy={150} rx={80} ry={40} fill="#72B847" opacity={0.6} />
        <ellipse cx={900} cy={400} rx={100} ry={50} fill="#72B847" opacity={0.5} />
        <ellipse cx={600} cy={600} rx={120} ry={40} fill="#72B847" opacity={0.4} />
        <ellipse cx={1050} cy={250} rx={70} ry={35} fill="#72B847" opacity={0.5} />

        {/* ═══ ROAD ═══ */}
        {/* Road shadow */}
        <path d={ROAD_PATH} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={56} strokeLinecap="round" strokeLinejoin="round" transform="translate(2, 3)" />
        {/* Road surface */}
        <path ref={pathRef} d={ROAD_PATH} fill="none" stroke="#555" strokeWidth={50} strokeLinecap="round" strokeLinejoin="round" />
        {/* Road edge lines */}
        <path d={ROAD_PATH} fill="none" stroke="#777" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
        {/* Center dashed line */}
        <path d={ROAD_PATH} fill="none" stroke="white" strokeWidth={2.5} strokeDasharray="16 12" strokeLinecap="round" />

        {/* ═══ LANDSCAPE DECORATIONS ═══ */}
        {/* Trees */}
        <Tree x={60} y={100} scale={0.8} />
        <Tree x={180} y={80} scale={1} />
        <Tree x={700} y={60} scale={0.9} />
        <Tree x={1050} y={50} scale={0.7} />
        <Tree x={1140} y={140} scale={1} />
        <Tree x={950} y={480} scale={0.85} />
        <Tree x={50} y={400} scale={0.9} />
        <Tree x={1100} y={400} scale={0.75} />
        <Tree x={350} y={620} scale={0.7} />
        <Tree x={800} y={600} scale={0.8} />

        {/* Bushes */}
        <Bush x={300} y={120} />
        <Bush x={580} y={80} />
        <Bush x={130} y={550} />
        <Bush x={1000} y={330} />
        <Bush x={700} y={500} />

        {/* Clouds */}
        <Cloud x={250} y={40} scale={0.7} />
        <Cloud x={650} y={30} scale={0.9} />
        <Cloud x={1000} y={25} scale={0.6} />

        {/* Flowers */}
        <Flower x={420} y={560} color="#FF69B4" />
        <Flower x={440} y={570} color="#FFD700" />
        <Flower x={460} y={555} color="#FF6347" />
        <Flower x={100} y={300} color="#FF69B4" />
        <Flower x={120} y={310} color="#9370DB" />
        <Flower x={880} y={350} color="#FFD700" />
        <Flower x={900} y={360} color="#FF69B4" />

        {/* Traffic signs */}
        <TrafficLight x={520} y={430} />
        <StopSign x={160} y={230} />
        <TrafficLight x={920} y={140} />

        {/* Section signposts */}
        <Signpost x={100} y={580} label="MORNING" />
        {signpostPositions.map((sp, i) => (
          <Signpost key={i} x={sp.x + 40} y={sp.y - 50} label={sp.label} />
        ))}

        {/* ═══ TIME LABELS ON ROAD ═══ */}
        {placedBuildings.map((pb) => {
          const timeStr = formatItemTime(pb.item)
          if (!timeStr) return null
          return (
            <g key={`time-${pb.item.id}`} transform={`translate(${pb.roadX}, ${pb.roadY})`}>
              <rect x={-14} y={-8} width={28} height={16} rx={6} fill="rgba(0,0,0,0.55)" />
              <text x={0} y={4} textAnchor="middle" fontSize={10} fontWeight="800" fill="white" style={{ pointerEvents: 'none' }}>
                {timeStr}
              </text>
            </g>
          )
        })}

        {/* ═══ BUILDINGS ═══ */}
        {placedBuildings.map((pb) => {
          const isPressing = pressingId === pb.item.id
          const isCompleted = pb.item.completed

          return (
            <g
              key={pb.item.id}
              transform={`translate(${pb.x}, ${pb.y})`}
              opacity={isCompleted ? 0.4 : 1}
              onPointerDown={(e) => handlePointerDown(e, pb.item)}
              onPointerUp={handlePointerCancel}
              onPointerLeave={handlePointerCancel}
              onPointerCancel={handlePointerCancel}
              style={{ cursor: 'pointer' }}
            >
              {/* Press fill indicator */}
              {isPressing && (
                <circle cx={0} cy={0} r={30} fill="rgba(255,255,255,0.25)" className="wall-road-press-fill" />
              )}

              {/* Building shape */}
              <BuildingSVG item={pb.item} />

              {/* Emoji icon centered on building face */}
              <text x={0} y={10} textAnchor="middle" fontSize={24} style={{ pointerEvents: 'none' }}>
                {getEmojiIcon(pb.item.title)}
              </text>

              {/* Completed flag */}
              {isCompleted && <CompletedFlag />}

              {/* Title label underneath */}
              <text
                x={0} y={38}
                textAnchor="middle"
                fontSize={12}
                fontWeight="900"
                fill="white"
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={2.5}
                paintOrder="stroke"
                style={{ pointerEvents: 'none' }}
              >
                {pb.item.title}
              </text>
            </g>
          )
        })}

        {/* ═══ BIKE "NOW" MARKER ═══ */}
        {bikePosition && (
          <BicycleMarker x={bikePosition.x} y={bikePosition.y} />
        )}
      </svg>

      {/* ═══ CSS ANIMATIONS ═══ */}
      <style>{`
        .wall-road-bike-glow {
          animation: bike-pulse 2s ease-in-out infinite;
        }
        @keyframes bike-pulse {
          0%, 100% { r: 18; opacity: 0.25; }
          50% { r: 24; opacity: 0.4; }
        }
        .wall-road-press-fill {
          animation: press-grow 0.7s ease-out forwards;
        }
        @keyframes press-grow {
          from { r: 5; opacity: 0.5; }
          to { r: 35; opacity: 0; }
        }
      `}</style>
    </div>
  )
}
