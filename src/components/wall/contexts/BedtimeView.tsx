import { useMemo, useState, useCallback, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ContextViewProps } from './types'
import type { TimelineItem } from '@/types/timeline'

// ============================================================================
// HELPERS
// ============================================================================

function getBedtimeIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('teeth') || lower.includes('brush')) return '🪥'
  if (lower.includes('bath') || lower.includes('shower')) return '🛁'
  if (lower.includes('pajama') || lower.includes('pj') || lower.includes('dress') || lower.includes('change')) return '👕'
  if (lower.includes('read') || lower.includes('story') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep') || lower.includes('light') || lower.includes('tuck')) return '🛏️'
  if (lower.includes('pick') || lower.includes('clean') || lower.includes('tidy')) return '🧹'
  if (lower.includes('water') || lower.includes('drink')) return '💧'
  if (lower.includes('potty') || lower.includes('bathroom') || lower.includes('toilet')) return '🚽'
  if (lower.includes('prayer') || lower.includes('pray') || lower.includes('gratitude')) return '🙏'
  if (lower.includes('hug') || lower.includes('kiss') || lower.includes('cuddle')) return '🤗'
  if (lower.includes('music') || lower.includes('song') || lower.includes('lullaby')) return '🎵'
  return '🌙'
}

// Default bedtime routine if no data
const DEFAULT_BEDTIME_STEPS = [
  { title: 'Pick up toys & room tidy', icon: '🧹' },
  { title: 'Bath time', icon: '🛁' },
  { title: 'Pajamas on', icon: '👕' },
  { title: 'Brush teeth', icon: '🪥' },
  { title: 'Story time', icon: '📚' },
  { title: 'Lights out', icon: '🛏️' },
]

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function KidRoutine({
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
  items: { id: string; title: string; icon: string }[]
  completedSet: Set<string>
  pressingId: string | null
  onPointerDown: (e: React.PointerEvent<HTMLButtonElement>, id: string) => void
  onPointerCancel: () => void
}) {
  const progress = items.length > 0 ? completedSet.size / items.length : 0
  const allDone = progress === 1

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-[1.1rem] border-2"
          style={{ backgroundColor: color + '30', borderColor: color + '50' }}
        >
          {name[0]}
        </div>
        <div>
          <h3 className="text-white font-black text-[1.5rem] uppercase tracking-wider leading-none">
            {name}
          </h3>
          <p className="text-[#A78BFA] font-bold text-[0.85rem] mt-0.5 uppercase tracking-wide">
            Bedtime Routine
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-2 bg-white/10 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-[#A78BFA] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Steps */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {items.map((item) => {
          const isDone = completedSet.has(item.id)
          const isPressing = pressingId === item.id

          return (
            <button
              key={item.id}
              onPointerDown={(e) => onPointerDown(e, item.id)}
              onPointerUp={onPointerCancel}
              onPointerLeave={onPointerCancel}
              onPointerCancel={onPointerCancel}
              className={`
                relative flex items-center gap-4 px-5 py-4 rounded-xl text-left
                transition-all duration-300 overflow-hidden select-none
                ${isDone
                  ? 'bg-[#A78BFA]/10 border border-[#A78BFA]/20'
                  : 'bg-white/5 border border-white/8 hover:bg-white/8'
                }
                ${isPressing ? 'scale-[0.98]' : ''}
              `}
              style={{ touchAction: 'none' }}
            >
              {/* Hold fill */}
              <div
                className={`absolute inset-0 bg-[#A78BFA]/15 origin-left pointer-events-none transition-all ${
                  isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                }`}
              />

              {/* Step number / check */}
              <div
                className={`relative z-10 w-9 h-9 rounded-lg flex items-center justify-center text-[1.3rem] flex-shrink-0 transition-all duration-300 ${
                  isDone ? 'bg-[#A78BFA]/30' : 'bg-white/8'
                }`}
              >
                {isDone ? (
                  <svg className="w-4.5 h-4.5 text-[#A78BFA]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2.5 6L5 8.5L9.5 3.5" />
                  </svg>
                ) : (
                  <span>{item.icon}</span>
                )}
              </div>

              {/* Step text */}
              <span
                className={`relative z-10 font-bold text-[1.1rem] transition-all duration-300 ${
                  isDone ? 'text-white/40 line-through' : 'text-white/90'
                }`}
              >
                {item.title}
              </span>
            </button>
          )
        })}
      </div>

      {/* All done */}
      {allDone && (
        <div className="mt-4 text-center py-4 rounded-xl bg-[#A78BFA]/15 border border-[#A78BFA]/25">
          <span className="text-[2rem]">😴</span>
          <p className="text-[#A78BFA] font-black uppercase tracking-widest text-[0.85rem] mt-1">
            Sweet dreams!
          </p>
        </div>
      )}
    </div>
  )
}

function CenterColumn({ data }: { data: ContextViewProps['data'] }) {
  // Tomorrow preview
  const tomorrowData = useMemo(() => {
    const todayStr = toLocalDateStr(data.now)
    return data.days.find(d => {
      const dStr = toLocalDateStr(d.date)
      return dStr > todayStr
    })
  }, [data.days, data.now])

  const tomorrowItems = useMemo(() => {
    if (!tomorrowData) return []
    const items: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      items.push(...(tomorrowData.items[section] || []))
    }
    return items.filter(i => !i.skipped).slice(0, 5)
  }, [tomorrowData])

  return (
    <div className="flex flex-col h-full items-center">
      {/* Calming visual */}
      <div className="relative flex-1 w-full flex items-center justify-center overflow-hidden rounded-3xl mb-6">
        {/* Ambient animation */}
        <div className="absolute w-[280px] h-[280px] rounded-full animate-[bedtimeFloat_12s_ease-in-out_infinite]"
          style={{
            background: 'radial-gradient(circle, rgba(167,139,250,0.12) 0%, rgba(167,139,250,0.04) 40%, transparent 70%)',
          }}
        />
        <div className="absolute w-[200px] h-[200px] rounded-full animate-[bedtimeFloat_8s_ease-in-out_infinite_2s]"
          style={{
            background: 'radial-gradient(circle, rgba(109,196,167,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="absolute w-[160px] h-[160px] rounded-full animate-[bedtimeFloat_10s_ease-in-out_infinite_4s]"
          style={{
            background: 'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 50%)',
          }}
        />

        {/* Moon + stars */}
        <div className="relative z-10 text-center">
          <div className="text-[5rem] mb-2">🌙</div>
          <div className="flex gap-3 justify-center">
            <span className="text-[1.5rem] animate-[twinkle_3s_ease-in-out_infinite]">✨</span>
            <span className="text-[1rem] animate-[twinkle_3s_ease-in-out_infinite_1s]">⭐</span>
            <span className="text-[1.5rem] animate-[twinkle_3s_ease-in-out_infinite_0.5s]">✨</span>
          </div>
          <p className="text-white/30 font-bold text-[0.85rem] uppercase tracking-widest mt-4">
            Winding down...
          </p>
        </div>
      </div>

      {/* Tomorrow preview */}
      <div className="w-full">
        <div className="text-white/40 font-black text-[0.75rem] uppercase tracking-widest mb-3 text-center">
          Tomorrow's Preview
        </div>

        {tomorrowItems.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {tomorrowItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/4 border border-white/6"
              >
                <span className="text-[0.9rem]">
                  {item.type === 'event' ? '📅' : item.type === 'routine' ? '🔄' : '📋'}
                </span>
                <span className="text-white/50 font-bold text-[0.9rem] truncate flex-1">
                  {item.title}
                </span>
                {item.startTime && (
                  <span className="text-white/25 font-bold text-[0.75rem] flex-shrink-0">
                    {new Date(item.startTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-white/20 font-bold text-[0.9rem] py-4">
            Nothing scheduled yet
          </div>
        )}
      </div>

      <style>{`
        @keyframes bedtimeFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(15px, -10px) scale(1.03); }
          66% { transform: translate(-10px, 8px) scale(0.97); }
        }
        @keyframes twinkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(0.7); }
        }
      `}</style>
    </div>
  )
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function BedtimeView({ data }: ContextViewProps) {
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set())
  const [pressingId, setPressingId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Find kids
  const kids = useMemo(() => {
    return data.familyMembers.filter(m => {
      const lower = m.name.toLowerCase()
      return lower.includes('ella') || lower.includes('kaleb')
    })
  }, [data.familyMembers])

  // Get evening routine items per kid
  const todayData = data.days.find(d => d.isToday)
  const eveningItems = useMemo(() => {
    if (!todayData) return []
    const items: TimelineItem[] = []
    for (const section of ['evening', 'allday'] as const) {
      items.push(...(todayData.items[section] || []))
    }
    return items.filter(i => !i.completed && !i.skipped && i.type === 'routine')
  }, [todayData])

  // Build per-kid routines
  const kidRoutines = useMemo(() => {
    return kids.map(kid => {
      const assigned = eveningItems
        .filter(i => i.assignedTo === kid.id)
        .map(i => ({
          id: i.id,
          title: i.title,
          icon: getBedtimeIcon(i.title),
        }))

      // Fall back to defaults if no assigned items
      const items = assigned.length > 0
        ? assigned
        : DEFAULT_BEDTIME_STEPS.map((step, idx) => ({
            id: `default-${kid.id}-${idx}`,
            title: step.title,
            icon: step.icon,
          }))

      return { kid, items }
    })
  }, [kids, eveningItems])

  // If no kids found, show one generic routine
  const genericRoutine = useMemo(() => {
    if (kids.length > 0) return null
    return DEFAULT_BEDTIME_STEPS.map((step, idx) => ({
      id: `default-${idx}`,
      title: step.title,
      icon: step.icon,
    }))
  }, [kids])

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
      confetti({ particleCount: 30, spread: 40, origin: { x, y }, colors: ['#A78BFA', '#6DC4A7', '#FFFFFF'], gravity: 1.2 })
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
      {/* Left: First kid's routine (or generic) */}
      <div className="w-[35%] h-full">
        {kidRoutines.length > 0 ? (
          <KidRoutine
            name={kidRoutines[0].kid.name}
            color={kidRoutines[0].kid.color}
            items={kidRoutines[0].items}
            completedSet={new Set([...completedItems].filter(id =>
              kidRoutines[0].items.some(i => i.id === id)
            ))}
            pressingId={pressingId}
            onPointerDown={handlePointerDown}
            onPointerCancel={handlePointerCancel}
          />
        ) : genericRoutine ? (
          <KidRoutine
            name="Everyone"
            color="#A78BFA"
            items={genericRoutine}
            completedSet={completedItems}
            pressingId={pressingId}
            onPointerDown={handlePointerDown}
            onPointerCancel={handlePointerCancel}
          />
        ) : null}
      </div>

      {/* Divider */}
      <div className="w-px bg-[#A78BFA]/15 self-stretch my-4" />

      {/* Center: Calming visuals + tomorrow preview */}
      <div className="w-[30%] h-full">
        <CenterColumn data={data} />
      </div>

      {/* Divider */}
      <div className="w-px bg-[#A78BFA]/15 self-stretch my-4" />

      {/* Right: Second kid's routine */}
      <div className="w-[35%] h-full">
        {kidRoutines.length > 1 ? (
          <KidRoutine
            name={kidRoutines[1].kid.name}
            color={kidRoutines[1].kid.color}
            items={kidRoutines[1].items}
            completedSet={new Set([...completedItems].filter(id =>
              kidRoutines[1].items.some(i => i.id === id)
            ))}
            pressingId={pressingId}
            onPointerDown={handlePointerDown}
            onPointerCancel={handlePointerCancel}
          />
        ) : kidRoutines.length === 1 ? (
          // Only one kid, show tomorrow preview expanded
          <CenterColumn data={data} />
        ) : null}
      </div>
    </div>
  )
}
