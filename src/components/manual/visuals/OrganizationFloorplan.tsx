// OrganizationFloorplan — Simplified floor plan with rooms colored by health
// Grid of spaces reflecting organizational state

import type { VisualProps } from './DomainVisual'

export function OrganizationFloorplan({ score, issues, size, className }: VisualProps) {
  const goodColor = '#34d399'
  const okColor = '#fbbf24'
  const badColor = '#f87171'
  const bgColor = score >= 75 ? '#d1fae5' : score >= 40 ? '#fef3c7' : '#fee2e2'

  // Rooms in a simplified floor plan layout
  const rooms = [
    { x: 12, y: 14, w: 24, h: 20, label: 'Kit' },   // Kitchen
    { x: 38, y: 14, w: 28, h: 20, label: 'Living' }, // Living
    { x: 68, y: 14, w: 20, h: 20, label: 'Off' },    // Office
    { x: 12, y: 36, w: 18, h: 18, label: 'Bath' },   // Bath
    { x: 32, y: 36, w: 22, h: 18, label: 'Bed 1' },  // Bedroom 1
    { x: 56, y: 36, w: 22, h: 18, label: 'Bed 2' },  // Bedroom 2
    { x: 80, y: 36, w: 8, h: 18 },                     // Closet
    { x: 12, y: 56, w: 38, h: 16, label: 'Gar' },    // Garage
    { x: 52, y: 56, w: 36, h: 16, label: 'Yard' },   // Yard
  ]

  // Color rooms based on score distribution
  const totalRooms = rooms.length
  const goodRooms = Math.ceil(totalRooms * (score / 100))
  const badRooms = Math.min(issues, totalRooms - goodRooms)

  const getRoomColor = (index: number) => {
    if (index < goodRooms) return goodColor
    if (index < goodRooms + badRooms) return badColor
    return okColor
  }

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      {/* Background */}
      <rect x="10" y="12" width="80" height="62" rx="3" fill={bgColor} opacity="0.15" />

      {/* Rooms */}
      {rooms.map((room, i) => (
        <g key={i}>
          <rect
            x={room.x}
            y={room.y}
            width={room.w}
            height={room.h}
            rx="2"
            fill={getRoomColor(i)}
            opacity="0.25"
            stroke={getRoomColor(i)}
            strokeWidth="1"
          />
          {room.label && (
            <text
              x={room.x + room.w / 2}
              y={room.y + room.h / 2 + 2}
              textAnchor="middle"
              fill="#78716c"
              fontSize="5.5"
              fontFamily="sans-serif"
            >
              {room.label}
            </text>
          )}
        </g>
      ))}

      {/* Outer walls */}
      <rect x="10" y="12" width="80" height="62" rx="3" fill="none" stroke="#a8a29e" strokeWidth="1.5" />

      {/* Score text */}
      <text x="50" y="86" textAnchor="middle" fill="#78716c" fontSize="9" fontFamily="sans-serif">
        {score}
      </text>
    </svg>
  )
}
