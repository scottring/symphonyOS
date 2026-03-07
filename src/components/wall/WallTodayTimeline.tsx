import { useMemo } from 'react'
import type { WallDayData } from '@/hooks/useWallData'
import { formatTime } from '@/lib/timeUtils'
import type { TimelineItem } from '@/types/timeline' // used in getTimelineNodes

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
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const nodes: TimelineNode[] = []
  let colorIdx = 0

  if (!todayData) return nodes

  // Only show calendar events — routines already appear in the chores grid
  for (const section of ['allday', 'morning', 'afternoon', 'evening'] as const) {
    const items: TimelineItem[] = todayData.items[section] || []
    for (const item of items) {
      if (item.skipped || item.type === 'task' || item.type === 'routine') continue

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

/**
 * Self-contained horizontal timeline.
 * Layout (top to bottom, all within the component):
 *   - "Today's Schedule" header (20px)
 *   - Above labels zone (32px)
 *   - Above time zone (16px)
 *   - Horizontal line + nodes (16px)
 *   - Below time zone (16px)
 *   - Below labels zone (32px)
 * Total: ~132px — fits comfortably in a 140-150px container.
 */

const HEADER_H = 24
const LABEL_H = 30
const TIME_H = 16
const LINE_Y = HEADER_H + LABEL_H + TIME_H + 8 // y position of the horizontal line

export function WallTodayTimeline({ todayData }: WallTodayTimelineProps) {
  const nodes = useMemo(() => getTimelineNodes(todayData), [todayData])
  const nowIdx = useMemo(() => getNowIndex(nodes), [nodes])

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="text-[1.1rem] font-bold uppercase tracking-[0.2em] text-white mb-2">
          Today's Schedule
        </div>
        <div className="flex items-center flex-1">
          <span className="text-white/30 italic text-[1rem] uppercase tracking-widest">
            Nothing else today
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-hidden">
      {/* Header */}
      <div className="text-[1.1rem] font-bold uppercase tracking-[0.2em] text-white" style={{ height: HEADER_H }}>
        Today's Schedule
      </div>

      {/* Timeline area */}
      <div className="relative" style={{ height: `calc(100% - ${HEADER_H}px)` }}>
        {/* Horizontal line */}
        <div
          className="absolute left-0 right-0 h-[3px] bg-white/20 rounded-full"
          style={{ top: LINE_Y - HEADER_H }}
        />

        {/* Past segment fill */}
        {nowIdx > 0 && (
          <div
            className="absolute left-0 h-[3px] bg-white/40 rounded-full"
            style={{
              top: LINE_Y - HEADER_H,
              width: `${(Math.min(nowIdx, nodes.length) / nodes.length) * 100}%`,
            }}
          />
        )}

        {/* "Now" marker */}
        {nowIdx > 0 && nowIdx < nodes.length && (
          <div
            className="absolute w-3 h-3 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)] z-20 animate-pulse"
            style={{
              top: LINE_Y - HEADER_H - 5,
              left: `${(nowIdx / nodes.length) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          />
        )}

        {/* Nodes */}
        <div className="absolute left-0 right-0 top-0 bottom-0 flex justify-between">
          {nodes.map((node, i) => {
            const isAbove = i % 2 === 0
            const opacity = node.completed ? 'opacity-40' : node.isPast ? 'opacity-60' : 'opacity-100'
            const lineTop = LINE_Y - HEADER_H

            return (
              <div
                key={node.id}
                className={`relative flex-1 min-w-0 ${opacity}`}
              >
                {/* Node circle on the line */}
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full ${node.colorClass} shadow-md border-2 border-[#1e293b] z-10 ${node.completed ? 'ring-2 ring-green-400' : ''}`}
                  style={{ top: lineTop - 6 }}
                />

                {/* Stem */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 w-[2px] bg-white/20"
                  style={isAbove
                    ? { top: lineTop - 6 - 18, height: 18 }
                    : { top: lineTop + 10, height: 18 }
                  }
                />

                {/* Title label */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 text-center"
                  style={isAbove
                    ? { top: 0, width: 130 }
                    : { top: lineTop + 10 + 18 + 14, width: 130 }
                  }
                >
                  <span
                    className={`text-[0.8rem] font-bold tracking-wider leading-tight block ${node.completed ? 'text-white/40 line-through' : 'text-white/85'}`}
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {node.title}
                  </span>
                </div>

                {/* Time label — opposite side from title */}
                {node.time && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 text-center"
                    style={isAbove
                      ? { top: lineTop + 10 + 18 + 2, width: 80 }
                      : { top: lineTop - 6 - 18 - 14, width: 80 }
                    }
                  >
                    <span className="text-[0.7rem] font-bold text-white/45 tracking-wider">
                      {node.time}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
