import { useMemo, useState, useCallback, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ContextViewProps } from './types'
import type { TimelineItem } from '@/types/timeline'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { EmailActionStrip } from './EmailActionStrip'

// ============================================================================
// HELPERS
// ============================================================================

const ACTIVITY_KEYWORDS = /\b(soccer|football|basketball|baseball|swim|dance|karate|martial\s*arts|gymnastics|piano|music|lesson|practice|class|tutoring|club|scouts|ballet|hockey|tennis|volleyball|lacrosse|track|cheer|yoga|art|theater|drama|rehearsal)\b/i

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getAfternoonEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const todayStr = toLocalDateStr(now)
  return events
    .filter(e => {
      const startStr = e.start_time || e.startTime
      if (!startStr) return false
      if (!startStr.startsWith(todayStr)) return false
      if (startStr.length <= 10) return false // skip all-day
      const d = new Date(startStr)
      return d.getHours() >= 14 // 2 PM or later
    })
    .sort((a, b) => {
      const aStr = a.start_time || a.startTime || ''
      const bStr = b.start_time || b.startTime || ''
      return aStr.localeCompare(bStr)
    })
}

function getActivityIcon(title: string): string {
  const lower = title.toLowerCase()
  if (/soccer|football/i.test(lower)) return '⚽'
  if (/basketball/i.test(lower)) return '🏀'
  if (/baseball|softball/i.test(lower)) return '⚾'
  if (/swim/i.test(lower)) return '🏊'
  if (/dance|ballet/i.test(lower)) return '💃'
  if (/karate|martial|taekwondo/i.test(lower)) return '🥋'
  if (/gymnastic/i.test(lower)) return '🤸'
  if (/piano|music|guitar|drum|violin/i.test(lower)) return '🎵'
  if (/art|paint|draw/i.test(lower)) return '🎨'
  if (/theater|drama|rehearsal/i.test(lower)) return '🎭'
  if (/scout/i.test(lower)) return '🏕️'
  if (/tutor|lesson/i.test(lower)) return '📖'
  if (/tennis/i.test(lower)) return '🎾'
  if (/hockey/i.test(lower)) return '🏒'
  if (/practice|class|club/i.test(lower)) return '📋'
  if (/pick.?up|drop.?off/i.test(lower)) return '🚗'
  return '📅'
}

function formatEventTime(event: CalendarEvent): string {
  const startStr = event.start_time || event.startTime
  if (!startStr || startStr.length <= 10) return ''
  const d = new Date(startStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

// Fun snack ideas
const SNACK_IDEAS = [
  { name: 'Apple slices + peanut butter', icon: '🍎' },
  { name: 'Cheese & crackers', icon: '🧀' },
  { name: 'Trail mix', icon: '🥜' },
  { name: 'Yogurt & berries', icon: '🫐' },
  { name: 'Celery & hummus', icon: '🥒' },
  { name: 'Banana & granola bar', icon: '🍌' },
  { name: 'Popcorn', icon: '🍿' },
  { name: 'String cheese & grapes', icon: '🍇' },
]

function getDailySnacks(): { name: string; icon: string }[] {
  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  const idx = dayOfYear % SNACK_IDEAS.length
  return [
    SNACK_IDEAS[idx],
    SNACK_IDEAS[(idx + 3) % SNACK_IDEAS.length],
  ]
}

function getHomeworkIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('math')) return '🔢'
  if (lower.includes('read')) return '📚'
  if (lower.includes('write') || lower.includes('essay')) return '✍️'
  if (lower.includes('science')) return '🔬'
  if (lower.includes('social') || lower.includes('history')) return '🌍'
  if (lower.includes('spell')) return '🔤'
  if (lower.includes('project')) return '🎨'
  return '📝'
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function AfterSchoolView({ data }: ContextViewProps) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const afternoonEvents = useMemo(() => getAfternoonEvents(data.calendarEvents, data.now), [data.calendarEvents, data.now])
  const snacks = useMemo(() => getDailySnacks(), [])

  // Separate activities from other events
  const { activities, otherEvents } = useMemo(() => {
    const acts: CalendarEvent[] = []
    const others: CalendarEvent[] = []
    for (const event of afternoonEvents) {
      if (ACTIVITY_KEYWORDS.test(event.title)) {
        acts.push(event)
      } else {
        others.push(event)
      }
    }
    return { activities: acts, otherEvents: others }
  }, [afternoonEvents])

  // Get homework/task items
  const homeworkItems = useMemo(() => {
    const todayData = data.days.find(d => d.isToday)
    if (!todayData) return []
    const items: TimelineItem[] = []
    for (const section of ['afternoon', 'evening', 'allday'] as const) {
      items.push(...(todayData.items[section] || []))
    }
    return items.filter(i =>
      !i.completed && !i.skipped && i.type === 'task'
    )
  }, [data.days])

  // Incomplete chores
  const incompleteChores = useMemo(() => {
    return data.todayChores.filter(c => !c.completed && !c.skipped)
  }, [data.todayChores])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (completedItems.has(id)) {
      setCompletedItems(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      return
    }

    setPressingId(id)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight

    timeoutRef.current = setTimeout(() => {
      setPressingId(null)
      confetti({ particleCount: 40, spread: 50, origin: { x, y }, colors: ['#60A5FA', '#6DC4A7', '#FFFFFF'] })
      setCompletedItems(prev => new Set(prev).add(id))
    }, 500)
  }, [completedItems])

  const handlePointerCancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingId(null)
  }, [])

  return (
    <div className="h-full flex gap-8">
      {/* Column 1: Activities & Schedule */}
      <div className="w-[36%] h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#60A5FA]/20 border-2 border-[#60A5FA]/30 flex items-center justify-center text-[2rem]">
            🎒
          </div>
          <div>
            <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
              After School
            </h2>
            <p className="text-[#60A5FA] font-bold text-[1rem] mt-1 uppercase tracking-wide">
              Today's Activities
            </p>
          </div>
        </div>

        {/* Activities */}
        {activities.length > 0 && (
          <div className="mb-6">
            <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-widest mb-3">
              Activities
            </div>
            <div className="flex flex-col gap-2">
              {activities.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-4 px-5 py-4 rounded-xl bg-[#60A5FA]/10 border border-[#60A5FA]/20"
                >
                  <span className="text-[1.6rem] flex-shrink-0">{getActivityIcon(event.title)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white/90 font-bold text-[1.1rem] truncate">{event.title}</div>
                    {event.location && (
                      <div className="text-white/40 font-bold text-[0.8rem] truncate mt-0.5">{event.location}</div>
                    )}
                  </div>
                  <div className="text-[#60A5FA] font-black text-[1rem] flex-shrink-0">
                    {formatEventTime(event)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other events */}
        {otherEvents.length > 0 && (
          <div className="mb-6">
            <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-widest mb-3">
              Schedule
            </div>
            <div className="flex flex-col gap-2">
              {otherEvents.map(event => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8"
                >
                  <span className="text-[1.1rem]">{getActivityIcon(event.title)}</span>
                  <span className="text-white/80 font-bold text-[1rem] flex-1 truncate">{event.title}</span>
                  <span className="text-white/40 font-bold text-[0.85rem] flex-shrink-0">
                    {formatEventTime(event)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activities.length === 0 && otherEvents.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[3rem] mb-2">🏡</div>
              <div className="text-white/40 font-bold text-[1.1rem] uppercase tracking-wider">
                Free afternoon!
              </div>
            </div>
          </div>
        )}

        {/* Social/playdate email action items */}
        {data.emailActionItems && (
          <EmailActionStrip
            items={data.emailActionItems}
            categories={['social']}
            title="Invitations & RSVPs"
            maxItems={3}
          />
        )}

        {/* Snack ideas */}
        <div className="mt-auto pt-4">
          <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-widest mb-3">
            Snack Ideas
          </div>
          <div className="flex gap-3">
            {snacks.map((snack, i) => (
              <div
                key={i}
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#6DC4A7]/8 border border-[#6DC4A7]/15"
              >
                <span className="text-[1.3rem]">{snack.icon}</span>
                <span className="text-white/60 font-bold text-[0.9rem]">{snack.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 2: Homework & Tasks */}
      <div className="w-[32%] h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[1.8rem]">📝</span>
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
            Homework
          </h2>
        </div>

        {homeworkItems.length > 0 ? (
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {homeworkItems.map(item => {
              const isDone = completedItems.has(item.id)
              const isPressing = pressingId === item.id

              return (
                <button
                  key={item.id}
                  onPointerDown={(e) => handlePointerDown(e, item.id)}
                  onPointerUp={handlePointerCancel}
                  onPointerLeave={handlePointerCancel}
                  onPointerCancel={handlePointerCancel}
                  className={`
                    relative flex items-center gap-3 px-5 py-4 rounded-xl text-left
                    transition-all duration-300 overflow-hidden select-none
                    ${isDone
                      ? 'bg-[#60A5FA]/10 border border-[#60A5FA]/20'
                      : 'bg-white/5 border border-white/8 hover:bg-white/8'
                    }
                    ${isPressing ? 'scale-[0.98]' : ''}
                  `}
                  style={{ touchAction: 'none' }}
                >
                  <div className={`absolute inset-0 bg-[#60A5FA]/15 origin-left pointer-events-none transition-all ${
                    isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                  }`} />
                  <span className="relative z-10 text-[1.2rem]">{getHomeworkIcon(item.title)}</span>
                  <span className={`relative z-10 font-bold text-[1.05rem] flex-1 ${
                    isDone ? 'text-white/40 line-through' : 'text-white/90'
                  }`}>
                    {item.title}
                  </span>
                  {isDone && (
                    <svg className="w-4 h-4 text-[#60A5FA] relative z-10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M2.5 6L5 8.5L9.5 3.5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[3rem] mb-2">✅</div>
              <div className="text-white/40 font-bold text-[1rem] uppercase tracking-wider">
                No homework today
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 3: Remaining Chores */}
      <div className="w-[32%] h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[1.8rem]">✨</span>
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
            Still To Do
          </h2>
        </div>

        {incompleteChores.length > 0 ? (
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
            {incompleteChores.map(item => {
              const isDone = completedItems.has(item.id)
              const isPressing = pressingId === item.id
              const icon = getChoreIcon(item.title)

              return (
                <button
                  key={item.id}
                  onPointerDown={(e) => handlePointerDown(e, item.id)}
                  onPointerUp={handlePointerCancel}
                  onPointerLeave={handlePointerCancel}
                  onPointerCancel={handlePointerCancel}
                  className={`
                    relative flex items-center gap-3 px-5 py-4 rounded-xl text-left
                    transition-all duration-300 overflow-hidden select-none
                    ${isDone
                      ? 'bg-[#6DC4A7]/10 border border-[#6DC4A7]/20'
                      : 'bg-white/5 border border-white/8 hover:bg-white/8'
                    }
                    ${isPressing ? 'scale-[0.98]' : ''}
                  `}
                  style={{ touchAction: 'none' }}
                >
                  <div className={`absolute inset-0 bg-[#6DC4A7]/15 origin-left pointer-events-none transition-all ${
                    isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                  }`} />
                  <span className="relative z-10 text-[1.2rem]">{icon}</span>
                  <span className={`relative z-10 font-bold text-[1.05rem] flex-1 ${
                    isDone ? 'text-white/40 line-through' : 'text-white/90'
                  }`}>
                    {item.title}
                  </span>
                  {isDone && (
                    <svg className="w-4 h-4 text-[#6DC4A7] relative z-10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M2.5 6L5 8.5L9.5 3.5" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[3rem] mb-2">🎉</div>
              <div className="text-white/40 font-bold text-[1rem] uppercase tracking-wider">
                All chores done!
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getChoreIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('walk') && lower.includes('dog')) return '🐕'
  if (lower.includes('jax')) return '🐕'
  if (lower.includes('feed')) return '🦴'
  if (lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('dish')) return '🧽'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('laundry') || lower.includes('fold')) return '👕'
  if (lower.includes('vacuum')) return '🧹'
  if (lower.includes('water') && lower.includes('plant')) return '🌱'
  return '⭐'
}
