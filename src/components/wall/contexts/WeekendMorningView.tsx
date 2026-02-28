import { useMemo, useState, useCallback, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ContextViewProps } from './types'
import type { TimelineItem } from '@/types/timeline'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { useWeather } from '@/hooks/useWeather'

// ============================================================================
// HELPERS
// ============================================================================

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getTodayEvents(events: CalendarEvent[], now: Date): CalendarEvent[] {
  const todayStr = toLocalDateStr(now)
  return events
    .filter(e => {
      const startStr = e.start_time || e.startTime
      if (!startStr) return false
      return startStr.startsWith(todayStr)
    })
    .sort((a, b) => {
      const aStr = a.start_time || a.startTime || ''
      const bStr = b.start_time || b.startTime || ''
      return aStr.localeCompare(bStr)
    })
}

function getEventIcon(title: string): string {
  const lower = title.toLowerCase()
  if (/soccer|football|basketball|baseball|sport/i.test(lower)) return '⚽'
  if (/swim/i.test(lower)) return '🏊'
  if (/park|playground|hike|trail|walk/i.test(lower)) return '🌳'
  if (/museum|zoo|aquarium/i.test(lower)) return '🏛️'
  if (/movie|film|cinema/i.test(lower)) return '🎬'
  if (/shop|store|mall|market|grocery/i.test(lower)) return '🛒'
  if (/church|synagogue|temple|service/i.test(lower)) return '⛪'
  if (/birthday|party|celebrate/i.test(lower)) return '🎂'
  if (/playdate|friend/i.test(lower)) return '👫'
  if (/library/i.test(lower)) return '📚'
  if (/lunch|brunch|dinner|restaurant|eat/i.test(lower)) return '🍽️'
  if (/clean|house|chore/i.test(lower)) return '🧹'
  if (/practice|lesson|class/i.test(lower)) return '📋'
  if (/doctor|dentist|appointment/i.test(lower)) return '🏥'
  if (/haircut|barber/i.test(lower)) return '💇'
  return '📅'
}

function formatEventTime(event: CalendarEvent): string {
  const startStr = event.start_time || event.startTime
  const allDay = event.all_day ?? event.allDay
  if (!startStr || startStr.length <= 10 || allDay) return 'All Day'
  const d = new Date(startStr)
  const h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return m === 0 ? `${hour} ${period}` : `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

function getChoreIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('vacuum') || lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('dish')) return '🧽'
  if (lower.includes('laundry') || lower.includes('fold') || lower.includes('wash')) return '👕'
  if (lower.includes('trash') || lower.includes('garbage') || lower.includes('recycl')) return '🗑️'
  if (lower.includes('bed') || lower.includes('sheet')) return '🛏️'
  if (lower.includes('dog') || lower.includes('jax') || lower.includes('pet') || lower.includes('feed')) return '🐕'
  if (lower.includes('yard') || lower.includes('mow') || lower.includes('garden') || lower.includes('plant')) return '🌱'
  if (lower.includes('cook') || lower.includes('meal') || lower.includes('prep')) return '👨‍🍳'
  if (lower.includes('bathroom')) return '🚿'
  if (lower.includes('organiz') || lower.includes('sort')) return '📦'
  return '⭐'
}

function getWeatherIcon(code: number): string {
  if (code === 0) return '☀️'
  if (code <= 3) return '⛅'
  if (code <= 48) return '🌫️'
  if (code <= 57) return '🌧️'
  if (code <= 67) return '🌧️'
  if (code <= 77) return '❄️'
  if (code <= 82) return '🌦️'
  if (code <= 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌤️'
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function WeekendMorningView({ data }: ContextViewProps) {
  const { weather } = useWeather()
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const todayEvents = useMemo(() => getTodayEvents(data.calendarEvents, data.now), [data.calendarEvents, data.now])

  // Get meal-related events
  const mealEvents = useMemo(() => {
    return todayEvents.filter(e =>
      /\b(breakfast|brunch|lunch|dinner|meal|cook|recipe)\b/i.test(e.title)
    )
  }, [todayEvents])

  // Get all chores for today
  const chores = useMemo(() => {
    return data.todayChores.filter(c => !c.completed && !c.skipped)
  }, [data.todayChores])

  // Get chores assigned per family member
  const choresByMember = useMemo(() => {
    const map = new Map<string, { member: typeof data.familyMembers[0]; items: TimelineItem[] }>()
    const unassigned: TimelineItem[] = []

    for (const chore of chores) {
      if (chore.assignedTo) {
        const member = data.familyMembers.find(m => m.id === chore.assignedTo)
        if (member) {
          if (!map.has(member.id)) {
            map.set(member.id, { member, items: [] })
          }
          map.get(member.id)!.items.push(chore)
          continue
        }
      }
      unassigned.push(chore)
    }

    return { assigned: Array.from(map.values()), unassigned }
  }, [chores, data.familyMembers])

  // Non-meal events for the schedule
  const scheduleEvents = useMemo(() => {
    return todayEvents.filter(e =>
      !/\b(breakfast|brunch|lunch|dinner|meal|cook|recipe)\b/i.test(e.title)
    )
  }, [todayEvents])

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
      confetti({ particleCount: 40, spread: 50, origin: { x, y }, colors: ['#F9C35C', '#6DC4A7', '#60A5FA', '#FFFFFF'] })
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

  const dayName = data.now.toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <div className="h-full flex gap-8">
      {/* Column 1: Today's Plan */}
      <div className="w-[35%] h-full flex flex-col">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#F9C35C]/20 border-2 border-[#F9C35C]/30 flex items-center justify-center text-[2rem]">
            ☀️
          </div>
          <div>
            <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
              {dayName}
            </h2>
            <p className="text-[#F9C35C] font-bold text-[1rem] mt-1 uppercase tracking-wide">
              Weekend Plan
            </p>
          </div>
        </div>

        {/* Weather strip */}
        {weather && (
          <div className="flex items-center gap-4 mb-6 px-5 py-3 rounded-xl bg-white/5 border border-white/8">
            <span className="text-[2rem]">{getWeatherIcon(weather.weatherCode)}</span>
            <div>
              <span className="text-white font-black text-[1.5rem]">{weather.currentTemp}°</span>
              <span className="text-white/40 font-bold text-[0.85rem] ml-2">{weather.condition}</span>
            </div>
            <div className="ml-auto text-white/30 font-bold text-[0.8rem]">
              H {weather.highTemp}° / L {weather.lowTemp}°
            </div>
          </div>
        )}

        {/* Schedule */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
          {scheduleEvents.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {scheduleEvents.map(event => {
                const allDay = event.all_day ?? event.allDay
                return (
                  <div
                    key={event.id}
                    className={`flex items-center gap-4 px-5 py-4 rounded-xl border ${
                      allDay
                        ? 'bg-[#F9C35C]/8 border-[#F9C35C]/15'
                        : 'bg-white/5 border-white/8'
                    }`}
                  >
                    <span className="text-[1.5rem] flex-shrink-0">{getEventIcon(event.title)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-white/90 font-bold text-[1.1rem] truncate">{event.title}</div>
                      {event.location && (
                        <div className="text-white/35 font-bold text-[0.8rem] truncate mt-0.5">{event.location}</div>
                      )}
                    </div>
                    <div className="text-white/50 font-black text-[0.85rem] flex-shrink-0 uppercase">
                      {formatEventTime(event)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-[3rem] mb-2">🏡</div>
                <div className="text-white/40 font-bold text-[1.1rem] uppercase tracking-wider">
                  Relaxing day at home
                </div>
              </div>
            </div>
          )}

          {/* Meals */}
          {mealEvents.length > 0 && (
            <div className="mt-6">
              <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-widest mb-3">
                Meals Today
              </div>
              <div className="flex flex-col gap-2">
                {mealEvents.map(event => (
                  <div
                    key={event.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#6DC4A7]/8 border border-[#6DC4A7]/15"
                  >
                    <span className="text-[1.2rem]">🍽️</span>
                    <span className="text-white/70 font-bold text-[1rem] flex-1 truncate">{event.title}</span>
                    <span className="text-white/35 font-bold text-[0.8rem]">{formatEventTime(event)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 2+3: Chores by family member */}
      <div className="flex-1 h-full flex flex-col">
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[1.8rem]">✨</span>
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
            Weekend Chores
          </h2>
        </div>

        <div className="flex-1 flex gap-6 overflow-hidden">
          {/* Assigned chores per member */}
          {choresByMember.assigned.length > 0 ? (
            <>
              {choresByMember.assigned.map(({ member, items }) => (
                <div key={member.id} className="flex-1 flex flex-col min-w-0">
                  {/* Member header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-black text-[0.8rem] border-2"
                      style={{ backgroundColor: member.color + '30', borderColor: member.color + '50' }}
                    >
                      {member.initials}
                    </div>
                    <span className="text-white/70 font-black text-[1rem] uppercase tracking-wider">
                      {member.name}
                    </span>
                  </div>

                  {/* Chore items */}
                  <div className="flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                    {items.map(item => {
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
                            relative flex items-center gap-3 px-4 py-3 rounded-xl text-left
                            transition-all duration-300 overflow-hidden select-none
                            ${isDone ? 'border' : 'bg-white/5 border border-white/8'}
                            ${isPressing ? 'scale-[0.98]' : ''}
                          `}
                          style={{
                            touchAction: 'none',
                            ...(isDone ? { backgroundColor: member.color + '12', borderColor: member.color + '25' } : {}),
                          }}
                        >
                          <div
                            className={`absolute inset-0 origin-left pointer-events-none transition-all ${
                              isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                            }`}
                            style={{ backgroundColor: member.color + '18' }}
                          />
                          <span className="relative z-10 text-[1.1rem]">{getChoreIcon(item.title)}</span>
                          <span className={`relative z-10 font-bold text-[0.95rem] flex-1 truncate ${
                            isDone ? 'text-white/40 line-through' : 'text-white/85'
                          }`}>
                            {item.title}
                          </span>
                          {isDone && (
                            <svg className="w-3.5 h-3.5 relative z-10 flex-shrink-0" style={{ color: member.color }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <path d="M2.5 6L5 8.5L9.5 3.5" />
                            </svg>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Unassigned chores */}
              {choresByMember.unassigned.length > 0 && (
                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-white/40 font-black text-[1rem] uppercase tracking-wider">
                      Anyone
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                    {choresByMember.unassigned.map(item => {
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
                            relative flex items-center gap-3 px-4 py-3 rounded-xl text-left
                            transition-all duration-300 overflow-hidden select-none
                            ${isDone
                              ? 'bg-[#F9C35C]/10 border border-[#F9C35C]/20'
                              : 'bg-white/5 border border-white/8'
                            }
                            ${isPressing ? 'scale-[0.98]' : ''}
                          `}
                          style={{ touchAction: 'none' }}
                        >
                          <div className={`absolute inset-0 bg-[#F9C35C]/15 origin-left pointer-events-none transition-all ${
                            isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                          }`} />
                          <span className="relative z-10 text-[1.1rem]">{getChoreIcon(item.title)}</span>
                          <span className={`relative z-10 font-bold text-[0.95rem] flex-1 truncate ${
                            isDone ? 'text-white/40 line-through' : 'text-white/85'
                          }`}>
                            {item.title}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* No assigned chores, show all in one column */
            <div className="flex-1 flex flex-col">
              {chores.length > 0 ? (
                <div className="flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                  {chores.map(item => {
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
                            ? 'bg-[#F9C35C]/10 border border-[#F9C35C]/20'
                            : 'bg-white/5 border border-white/8 hover:bg-white/8'
                          }
                          ${isPressing ? 'scale-[0.98]' : ''}
                        `}
                        style={{ touchAction: 'none' }}
                      >
                        <div className={`absolute inset-0 bg-[#F9C35C]/15 origin-left pointer-events-none transition-all ${
                          isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                        }`} />
                        <span className="relative z-10 text-[1.3rem]">{getChoreIcon(item.title)}</span>
                        <span className={`relative z-10 font-bold text-[1.1rem] flex-1 ${
                          isDone ? 'text-white/40 line-through' : 'text-white/90'
                        }`}>
                          {item.title}
                        </span>
                        {isDone && (
                          <svg className="w-4 h-4 text-[#F9C35C] relative z-10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
                    <div className="text-white/40 font-bold text-[1.1rem] uppercase tracking-wider">
                      No chores today!
                    </div>
                    <div className="text-white/25 font-bold text-[0.9rem] mt-1">
                      Enjoy the weekend
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
