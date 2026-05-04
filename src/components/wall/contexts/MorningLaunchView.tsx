import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import confetti from 'canvas-confetti'
import type { ContextViewProps } from './types'
import type { TimelineItem } from '@/types/timeline'
import { useWeather } from '@/hooks/useWeather'
import { useActionableInstances } from '@/hooks/useActionableInstances'
import { EmailActionStrip } from './EmailActionStrip'

function parseRoutineId(timelineItemId: string): string | null {
  return timelineItemId.startsWith('routine-') ? timelineItemId.slice(8) : null
}

// ============================================================================
// HELPERS
// ============================================================================

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

function getOutfitSuggestion(temp: number, code: number): string {
  if (code >= 51 && code <= 82) {
    if (temp < 45) return 'Rain jacket + warm layers'
    return 'Rain jacket + umbrella'
  }
  if (code >= 71 && code <= 86) return 'Snow boots + heavy coat'
  if (temp < 32) return 'Heavy coat, hat, gloves'
  if (temp < 45) return 'Warm jacket + layers'
  if (temp < 60) return 'Light jacket or hoodie'
  if (temp < 75) return 'Long sleeves or light layer'
  return 'Short sleeves, sunscreen'
}

function getSchoolItemIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('lunch') || lower.includes('snack')) return '🥪'
  if (lower.includes('backpack') || lower.includes('bag')) return '🎒'
  if (lower.includes('homework') || lower.includes('folder')) return '📝'
  if (lower.includes('teeth') || lower.includes('brush')) return '🪥'
  if (lower.includes('dress') || lower.includes('clothes') || lower.includes('uniform')) return '👕'
  if (lower.includes('shoe')) return '👟'
  if (lower.includes('hair')) return '💇'
  if (lower.includes('breakfast') || lower.includes('eat')) return '🥣'
  if (lower.includes('water') || lower.includes('bottle')) return '💧'
  if (lower.includes('form') || lower.includes('sign') || lower.includes('permission')) return '📋'
  if (lower.includes('instrument') || lower.includes('music')) return '🎵'
  if (lower.includes('sport') || lower.includes('gym') || lower.includes('practice')) return '⚽'
  return '✅'
}

// Default morning prep steps if no routines exist
const DEFAULT_MORNING_STEPS = [
  'Get dressed',
  'Brush teeth',
  'Eat breakfast',
  'Pack backpack',
  'Shoes on',
  'Out the door!',
]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function WeatherColumn({ temp, code, high, low, condition }: {
  temp: number
  code: number
  high: number
  low: number
  condition: string
}) {
  const outfit = getOutfitSuggestion(temp, code)
  const icon = getWeatherIcon(code)

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-[6rem] leading-none">{icon}</div>
      <div className="text-center">
        <div className="text-white font-black text-[4rem] leading-none">{temp}°</div>
        <div className="text-white/50 font-bold text-[1.1rem] mt-1 uppercase tracking-wider">
          {condition}
        </div>
        <div className="text-white/30 font-bold text-[0.9rem] mt-1">
          H {high}° / L {low}°
        </div>
      </div>

      {/* Outfit suggestion */}
      <div className="bg-[#F9C35C]/15 border border-[#F9C35C]/25 rounded-2xl px-6 py-4 max-w-[280px] text-center">
        <div className="text-[#F9C35C]/70 font-black text-[0.7rem] uppercase tracking-widest mb-1">
          Wear Today
        </div>
        <div className="text-white/80 font-bold text-[1.1rem]">
          {outfit}
        </div>
      </div>
    </div>
  )
}

function KidChecklist({
  name,
  color,
  items,
  completedSet,
  pressingId,
  onPointerDown,
  onPointerCancel,
}: {
  name: string
  color: string
  items: { id: string; title: string }[]
  completedSet: Set<string>
  pressingId: string | null
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>, id: string) => void
  onPointerCancel: () => void
}) {
  const progress = items.length > 0 ? completedSet.size / items.length : 0
  const allDone = progress === 1

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-[1rem] border-2"
          style={{ backgroundColor: color + '30', borderColor: color + '50' }}
        >
          {name[0]}
        </div>
        <h3 className="text-white font-black text-[1.4rem] uppercase tracking-wider">
          {name}
        </h3>
      </div>

      {/* Progress */}
      <div className="h-2 bg-white/10 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%`, backgroundColor: color }}
        />
      </div>

      {/* Items */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {items.map((item) => {
          const isDone = completedSet.has(item.id)
          const isPressing = pressingId === item.id
          const icon = getSchoolItemIcon(item.title)

          return (
            <button
              key={item.id}
              onPointerDown={(e) => onPointerDown(e, item.id)}
              onPointerUp={onPointerCancel}
              onPointerLeave={onPointerCancel}
              onPointerCancel={onPointerCancel}
              className={`
                relative flex items-center gap-3 px-4 py-3 rounded-xl text-left
                transition-all duration-300 overflow-hidden select-none
                ${isDone
                  ? 'border'
                  : 'bg-white/5 border border-white/8 hover:bg-white/8'
                }
                ${isPressing ? 'scale-[0.98]' : ''}
              `}
              style={{
                touchAction: 'none',
                ...(isDone ? { backgroundColor: color + '15', borderColor: color + '30' } : {}),
              }}
            >
              {/* Hold fill */}
              <div
                className={`absolute inset-0 origin-left pointer-events-none transition-all ${
                  isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                }`}
                style={{ backgroundColor: color + '20' }}
              />

              <span className="relative z-10 text-[1.2rem] flex-shrink-0">{icon}</span>
              <span className={`relative z-10 font-bold text-[1rem] transition-all duration-300 ${
                isDone ? 'text-white/40 line-through' : 'text-white/90'
              }`}>
                {item.title}
              </span>

              {isDone && (
                <svg className="w-4 h-4 ml-auto relative z-10 flex-shrink-0" style={{ color }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M2.5 6L5 8.5L9.5 3.5" />
                </svg>
              )}
            </button>
          )
        })}
      </div>

      {allDone && (
        <div className="mt-3 text-center py-3 rounded-xl" style={{ backgroundColor: color + '15', borderColor: color + '25' }}>
          <span className="text-[1.5rem]">🎉</span>
          <p className="font-black uppercase tracking-widest text-[0.8rem] mt-0.5" style={{ color }}>
            Ready to go!
          </p>
        </div>
      )}
    </div>
  )
}

function DepartureCountdown() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Default school departure: 7:20 AM
  const departure = new Date(now)
  departure.setHours(7, 20, 0, 0)

  const diff = departure.getTime() - now.getTime()
  if (diff <= 0) {
    return (
      <div className="bg-[#F26E63]/20 border border-[#F26E63]/30 rounded-2xl px-6 py-4 text-center">
        <div className="text-[#F26E63] font-black text-[1.2rem] uppercase tracking-widest animate-pulse">
          Time to go!
        </div>
      </div>
    )
  }

  const minutes = Math.floor(diff / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)
  const urgent = minutes < 10

  return (
    <div className={`rounded-2xl px-6 py-4 text-center border ${
      urgent
        ? 'bg-[#F26E63]/15 border-[#F26E63]/25'
        : 'bg-white/5 border-white/10'
    }`}>
      <div className={`font-black text-[0.7rem] uppercase tracking-widest mb-1 ${
        urgent ? 'text-[#F26E63]/70' : 'text-white/40'
      }`}>
        Departure In
      </div>
      <div className={`font-black text-[2.5rem] leading-none tabular-nums ${
        urgent ? 'text-[#F26E63]' : 'text-white/90'
      }`}>
        {minutes}:{seconds.toString().padStart(2, '0')}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function MorningLaunchView({ data }: ContextViewProps) {
  const { weather, loading, error, requestLocation } = useWeather()
  const { markDone, undoDone } = useActionableInstances()
  const [locationRequested, setLocationRequested] = useState(false)
  const [localOverrides, setLocalOverrides] = useState<Map<string, boolean>>(new Map())
  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get today's morning routines/tasks, split by family member
  const todayData = data.days.find(d => d.isToday)
  const morningItems = useMemo(() => {
    if (!todayData) return []
    const items: TimelineItem[] = []
    for (const section of ['morning', 'allday'] as const) {
      items.push(...(todayData.items[section] || []))
    }
    return items.filter(i => !i.skipped)
  }, [todayData])

  // Displayed completion = DB-backed item.completed, with optimistic local toggles applied on top
  const completedItems = useMemo(() => {
    const result = new Set(morningItems.filter(i => i.completed).map(i => i.id))
    for (const [id, done] of localOverrides) {
      if (done) result.add(id)
      else result.delete(id)
    }
    return result
  }, [morningItems, localOverrides])

  // Find kids in family members
  const kids = useMemo(() => {
    return data.familyMembers.filter(m =>
      m.role_label === 'child' || m.member_type === 'core'
    ).filter(m => {
      const lower = m.name.toLowerCase()
      return lower.includes('ella') || lower.includes('kaleb')
    })
  }, [data.familyMembers])

  // Build per-kid checklists from assigned items + defaults
  const kidChecklists = useMemo(() => {
    return kids.map(kid => {
      const assignedItems = morningItems
        .filter(i => i.assignedTo === kid.id)
        .map(i => ({ id: i.id, title: i.title }))

      // If no assigned items, use defaults
      const items = assignedItems.length > 0
        ? assignedItems
        : DEFAULT_MORNING_STEPS.map((step, idx) => ({
            id: `default-${kid.id}-${idx}`,
            title: step,
          }))

      return { kid, items }
    })
  }, [kids, morningItems])

  // If no kids found in family members, show generic checklist
  const genericChecklist = useMemo(() => {
    if (kids.length > 0) return null
    return DEFAULT_MORNING_STEPS.map((step, idx) => ({
      id: `default-${idx}`,
      title: step,
    }))
  }, [kids])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, id: string) => {
    if (completedItems.has(id)) {
      setLocalOverrides(prev => new Map(prev).set(id, false))
      const routineId = parseRoutineId(id)
      if (routineId) {
        undoDone('routine', routineId, data.now).catch(err => {
          console.error('Failed to undo morning routine completion:', err)
        })
      }
      return
    }

    setPressingId(id)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight

    timeoutRef.current = setTimeout(() => {
      setPressingId(null)
      confetti({ particleCount: 40, spread: 50, origin: { x, y }, colors: ['#F9C35C', '#6DC4A7', '#FFFFFF'] })
      setLocalOverrides(prev => new Map(prev).set(id, true))
      const routineId = parseRoutineId(id)
      if (routineId) {
        markDone('routine', routineId, data.now).catch(err => {
          console.error('Failed to persist morning routine completion:', err)
        })
      }
    }, 500)
  }, [completedItems, markDone, undoDone, data.now])

  const handlePointerCancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingId(null)
  }, [])

  return (
    <div className="h-full flex gap-8">
      {/* Column 1: Weather + Countdown */}
      <div className="w-[25%] h-full flex flex-col gap-6">
        {weather ? (
          <div className="flex-1">
            <WeatherColumn
              temp={weather.currentTemp}
              code={weather.weatherCode}
              high={weather.highTemp}
              low={weather.lowTemp}
              condition={weather.condition}
            />
          </div>
        ) : error === 'no-location' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[4rem]">📍</div>
              <div className="text-white/50 font-bold text-[1rem] mt-3 uppercase tracking-wider">
                Set Location
              </div>
              <div className="text-white/25 text-[0.85rem] mt-1 max-w-[220px]">
                Enable location for weather & outfit suggestions
              </div>
              <button
                onClick={() => {
                  setLocationRequested(true)
                  requestLocation()
                }}
                disabled={locationRequested && loading}
                className="mt-4 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15
                           rounded-xl text-white/80 font-bold text-[0.9rem] uppercase tracking-wider
                           transition-all duration-200 disabled:opacity-50"
              >
                {locationRequested && loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                    Locating...
                  </span>
                ) : 'Use My Location'}
              </button>
            </div>
          </div>
        ) : error === 'fetch-error' ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[4rem]">🌥️</div>
              <div className="text-white/40 font-bold text-[1rem] mt-2 uppercase tracking-wider">
                Weather Unavailable
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-[4rem]">🌤️</div>
              <div className="text-white/30 font-bold text-[1rem] mt-2 uppercase tracking-wider flex items-center gap-2 justify-center">
                <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white/50 rounded-full animate-spin" />
                Loading...
              </div>
            </div>
          </div>
        )}

        <DepartureCountdown />

        {/* School-related email action items */}
        {data.emailActionItems && (
          <EmailActionStrip
            items={data.emailActionItems}
            categories={['school']}
            title="Don't Forget"
            maxItems={3}
          />
        )}

      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 2+3: Kid Checklists */}
      {kidChecklists.length > 0 ? (
        kidChecklists.map((checklist, idx) => (
          <div key={checklist.kid.id} className="flex-1 h-full flex">
            <div className="flex-1">
              <KidChecklist
                name={checklist.kid.name}
                color={checklist.kid.color}
                items={checklist.items}
                completedSet={new Set([...completedItems].filter(id =>
                  checklist.items.some(i => i.id === id)
                ))}
                pressingId={pressingId}
                onPointerDown={handlePointerDown}
                onPointerCancel={handlePointerCancel}
              />
            </div>
            {idx < kidChecklists.length - 1 && (
              <div className="w-px bg-white/8 self-stretch my-4 ml-8" />
            )}
          </div>
        ))
      ) : genericChecklist ? (
        <div className="flex-1 h-full">
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider mb-4">
            Morning Prep
          </h2>
          <div className="flex flex-col gap-2">
            {genericChecklist.map((item) => {
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
                  <span className="relative z-10 text-[1.2rem]">{getSchoolItemIcon(item.title)}</span>
                  <span className={`relative z-10 font-bold text-[1.05rem] ${
                    isDone ? 'text-white/40 line-through' : 'text-white/90'
                  }`}>
                    {item.title}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
