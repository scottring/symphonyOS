import { useMemo } from 'react'
import type { WallDayData } from '@/hooks/useWallData'
import { formatTime } from '@/lib/timeUtils'
import type { TimelineItem } from '@/types/timeline'

interface WallTodayTimelineProps {
  todayData: WallDayData | undefined
}

const NODE_COLORS = ['bg-[#6DC4A7]', 'bg-[#F26E63]', 'bg-[#F9C35C]', 'bg-[#6DC4A7]']

interface TimelineNode {
  id: string
  time: string | null
  sortKey: number
  title: string
  completed: boolean
  type: 'event' | 'task' | 'routine' | 'playbook'
  colorClass: string
  isPast: boolean
}

function getTimelineNodes(todayData: WallDayData | undefined): TimelineNode[] {
  if (!todayData) return []

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nodes: TimelineNode[] = []
  let colorIdx = 0

  for (const section of ['allday', 'morning', 'afternoon', 'evening'] as const) {
    const items: TimelineItem[] = todayData.items[section] || []
    for (const item of items) {
      if (item.skipped) continue

      let sortKey = 0
      let timeStr: string | null = null

      if (item.startTime && !item.allDay) {
        const d = new Date(item.startTime)
        sortKey = d.getHours() * 60 + d.getMinutes()
        timeStr = formatTime(item.startTime)
      } else if (section === 'morning') {
        sortKey = 360
      } else if (section === 'afternoon') {
        sortKey = 720
      } else if (section === 'evening') {
        sortKey = 1020
      } else {
        sortKey = -1
      }

      nodes.push({
        id: item.id,
        time: timeStr,
        sortKey,
        title: item.title.toUpperCase(),
        completed: !!item.completed,
        type: item.type,
        colorClass: NODE_COLORS[colorIdx % NODE_COLORS.length],
        isPast: sortKey >= 0 && sortKey < nowMinutes,
      })
      colorIdx++
    }
  }

  nodes.sort((a, b) => a.sortKey - b.sortKey)
  return nodes
}

function getNowIndex(nodes: TimelineNode[]): number {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].sortKey >= 0 && nodes[i].sortKey >= nowMinutes) return i
  }
  return nodes.length
}

// Stem + label height above/below the line
const STEM_HEIGHT = 40
const LABEL_AREA = 52

export function WallTodayTimeline({ todayData }: WallTodayTimelineProps) {
  const nodes = useMemo(() => getTimelineNodes(todayData), [todayData])
  const nowIdx = useMemo(() => getNowIndex(nodes), [nodes])

  if (nodes.length === 0) {
    return (
      <div className="flex items-center h-full">
        <span className="text-white/30 italic text-[1.2rem] uppercase tracking-widest">
          Nothing else today
        </span>
      </div>
    )
  }

  // The line sits in the vertical center. Labels go above or below.
  // Total height: label area + stem + node + stem + label area
  const totalHeight = LABEL_AREA + STEM_HEIGHT + 20 + STEM_HEIGHT + LABEL_AREA
  const lineY = LABEL_AREA + STEM_HEIGHT + 8 // center of node row

  return (
    <div className="flex flex-col h-full">
      <div className="text-[1.3rem] font-bold uppercase tracking-[0.2em] text-white mb-2">
        Today's Schedule
      </div>

      <div className="relative flex-1">
        {/* Horizontal timeline line */}
        <div
          className="absolute left-0 right-0 h-1 bg-white/20 rounded-full"
          style={{ top: lineY }}
        />

        {/* Past segment fill */}
        {nowIdx > 0 && (
          <div
            className="absolute left-0 h-1 bg-white/40 rounded-full"
            style={{
              top: lineY,
              width: `${(Math.min(nowIdx, nodes.length) / nodes.length) * 100}%`,
            }}
          />
        )}

        {/* "Now" marker */}
        {nowIdx > 0 && nowIdx < nodes.length && (
          <div
            className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)] z-20 animate-pulse"
            style={{
              top: lineY - 4,
              left: `${(nowIdx / nodes.length) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        )}

        {/* Nodes with alternating above/below labels */}
        <div className="absolute inset-0 flex justify-between">
          {nodes.map((node, i) => {
            const isAbove = i % 2 === 0
            const opacity = node.completed ? 'opacity-40' : node.isPast ? 'opacity-60' : 'opacity-100'

            return (
              <div
                key={node.id}
                className={`relative flex-1 min-w-0 ${opacity}`}
              >
                {/* Node circle — on the line */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-5 h-5 rounded-full ${node.colorClass} shadow-md border-[3px] border-[#1e293b] z-10 ${node.completed ? 'ring-2 ring-green-400' : ''}`}
                  style={{ top: lineY - 8 }}
                />

                {/* Vertical stem connector */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-white/25"
                  style={isAbove
                    ? { top: lineY - 8 - STEM_HEIGHT, height: STEM_HEIGHT }
                    : { top: lineY + 12, height: STEM_HEIGHT }
                  }
                />

                {/* Time label — near the node circle */}
                {node.time && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-center"
                    style={isAbove
                      ? { top: lineY + 16 }
                      : { top: lineY - 24 }
                    }
                  >
                    <span className="text-[0.85rem] font-bold text-white/50 tracking-wider">
                      {node.time}
                    </span>
                  </div>
                )}

                {/* Title label — on the stem side (above or below) */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center text-center min-w-0"
                  style={isAbove
                    ? { bottom: totalHeight - lineY + 8 + STEM_HEIGHT - 4, width: 160 }
                    : { top: lineY + 12 + STEM_HEIGHT + 4, width: 160 }
                  }
                >
                  <span className={`text-[1.05rem] font-bold tracking-wider leading-tight text-center max-w-[150px] ${node.completed ? 'text-white/40 line-through' : 'text-white/90'}`} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {node.title}
                  </span>
                  {node.completed && (
                    <svg className="w-3.5 h-3.5 text-green-400 mt-0.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6L5 8.5L9.5 3.5" />
                    </svg>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
