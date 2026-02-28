import { useMemo, useState, useCallback, useRef } from 'react'
import confetti from 'canvas-confetti'
import type { ContextViewProps } from './types'
import type { TimelineItem } from '@/types/timeline'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import { extractRecipeNameHint } from '@/lib/recipeDetection'

// ============================================================================
// HELPERS
// ============================================================================

const DINNER_KEYWORDS = /\b(dinner|supper|meal\s*prep)\b/i
const FOOD_KEYWORDS = /\b(chicken|pasta|spaghetti|penne|linguine|fettuccine|lasagna|taco|burrito|pizza|burger|hamburger|salad|sushi|poke|soup|stew|chili|chowder|steak|beef|rib|fish|salmon|tilapia|cod|shrimp|curry|rice|sandwich|sub|waffle|pancake|bbq|grill|barbecue|pie|fry|fries|fried|noodle|ramen|pho|lobster|crab|meatball|casserole|roast|bake|stir.?fry|enchilada|quesadilla|wings|nuggets|mac.?and.?cheese|hot.?dog|pot.?roast|pulled.?pork|kabob|kebab|teriyaki|pad.?thai)\b/i

function toLocalDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function findDinnerEvent(events: CalendarEvent[], now: Date): CalendarEvent | null {
  const todayStr = toLocalDateStr(now)
  const todayEvents = events.filter(e => {
    const startStr = e.start_time || e.startTime
    return startStr?.startsWith(todayStr)
  })

  const explicit = todayEvents.find(e => DINNER_KEYWORDS.test(e.title))
  if (explicit) return explicit

  const eveningFood = todayEvents.find(e => {
    const startStr = e.start_time || e.startTime
    if (!startStr || startStr.length <= 10) return false
    const eventDate = new Date(startStr)
    return eventDate.getHours() >= 16 && FOOD_KEYWORDS.test(e.title)
  })
  if (eveningFood) return eveningFood

  return null
}

function getMealIcon(name: string): string {
  const lower = name.toLowerCase()
  if (/chicken/i.test(lower)) return '🍗'
  if (/pasta|spaghetti|penne|linguine|lasagna/i.test(lower)) return '🍝'
  if (/taco/i.test(lower)) return '🌮'
  if (/pizza/i.test(lower)) return '🍕'
  if (/burger/i.test(lower)) return '🍔'
  if (/sushi|poke/i.test(lower)) return '🍣'
  if (/soup|stew|chili/i.test(lower)) return '🍲'
  if (/steak|beef|rib/i.test(lower)) return '🥩'
  if (/fish|salmon|shrimp/i.test(lower)) return '🐟'
  if (/curry/i.test(lower)) return '🍛'
  return '🍽️'
}

// Generate prep steps from the meal name (smart defaults)
function generatePrepSteps(mealName: string): string[] {
  const lower = mealName.toLowerCase()

  // Generic steps that work for most meals
  const steps = [
    'Wash hands, clear counter space',
    'Gather ingredients and tools',
  ]

  if (/pasta|spaghetti|penne|linguine|fettuccine/i.test(lower)) {
    steps.push('Boil water for pasta')
    steps.push('Prep sauce ingredients')
    steps.push('Cook sauce while pasta boils')
    steps.push('Drain pasta, combine with sauce')
  } else if (/chicken/i.test(lower)) {
    steps.push('Season chicken')
    steps.push('Preheat pan or oven')
    steps.push('Cook chicken until internal temp 165F')
    steps.push('Rest 5 minutes before serving')
  } else if (/taco|burrito|enchilada|quesadilla/i.test(lower)) {
    steps.push('Prep toppings and fillings')
    steps.push('Heat protein')
    steps.push('Warm tortillas')
    steps.push('Set up assembly station')
  } else if (/pizza/i.test(lower)) {
    steps.push('Preheat oven to 450F')
    steps.push('Prep toppings')
    steps.push('Assemble pizza')
    steps.push('Bake until crust is golden')
  } else if (/stir.?fry|teriyaki|pad.?thai/i.test(lower)) {
    steps.push('Slice vegetables and protein')
    steps.push('Heat wok or large pan')
    steps.push('Cook protein first, set aside')
    steps.push('Stir-fry vegetables, combine')
  } else {
    steps.push('Prep and cut ingredients')
    steps.push('Start cooking main dish')
    steps.push('Prepare sides')
    steps.push('Plate and serve')
  }

  steps.push('Set the table')
  return steps
}

// Conversation starters for dinner
const CONVERSATION_STARTERS = [
  'What was the best part of your day?',
  'What made you laugh today?',
  'If you could have any superpower, what would it be?',
  'What are you looking forward to tomorrow?',
  'Tell us something new you learned today.',
  'If you could go anywhere right now, where would you go?',
  'What was the hardest thing you did today?',
  'Who did you help today?',
  'What would you do with a million dollars?',
  'If you could invite anyone to dinner, who would it be?',
  'What is your favorite thing about our family?',
  'What made someone else smile today?',
]

function getDailyConversationStarter(): string {
  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)
  return CONVERSATION_STARTERS[dayOfYear % CONVERSATION_STARTERS.length]
}

// Table manners reminders (kid-friendly)
const TABLE_MANNERS = [
  'Napkin on your lap',
  'Chew with your mouth closed',
  'Say please and thank you',
  'Wait for everyone to be seated',
  'No phones at the table',
  'Use your utensils',
  'Ask to be excused',
]

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function PrepColumn({
  mealName,
  mealIcon,
  steps,
}: {
  mealName: string
  mealIcon: string
  steps: string[]
}) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set())
  const [pressingIdx, setPressingIdx] = useState<number | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>, idx: number) => {
    if (completedSteps.has(idx)) {
      setCompletedSteps(prev => {
        const next = new Set(prev)
        next.delete(idx)
        return next
      })
      return
    }

    setPressingIdx(idx)
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight

    timeoutRef.current = setTimeout(() => {
      setPressingIdx(null)
      confetti({ particleCount: 40, spread: 50, origin: { x, y }, colors: ['#6DC4A7', '#F9C35C', '#FFFFFF'] })
      setCompletedSteps(prev => new Set(prev).add(idx))
    }, 500)
  }, [completedSteps])

  const handlePointerCancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setPressingIdx(null)
  }, [])

  const progress = steps.length > 0 ? completedSteps.size / steps.length : 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-2xl bg-[#6DC4A7]/20 border-2 border-[#6DC4A7]/30 flex items-center justify-center text-[2rem]">
          {mealIcon}
        </div>
        <div>
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
            Dinner Prep
          </h2>
          <p className="text-[#6DC4A7] font-bold text-[1.1rem] mt-1 uppercase tracking-wide">
            {mealName}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/10 rounded-full mb-6 overflow-hidden">
        <div
          className="h-full bg-[#6DC4A7] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Steps list */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {steps.map((step, i) => {
          const isDone = completedSteps.has(i)
          const isPressing = pressingIdx === i

          return (
            <button
              key={i}
              onPointerDown={(e) => handlePointerDown(e, i)}
              onPointerUp={handlePointerCancel}
              onPointerLeave={handlePointerCancel}
              onPointerCancel={handlePointerCancel}
              className={`
                relative flex items-center gap-4 px-5 py-4 rounded-xl text-left
                transition-all duration-300 overflow-hidden select-none
                ${isDone
                  ? 'bg-[#6DC4A7]/10 border border-[#6DC4A7]/20'
                  : 'bg-white/5 border border-white/8 hover:bg-white/8'
                }
                ${isPressing ? 'scale-[0.98]' : ''}
              `}
              style={{ touchAction: 'none' }}
            >
              {/* Hold fill animation */}
              <div
                className={`absolute inset-0 bg-[#6DC4A7]/15 origin-left pointer-events-none transition-all ${
                  isPressing ? 'scale-x-100 duration-500 ease-linear' : 'scale-x-0 duration-100'
                }`}
              />

              {/* Step number / check */}
              <div
                className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center text-[0.85rem] font-black flex-shrink-0 transition-all duration-300 ${
                  isDone
                    ? 'bg-[#6DC4A7] text-white'
                    : 'bg-white/10 text-white/50'
                }`}
              >
                {isDone ? (
                  <svg className="w-4 h-4" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2.5 6L5 8.5L9.5 3.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>

              {/* Step text */}
              <span
                className={`relative z-10 font-bold text-[1.05rem] transition-all duration-300 ${
                  isDone ? 'text-white/40 line-through' : 'text-white/90'
                }`}
              >
                {step}
              </span>
            </button>
          )
        })}
      </div>

      {/* All done state */}
      {progress === 1 && (
        <div className="mt-4 text-center py-4 rounded-xl bg-[#6DC4A7]/15 border border-[#6DC4A7]/25">
          <span className="text-[2rem]">🎉</span>
          <p className="text-[#6DC4A7] font-black uppercase tracking-widest text-[0.9rem] mt-1">
            Ready to serve!
          </p>
        </div>
      )}
    </div>
  )
}

function DinnerColumn() {
  const conversationStarter = useMemo(() => getDailyConversationStarter(), [])
  const [showManners, setShowManners] = useState(true)

  return (
    <div className="flex flex-col h-full items-center">
      {/* Header */}
      <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none mb-6 text-center">
        Dinner Time
      </h2>

      {/* Calming visual - animated gradient orb */}
      <div className="relative w-full flex-1 flex items-center justify-center mb-6">
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-3xl">
          {/* Ambient nature-inspired animation */}
          <div className="absolute w-[300px] h-[300px] rounded-full animate-[orbFloat_8s_ease-in-out_infinite]"
            style={{
              background: 'radial-gradient(circle, rgba(109,196,167,0.15) 0%, rgba(109,196,167,0.05) 40%, transparent 70%)',
            }}
          />
          <div className="absolute w-[200px] h-[200px] rounded-full animate-[orbFloat_6s_ease-in-out_infinite_1s]"
            style={{
              background: 'radial-gradient(circle, rgba(249,195,92,0.1) 0%, rgba(249,195,92,0.04) 40%, transparent 70%)',
            }}
          />
          <div className="absolute w-[250px] h-[250px] rounded-full animate-[orbFloat_10s_ease-in-out_infinite_2s]"
            style={{
              background: 'radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 60%)',
            }}
          />
        </div>

        {/* Conversation starter card */}
        <div className="relative z-10 max-w-[320px] text-center">
          <div className="text-[3rem] mb-4">💬</div>
          <p className="text-white/80 font-bold text-[1.3rem] leading-relaxed italic">
            "{conversationStarter}"
          </p>
          <p className="text-white/30 font-bold text-[0.75rem] uppercase tracking-widest mt-3">
            Tonight's Conversation Starter
          </p>
        </div>
      </div>

      {/* Table manners toggle */}
      <button
        onClick={() => setShowManners(!showManners)}
        className="w-full text-left"
      >
        <div className={`rounded-2xl p-4 border transition-all duration-300 ${
          showManners
            ? 'bg-white/5 border-white/10'
            : 'bg-transparent border-transparent'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/50 font-black text-[0.8rem] uppercase tracking-widest">
              Table Reminders
            </span>
            <svg
              className={`w-4 h-4 text-white/30 transition-transform ${showManners ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {showManners && (
            <div className="flex flex-wrap gap-2 mt-2">
              {TABLE_MANNERS.map((manner, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 rounded-lg bg-white/6 text-white/50 text-[0.8rem] font-bold"
                >
                  {manner}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      <style>{`
        @keyframes orbFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(20px, -15px) scale(1.05); }
          66% { transform: translate(-15px, 10px) scale(0.95); }
        }
      `}</style>
    </div>
  )
}

function CleanupColumn({
  choreItems,
  bedtimeRoutines,
}: {
  choreItems: TimelineItem[]
  bedtimeRoutines: TimelineItem[]
}) {
  // Evening chores: anything not completed from the evening section or cleanup-related
  const cleanupItems = useMemo(() => {
    return choreItems.filter(item => {
      if (item.completed || item.skipped) return false
      const lower = item.title.toLowerCase()
      return lower.includes('clean') || lower.includes('dish') || lower.includes('trash') ||
             lower.includes('tidy') || lower.includes('kitchen') || lower.includes('wipe') ||
             lower.includes('sweep') || lower.includes('table')
    })
  }, [choreItems])

  // Bedtime routines
  const bedtimeItems = useMemo(() => {
    return bedtimeRoutines.filter(item => {
      if (item.completed || item.skipped) return false
      const lower = item.title.toLowerCase()
      return lower.includes('bed') || lower.includes('teeth') || lower.includes('bath') ||
             lower.includes('shower') || lower.includes('pajama') || lower.includes('read') ||
             lower.includes('story') || lower.includes('sleep') || lower.includes('routine')
    })
  }, [bedtimeRoutines])

  return (
    <div className="flex flex-col h-full">
      {/* Cleanup section */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[1.8rem]">🧹</span>
          <h2 className="text-white font-black text-[1.6rem] uppercase tracking-wider leading-none">
            Cleanup
          </h2>
        </div>

        {cleanupItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            {cleanupItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8"
              >
                <span className="text-[1.1rem]">
                  {getCleanupIcon(item.title)}
                </span>
                <span className="text-white/80 font-bold text-[1rem]">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8">
              <span className="text-[1.1rem]">🍽️</span>
              <span className="text-white/80 font-bold text-[1rem]">Clear the table</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8">
              <span className="text-[1.1rem]">🧽</span>
              <span className="text-white/80 font-bold text-[1rem]">Load dishwasher</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/8">
              <span className="text-[1.1rem]">🧹</span>
              <span className="text-white/80 font-bold text-[1rem]">Wipe counters</span>
            </div>
          </div>
        )}
      </div>

      {/* Divider with arrow */}
      <div className="flex items-center gap-3 mb-6 px-2">
        <div className="flex-1 h-px bg-[#A78BFA]/30" />
        <span className="text-[#A78BFA]/60 text-[0.75rem] font-black uppercase tracking-widest">
          Then
        </span>
        <svg className="w-4 h-4 text-[#A78BFA]/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        <div className="flex-1 h-px bg-[#A78BFA]/30" />
      </div>

      {/* Bedtime section */}
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[1.8rem]">🌙</span>
          <h2 className="text-[#A78BFA] font-black text-[1.4rem] uppercase tracking-wider leading-none">
            Bedtime
          </h2>
        </div>

        {bedtimeItems.length > 0 ? (
          <div className="flex flex-col gap-2">
            {bedtimeItems.map(item => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#A78BFA]/8 border border-[#A78BFA]/15"
              >
                <span className="text-[1.1rem]">
                  {getBedtimeIcon(item.title)}
                </span>
                <span className="text-white/70 font-bold text-[1rem]">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#A78BFA]/8 border border-[#A78BFA]/15">
              <span className="text-[1.1rem]">🪥</span>
              <span className="text-white/70 font-bold text-[1rem]">Brush teeth</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#A78BFA]/8 border border-[#A78BFA]/15">
              <span className="text-[1.1rem]">👕</span>
              <span className="text-white/70 font-bold text-[1rem]">Pajamas on</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#A78BFA]/8 border border-[#A78BFA]/15">
              <span className="text-[1.1rem]">📚</span>
              <span className="text-white/70 font-bold text-[1rem]">Story time</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#A78BFA]/8 border border-[#A78BFA]/15">
              <span className="text-[1.1rem]">🛏️</span>
              <span className="text-white/70 font-bold text-[1rem]">Lights out</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function getCleanupIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('dish')) return '🧽'
  if (lower.includes('trash') || lower.includes('garbage')) return '🗑️'
  if (lower.includes('sweep') || lower.includes('clean') || lower.includes('wipe')) return '🧹'
  if (lower.includes('table')) return '🍽️'
  return '✨'
}

function getBedtimeIcon(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('teeth') || lower.includes('brush')) return '🪥'
  if (lower.includes('bath') || lower.includes('shower')) return '🚿'
  if (lower.includes('pajama') || lower.includes('dress') || lower.includes('cloth')) return '👕'
  if (lower.includes('read') || lower.includes('story') || lower.includes('book')) return '📚'
  if (lower.includes('bed') || lower.includes('sleep') || lower.includes('light')) return '🛏️'
  return '🌙'
}

// ============================================================================
// MAIN VIEW
// ============================================================================

export function DinnerFlowView({ data }: ContextViewProps) {
  const dinnerEvent = useMemo(() => findDinnerEvent(data.calendarEvents, data.now), [data.calendarEvents, data.now])

  const mealName = dinnerEvent
    ? extractRecipeNameHint(dinnerEvent.title) || dinnerEvent.title
    : 'Dinner'
  const mealIcon = getMealIcon(mealName)
  const prepSteps = useMemo(() => generatePrepSteps(mealName), [mealName])

  // Get chores and bedtime routines from today's data
  const todayData = data.days.find(d => d.isToday)
  const allItems = useMemo(() => {
    if (!todayData) return []
    const items: TimelineItem[] = []
    for (const section of ['morning', 'afternoon', 'evening', 'allday'] as const) {
      items.push(...(todayData.items[section] || []))
    }
    return items
  }, [todayData])

  const choreItems = useMemo(() => allItems.filter(i => i.type === 'routine'), [allItems])
  const bedtimeRoutines = useMemo(() => allItems.filter(i => i.type === 'routine'), [allItems])

  return (
    <div className="h-full flex gap-8">
      {/* Column 1: Dinner Prep (left) */}
      <div className="w-[36%] h-full">
        <PrepColumn
          mealName={mealName}
          mealIcon={mealIcon}
          steps={prepSteps}
        />
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 2: During Dinner (center) */}
      <div className="w-[28%] h-full">
        <DinnerColumn />
      </div>

      {/* Divider */}
      <div className="w-px bg-white/8 self-stretch my-4" />

      {/* Column 3: Cleanup + Bedtime (right) */}
      <div className="w-[36%] h-full">
        <CleanupColumn
          choreItems={choreItems}
          bedtimeRoutines={bedtimeRoutines}
        />
      </div>
    </div>
  )
}
