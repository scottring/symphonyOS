import { useState, useEffect, useMemo, useCallback } from 'react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'

// ============================================================================
// TYPES
// ============================================================================

interface WallTravelDayProps {
  calendarEvents: CalendarEvent[]
  weather?: {
    currentTemp: number
    condition: string
    highTemp: number
    lowTemp: number
    weatherCode: number
  } | null
  currentTime: Date
  onBack: () => void
}

interface TimelineEvent {
  id: string
  time: string
  sortMinutes: number
  title: string
  isPast: boolean
  isNext: boolean
  isFlight: boolean
  emoji: string
}

interface FlightDetails {
  flightNumber: string
  departureCode: string
  departureTime: string
  arrivalCode: string
  arrivalTime: string
  confirmation: string
  seats: string
  departureDate: Date
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GLASS = 'bg-white/[0.08] backdrop-blur-md border border-white/[0.1] rounded-[1.25rem]'

const PRE_DEPARTURE_CHECKLIST = [
  { id: 'jax', label: "Drop Jax at mom's", emoji: '🐕' },
  { id: 'suitcase', label: "Ella's suitcase (Target)", emoji: '🧳' },
  { id: 'snacks', label: 'Plane snacks', emoji: '🍿' },
  { id: 'shower', label: 'Scott shower', emoji: '🚿' },
  { id: 'laundry', label: 'Scott laundry', emoji: '👕' },
  { id: 'iris-workout', label: 'Iris workout', emoji: '🏋️' },
  { id: 'iris-brows', label: 'Iris eyebrows', emoji: '💅' },
  { id: 'pack', label: 'Pack all bags', emoji: '👜' },
  { id: 'devices', label: 'Charge devices (Fires, AirPods, headphones)', emoji: '🔋' },
  { id: 'meds', label: 'Meds + DBS charger packed', emoji: '💊' },
  { id: 'ids', label: 'IDs', emoji: '🪪' },
  { id: 'run-shoes', label: 'Running shoes in rollers', emoji: '👟' },
  { id: 'bulky-shoes', label: 'Wearing bulky shoes', emoji: '👞' },
  { id: 'bottles', label: 'Empty water bottles', emoji: '💧' },
  { id: 'load-car', label: 'Load car', emoji: '🚗' },
]

// ============================================================================
// HELPERS
// ============================================================================

function getEventStart(event: CalendarEvent): Date | null {
  try {
    const raw = event.start_time || event.startTime
    if (!raw) return null
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function getEventEnd(event: CalendarEvent): Date | null {
  try {
    const raw = event.end_time || event.endTime
    if (!raw) return null
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function formatTimeShort(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const period = h >= 12 ? 'PM' : 'AM'
  const display = h % 12 || 12
  return m === 0 ? `${display} ${period}` : `${display}:${m.toString().padStart(2, '0')} ${period}`
}

function isFlightEvent(event: CalendarEvent): boolean {
  return /flight\s*\d+/i.test(event.title) || (event.title.includes('✈️') && /\d{3,4}/.test(event.title))
}

function guessEmoji(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('breakfast') || lower.includes('🍳')) return '🍳'
  if (lower.includes('lunch') || lower.includes('🍽')) return '🍽️'
  if (lower.includes('target') || lower.includes('🎯')) return '🎯'
  if (lower.includes('workout') || lower.includes('🏋')) return '🏋️'
  if (lower.includes('eyebrow') || lower.includes('💅')) return '💅'
  if (lower.includes('pack') || lower.includes('🧳')) return '🧳'
  if (lower.includes('jax') || lower.includes('🐕') || lower.includes('dog')) return '🐕'
  if (lower.includes('load car') || lower.includes('leave') || lower.includes('🚗')) return '🚗'
  if (lower.includes('bwi') || lower.includes('airport') || lower.includes('tsa')) return '🛃'
  if (lower.includes('flight') || lower.includes('✈')) return '✈️'
  if (lower.includes('shower')) return '🚿'
  if (lower.includes('laundry')) return '👕'
  return '📌'
}

function stripEmoji(text: string): string {
  // Remove leading emoji characters (safe approach — trim known prefixes)
  return text
    .replace(/^[^\w\s(]+\s*/i, '')
    .replace(/^(✈️|🍳|🎯|🏋️|💅|🧳|🐕|🚗|🛃|🚿|👕|🍽️|📌)\s*/g, '')
    .trim() || text
}

function parseFlightDetails(event: CalendarEvent): FlightDetails | null {
  const start = getEventStart(event)
  if (!start) return null

  // Extract flight number from title: "✈️ Flight 1293 BWI → SFO"
  const flightMatch = event.title.match(/(?:flight\s*#?\s*)(\d{3,4})/i)
  const flightNumber = flightMatch ? flightMatch[1] : '???'

  // Extract airports from title
  const airportMatch = event.title.match(/([A-Z]{3})\s*[→\-–>]+\s*([A-Z]{3})/)
  const departureCode = airportMatch ? airportMatch[1] : 'BWI'
  const arrivalCode = airportMatch ? airportMatch[2] : 'SFO'

  const end = getEventEnd(event)

  // Parse description for confirmation and seats
  const desc = event.description || ''
  const confMatch = desc.match(/Confirmation\s+([A-Z0-9]{6})/i)
  const seatMatch = desc.match(/Row\s+\d+\s*\([^)]+\)/i)

  return {
    flightNumber,
    departureCode,
    departureTime: formatTimeShort(start),
    arrivalCode,
    arrivalTime: end ? formatTimeShort(end) : '???',
    confirmation: confMatch ? confMatch[1] : '',
    seats: seatMatch ? seatMatch[0] : '',
    departureDate: start,
  }
}

function getStorageKey(): string {
  const d = new Date()
  return `travel-day-checks-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export function WallTravelDay({ calendarEvents, weather, currentTime, onBack }: WallTravelDayProps) {
  // ═══ CHECKED STATE (localStorage, keyed by date) ═══
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(getStorageKey())
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

  useEffect(() => {
    localStorage.setItem(getStorageKey(), JSON.stringify(checked))
  }, [checked])

  const toggleCheck = useCallback((id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }))
  }, [])

  // ═══ PARSE FLIGHT ═══
  const flightEvent = useMemo(
    () => calendarEvents.find(isFlightEvent),
    [calendarEvents]
  )
  const flight = useMemo(
    () => (flightEvent ? parseFlightDetails(flightEvent) : null),
    [flightEvent]
  )

  // ═══ BUILD TIMELINE ═══
  const timeline = useMemo((): TimelineEvent[] => {
    const now = currentTime
    const nowMinutes = now.getHours() * 60 + now.getMinutes()

    const events: TimelineEvent[] = []

    for (const event of calendarEvents) {
      const start = getEventStart(event)
      if (!start) continue
      if (event.all_day) continue

      const startMinutes = start.getHours() * 60 + start.getMinutes()
      const end = getEventEnd(event)
      const endMinutes = end ? end.getHours() * 60 + end.getMinutes() : startMinutes + 30

      events.push({
        id: event.id,
        time: formatTimeShort(start),
        sortMinutes: startMinutes,
        title: stripEmoji(event.title),
        isPast: nowMinutes > endMinutes,
        isNext: false,
        isFlight: isFlightEvent(event),
        emoji: guessEmoji(event.title),
      })
    }

    events.sort((a, b) => a.sortMinutes - b.sortMinutes)

    // Mark the next upcoming event
    const nextIdx = events.findIndex(e => !e.isPast)
    if (nextIdx >= 0) {
      events[nextIdx] = { ...events[nextIdx], isNext: true }
    }

    return events
  }, [calendarEvents, currentTime])

  // ═══ COUNTDOWN ═══
  const countdown = useMemo(() => {
    if (!flight) return null
    const diff = flight.departureDate.getTime() - currentTime.getTime()
    if (diff <= 0) return 'NOW'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours === 0) return `${minutes}M`
    return `${hours}H ${minutes}M`
  }, [flight, currentTime])

  // Find "leave for airport" event for secondary countdown
  const leaveEvent = useMemo(() => {
    const e = calendarEvents.find(ev =>
      /load car|leave for/i.test(ev.title)
    )
    if (!e) return null
    const start = getEventStart(e)
    if (!start) return null
    return start
  }, [calendarEvents])

  const leaveCountdown = useMemo(() => {
    if (!leaveEvent) return null
    const diff = leaveEvent.getTime() - currentTime.getTime()
    if (diff <= 0) return 'NOW'
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    if (hours === 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
  }, [leaveEvent, currentTime])

  // ═══ CLOCK ═══
  const clockTime = useMemo(() => {
    const h = currentTime.getHours()
    const m = currentTime.getMinutes()
    const period = h >= 12 ? 'PM' : 'AM'
    const display = h % 12 || 12
    return { time: `${display}:${m.toString().padStart(2, '0')}`, period }
  }, [currentTime])

  // ═══ CHECKLIST PROGRESS ═══
  const checkedCount = PRE_DEPARTURE_CHECKLIST.filter(item => checked[item.id]).length
  const totalCount = PRE_DEPARTURE_CHECKLIST.length
  const progressPct = Math.round((checkedCount / totalCount) * 100)

  // ═══ DESTINATION ═══
  const destination = flight?.arrivalCode === 'SFO' ? 'San Francisco' : flight?.arrivalCode || 'Destination'

  return (
    <div className="wall-travel-day w-[1920px] h-[1080px] overflow-hidden flex flex-col select-none bg-[#141414] mx-auto relative">

      {/* ═══ HEADER ═══ */}
      <header className="relative z-10 px-10 pt-6 pb-4 flex items-center justify-between">
        {/* Left: Destination + Countdown */}
        <div className="flex items-center gap-6">
          <span className="text-[3rem] leading-none">✈️</span>
          <div>
            <div className="text-white font-black text-[2.8rem] leading-none tracking-tight uppercase">
              {destination}
            </div>
            <div className="flex items-center gap-4 mt-1">
              {countdown && (
                <span className="text-[#F9C35C] font-black text-[1.2rem] uppercase tracking-widest">
                  Departs in {countdown}
                </span>
              )}
              {leaveCountdown && (
                <span className="text-[#F26E63] font-bold text-[1rem] uppercase tracking-wider">
                  · Leave in {leaveCountdown}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Clock */}
        <div className="flex items-baseline gap-2">
          <time className="font-black text-[3.5rem] leading-none text-white tracking-tight">
            {clockTime.time}
          </time>
          <span className="text-[1.5rem] font-bold text-white/50">{clockTime.period}</span>
          <span className="text-[1.1rem] font-bold text-white/30 tracking-wider ml-3">
            {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}
          </span>
        </div>
      </header>

      {/* ═══ MAIN — 3 Column Grid ═══ */}
      <main
        className="flex-1 grid min-h-0 relative z-10 px-10 pb-6 gap-5"
        style={{ gridTemplateColumns: '420px 1fr 400px' }}
      >

        {/* ─── LEFT: Day Timeline ─── */}
        <div className={`${GLASS} p-6 min-h-0 overflow-hidden flex flex-col`}>
          <h2 className="text-white/40 font-black uppercase tracking-[0.2em] text-[0.8rem] mb-5">
            Today's Schedule
          </h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-1" style={{ scrollbarWidth: 'none' }}>
            {timeline.map((event, i) => (
              <div
                key={event.id}
                className={`flex items-center gap-4 py-3 px-3 rounded-xl transition-all ${
                  event.isFlight
                    ? 'bg-[#F9C35C]/15 border border-[#F9C35C]/20'
                    : event.isNext
                    ? 'bg-white/[0.06] border border-white/[0.08]'
                    : ''
                } ${event.isPast ? 'opacity-35' : ''}`}
              >
                {/* Time */}
                <div className="w-[90px] flex-shrink-0 text-right">
                  <span className={`font-bold text-[1.05rem] ${
                    event.isFlight ? 'text-[#F9C35C]' : event.isNext ? 'text-white' : 'text-white/60'
                  }`}>
                    {event.time}
                  </span>
                </div>

                {/* Dot + Line */}
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 20 }}>
                  <div className={`w-3 h-3 rounded-full ${
                    event.isFlight
                      ? 'bg-[#F9C35C] shadow-[0_0_8px_rgba(249,195,92,0.5)]'
                      : event.isNext
                      ? 'bg-[#6DC4A7] shadow-[0_0_8px_rgba(109,196,167,0.4)]'
                      : event.isPast
                      ? 'bg-white/30'
                      : 'bg-white/50'
                  }`} />
                  {i < timeline.length - 1 && (
                    <div className={`w-[2px] flex-1 mt-1 ${event.isPast ? 'bg-white/10' : 'bg-white/15'}`}
                      style={{ minHeight: 8 }}
                    />
                  )}
                </div>

                {/* Emoji + Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-[1.4rem] flex-shrink-0">{event.emoji}</span>
                  <span className={`font-bold text-[1.1rem] truncate ${
                    event.isFlight ? 'text-[#F9C35C]' : event.isNext ? 'text-white' : 'text-white/70'
                  }`}>
                    {event.title}
                  </span>
                </div>

                {/* Next indicator */}
                {event.isNext && !event.isFlight && (
                  <span className="text-[#6DC4A7] font-black text-[0.65rem] uppercase tracking-widest flex-shrink-0">
                    Next
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ─── CENTER: Checklist ─── */}
        <div className={`${GLASS} p-6 min-h-0 overflow-hidden flex flex-col`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white/40 font-black uppercase tracking-[0.2em] text-[0.8rem]">
              Pre-Departure Checklist
            </h2>
            <span className={`font-black text-[1rem] ${
              progressPct === 100 ? 'text-[#6DC4A7]' : 'text-white/50'
            }`}>
              {checkedCount}/{totalCount}
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-white/10 mb-5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                backgroundColor: progressPct === 100 ? '#6DC4A7' : progressPct > 60 ? '#F9C35C' : '#F26E63',
              }}
            />
          </div>

          {/* Checklist grid — 2 columns */}
          <div className="flex-1 grid gap-3 overflow-y-auto pr-1"
            style={{
              gridTemplateColumns: '1fr 1fr',
              alignContent: 'start',
              scrollbarWidth: 'none',
            }}
          >
            {PRE_DEPARTURE_CHECKLIST.map(item => {
              const isChecked = !!checked[item.id]
              return (
                <button
                  key={item.id}
                  onClick={() => toggleCheck(item.id)}
                  className={`flex items-center gap-3 px-4 py-4 rounded-xl border transition-all
                    active:scale-[0.97] select-none
                    ${isChecked
                      ? 'bg-[#6DC4A7]/15 border-[#6DC4A7]/25'
                      : 'bg-white/[0.04] border-white/[0.08] hover:bg-white/[0.08]'
                    }`}
                  style={{ touchAction: 'manipulation' }}
                >
                  {/* Check circle */}
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isChecked
                      ? 'bg-[#6DC4A7] border-[#6DC4A7]'
                      : 'border-white/30'
                  }`}>
                    {isChecked && (
                      <svg className="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  {/* Emoji + Label */}
                  <span className="text-[1.3rem] flex-shrink-0">{item.emoji}</span>
                  <span className={`font-bold text-[1rem] text-left leading-tight ${
                    isChecked ? 'text-white/40 line-through' : 'text-white'
                  }`}>
                    {item.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ─── RIGHT: Flight + Weather ─── */}
        <div className="flex flex-col gap-5 min-h-0">

          {/* Flight Card */}
          {flight && (
            <div className={`${GLASS} p-6 flex flex-col`}>
              <h2 className="text-white/40 font-black uppercase tracking-[0.2em] text-[0.8rem] mb-4">
                Flight {flight.flightNumber}
              </h2>

              {/* Route */}
              <div className="flex items-center justify-between mb-5">
                <div className="text-center">
                  <div className="text-white font-black text-[2.2rem] leading-none">{flight.departureCode}</div>
                  <div className="text-white/50 font-bold text-[1.1rem] mt-1">{flight.departureTime}</div>
                </div>

                <div className="flex-1 flex items-center px-4">
                  <div className="flex-1 h-[2px] bg-white/20" />
                  <span className="text-[1.5rem] mx-2">✈️</span>
                  <div className="flex-1 h-[2px] bg-white/20" />
                </div>

                <div className="text-center">
                  <div className="text-white font-black text-[2.2rem] leading-none">{flight.arrivalCode}</div>
                  <div className="text-white/50 font-bold text-[1.1rem] mt-1">{flight.arrivalTime}</div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2">
                {flight.confirmation && (
                  <div className="flex justify-between">
                    <span className="text-white/40 font-bold text-[0.85rem] uppercase tracking-wider">Confirmation</span>
                    <span className="text-white font-black text-[1.1rem] tracking-wider">{flight.confirmation}</span>
                  </div>
                )}
                {flight.seats && (
                  <div className="flex justify-between">
                    <span className="text-white/40 font-bold text-[0.85rem] uppercase tracking-wider">Seats</span>
                    <span className="text-white font-bold text-[0.95rem]">{flight.seats}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-white/40 font-bold text-[0.85rem] uppercase tracking-wider">Airline</span>
                  <span className="text-white font-bold text-[0.95rem]">Southwest</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40 font-bold text-[0.85rem] uppercase tracking-wider">Type</span>
                  <span className="text-[#6DC4A7] font-bold text-[0.95rem]">Nonstop</span>
                </div>
              </div>
            </div>
          )}

          {/* Weather at Destination */}
          <div className={`${GLASS} p-6 flex-1 flex flex-col`}>
            <h2 className="text-white/40 font-black uppercase tracking-[0.2em] text-[0.8rem] mb-4">
              Weather in SF
            </h2>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[3rem] leading-none">🌤️</span>
              <div>
                <div className="text-white font-black text-[2.8rem] leading-none">64°</div>
                <div className="text-white/50 font-bold text-[1.1rem]">Partly Cloudy</div>
              </div>
            </div>
            <div className="flex gap-4 mb-4">
              <div className="flex-1 bg-white/[0.06] rounded-xl px-4 py-3 text-center">
                <div className="text-white/40 font-bold text-[0.7rem] uppercase tracking-wider">High</div>
                <div className="text-white font-black text-[1.3rem]">64°</div>
              </div>
              <div className="flex-1 bg-white/[0.06] rounded-xl px-4 py-3 text-center">
                <div className="text-white/40 font-bold text-[0.7rem] uppercase tracking-wider">Low</div>
                <div className="text-white font-black text-[1.3rem]">54°</div>
              </div>
            </div>
            <div className="bg-white/[0.04] rounded-xl px-4 py-3">
              <p className="text-white/50 font-bold text-[0.85rem] leading-relaxed">
                Layers are the move. Chilly mornings (50s), pleasant afternoons. Pack hoodies.
              </p>
            </div>
          </div>

          {/* REAL ID Reminder */}
          <div className="bg-[#F26E63]/15 border border-[#F26E63]/25 rounded-[1.25rem] px-5 py-4 flex items-center gap-3">
            <span className="text-[1.5rem]">🪪</span>
            <div>
              <span className="text-[#F26E63] font-black text-[0.75rem] uppercase tracking-widest">REAL ID Required</span>
              <p className="text-white/50 font-bold text-[0.8rem] mt-0.5">Adults need REAL ID for domestic flights</p>
            </div>
          </div>
        </div>
      </main>

      {/* ═══ Back button ═══ */}
      <button
        onClick={onBack}
        className="fixed bottom-3 left-10 flex items-center gap-2 px-4 py-2 rounded-xl
                   bg-white/5 hover:bg-white/10 border border-white/10
                   text-white/30 hover:text-white/60 transition-all z-10 text-[0.85rem] font-bold"
        style={{ touchAction: 'manipulation' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Dashboard
      </button>

      {/* ═══ All Done celebration ═══ */}
      {progressPct === 100 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#6DC4A7]/20 text-[#6DC4A7] px-6 py-3 rounded-xl text-[1.1rem] font-black uppercase tracking-widest border border-[#6DC4A7]/30 z-50">
          ✅ All packed — ready to fly!
        </div>
      )}
    </div>
  )
}

// ============================================================================
// DETECTION HELPER (used by WallCalendar)
// ============================================================================

export function detectTravelDay(calendarEvents: CalendarEvent[]): boolean {
  return calendarEvents.some(isFlightEvent)
}
