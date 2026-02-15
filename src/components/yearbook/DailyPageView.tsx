// DailyPageView — The daily interface for Relish
// Today's yearbook page: narrative coaching, transition cues, checklists, policies, handoffs
// Editorial warmth meets personal coaching — the first thing you see each morning

import { useState, useCallback, useMemo } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (inline for prototype — will move to types/dailyPage.ts)
// ─────────────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  id: string
  label: string
  checked: boolean
  source: 'routine' | 'goal' | 'assessment' | 'calendar' | 'health'
}

interface DailyChecklist {
  id: string
  title: string
  icon: string
  items: ChecklistItem[]
}

interface TransitionCue {
  id: string
  triggerTime: string
  triggerLabel: string
  coachingText: string
  icon: string
}

interface PolicyCard {
  id: string
  title: string
  icon: string
  rules: string[]
  agreedDate: string
}

interface HandoffScript {
  id: string
  recipient: string
  visitType: string
  guidelines: string[]
  medications: string[]
  pickupTime: string
}

interface ReferenceCard {
  id: string
  icon: string
  title: string
  detail: string
  time?: string
}

interface MealEntry {
  label: string
  description: string
  note?: string
}

interface PersonAccent {
  name: string
  color: string
  colorLight: string
  colorMuted: string
  initial: string
}

type PageMode = 'adult' | 'child'
type TimeOfDay = 'morning' | 'midday' | 'evening'

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const SCOTT: PersonAccent = {
  name: 'Scott',
  color: 'hsl(168 45% 30%)',
  colorLight: 'hsl(168 30% 94%)',
  colorMuted: 'hsl(168 20% 80%)',
  initial: 'S',
}

const SIENNA: PersonAccent = {
  name: 'Sienna',
  color: 'hsl(320 45% 50%)',
  colorLight: 'hsl(320 40% 95%)',
  colorMuted: 'hsl(320 25% 82%)',
  initial: 'Si',
}

const mockMorningBriefing = `Good morning, Scott. It's Tuesday, February 15th.

The kids wake up around 6:45. Before you open the laptop — you've got 15 minutes with them at breakfast. Ask Rowan about his science fair project; he's been stressed about it. Sienna's been asking to help make pancakes — maybe today?

You have a 9am standup and a 2pm design review. Block 30 minutes after the design review to decompress — you mentioned Tuesdays feel packed.

Exercise: Your 5:30pm CrossFit class is booked. Grandma Carol is doing pickup today at 3:15, so you don't need to rush.

Eating: You said you wanted to stop skipping lunch. There's leftover soup in the fridge. Eat it.

Family goal check: You're 2 weeks into "organize the garage." This weekend's target is clearing the tool wall. Maybe grab those hooks from Home Depot on the way home?`

const mockMiddayCheck = `Quick reminder: eat lunch. There's soup in the fridge.

Also — Iris wants to talk about the kids' screen time policy tonight after bedtime. Come prepared with your thoughts.`

const mockEveningReflection = `Pickup is handled — Grandma Carol brought them home at 3:30. You're on dinner tonight. Iris prepped the stir fry ingredients; they're in the fridge.

After kids' bedtime: Screen time policy conversation with Iris. Remember your goal from the manual review — listen first, propose second.

Tomorrow preview: Rowan has soccer at 4pm. You're on pickup. No evening exercise class — maybe a morning run instead?`

const mockTransitions: TransitionCue[] = [
  {
    id: 't1',
    triggerTime: '6:30 am',
    triggerLabel: 'Morning Presence',
    icon: '☀️',
    coachingText: `Phone stays face-down until after breakfast. The kids are up in 15 minutes. You said your goal is to be the first face they see — not the back of your head staring at a screen.

Make the coffee, sit at the table, be there when they walk in.`,
  },
  {
    id: 't2',
    triggerTime: '4:45 pm',
    triggerLabel: 'Work → Family',
    icon: '🚶',
    coachingText: `Close the laptop now — not in 5 minutes. Leave your phone in your pocket on the walk. Think about one thing each kid did this week that made you proud.

When you see them: get down to their level. Don't lead with "how was school?" — try "what was the funniest thing that happened today?"

When you get home: shoes off, snack at the counter, 15 minutes of decompression before anyone mentions homework. You're not a manager right now. You're Dad.`,
  },
]

const mockMorningChecklist: DailyChecklist = {
  id: 'morning',
  title: 'Morning Routine',
  icon: '☀️',
  items: [
    { id: 'm1', label: 'No phone first 15 minutes', checked: false, source: 'goal' },
    { id: 'm2', label: 'Breakfast with kids', checked: false, source: 'routine' },
    { id: 'm3', label: 'Pack lunches', checked: false, source: 'routine' },
    { id: 'm4', label: 'Check family calendar', checked: false, source: 'routine' },
  ],
}

const mockEveningChecklist: DailyChecklist = {
  id: 'evening',
  title: 'Evening Routine',
  icon: '🌙',
  items: [
    { id: 'e1', label: 'Cook dinner (stir fry)', checked: false, source: 'calendar' },
    { id: 'e2', label: "Kids' homework help", checked: false, source: 'routine' },
    { id: 'e3', label: 'Bath time — Sienna', checked: false, source: 'routine' },
    { id: 'e4', label: 'Read to Sienna', checked: false, source: 'routine' },
    { id: 'e5', label: 'Screen time talk with Iris', checked: false, source: 'goal' },
  ],
}

const mockLeavingChecklist: DailyChecklist = {
  id: 'leaving',
  title: 'Leaving the House',
  icon: '🚪',
  items: [
    { id: 'l1', label: 'Backpacks — Rowan + Sienna', checked: false, source: 'routine' },
    { id: 'l2', label: 'Lunches packed', checked: false, source: 'routine' },
    { id: 'l3', label: 'Water bottles filled', checked: false, source: 'routine' },
    { id: 'l4', label: "Sienna's allergy meds", checked: false, source: 'health' },
    { id: 'l5', label: 'Keys, wallet, phone', checked: false, source: 'routine' },
  ],
}

const mockPolicies: PolicyCard[] = [
  {
    id: 'p1',
    title: 'Minecraft Playdate Rules',
    icon: '🎮',
    rules: [
      '45 minutes max, no online multiplayer',
      'Parent sets the timer',
      'Snack at 3:30, nothing after 4:30',
      'Outside play encouraged first, screens second',
      'Friend goes home at 5:00 sharp',
    ],
    agreedDate: 'Feb 10, 2026',
  },
]

const mockHandoff: HandoffScript = {
  id: 'h1',
  recipient: 'Grandma Carol',
  visitType: 'Short visit (~3 hours)',
  guidelines: [
    "No screens today — it's a short visit, keep it active",
    "No gifts please — we're working on the 'every visit = present' expectation",
    "Snack: fruit or crackers, Sienna can't have tree nuts",
  ],
  medications: ["Sienna's allergy meds at 2pm if still there — EpiPen in backpack"],
  pickupTime: '4:00 pm',
}

const mockReferenceCards: ReferenceCard[] = [
  { id: 'r1', icon: '👵', title: 'Grandma Carol', detail: 'Pickup at 3:15', time: '3:15 pm' },
  { id: 'r2', icon: '🏋️', title: 'CrossFit', detail: 'Evening class', time: '5:30 pm' },
  { id: 'r3', icon: '📐', title: 'Science Fair', detail: 'Rowan — due Friday', time: 'Fri' },
]

const mockMeals: MealEntry[] = [
  { label: 'Breakfast', description: 'Pancakes — Sienna asked!', note: 'recipe link' },
  { label: 'Lunch', description: 'Leftover soup in fridge', note: "don't skip it" },
  { label: 'Dinner', description: 'Stir fry', note: 'Iris prepped, you cook' },
]

// ─── Sienna's mock data ───

const siennaBriefing = `Good morning, Sienna! Today is Tuesday.

Grandma Carol is picking you up from school today! Maybe you can show her the painting you made yesterday.

After snack, it's art time. And tonight is bath night — you get to pick your bath toy!`

const siennaChecklist: DailyChecklist = {
  id: 'sienna-morning',
  title: 'My Morning',
  icon: '🌞',
  items: [
    { id: 'sm1', label: 'Brush teeth', checked: false, source: 'routine' },
    { id: 'sm2', label: 'Pick your outfit', checked: false, source: 'routine' },
    { id: 'sm3', label: 'Eat breakfast', checked: false, source: 'routine' },
    { id: 'sm4', label: 'Shoes on, backpack ready', checked: false, source: 'routine' },
  ],
}

const siennaAfternoon: DailyChecklist = {
  id: 'sienna-afternoon',
  title: 'After School',
  icon: '🎨',
  items: [
    { id: 'sa1', label: 'Snack time', checked: false, source: 'routine' },
    { id: 'sa2', label: 'Art time — paint or draw', checked: false, source: 'routine' },
    { id: 'sa3', label: 'Help set the table', checked: false, source: 'routine' },
  ],
}

const siennaEvening: DailyChecklist = {
  id: 'sienna-evening',
  title: 'Bedtime',
  icon: '🌙',
  items: [
    { id: 'se1', label: 'Bath time — pick a bath toy!', checked: false, source: 'routine' },
    { id: 'se2', label: 'Pajamas on', checked: false, source: 'routine' },
    { id: 'se3', label: 'Brush teeth', checked: false, source: 'routine' },
    { id: 'se4', label: 'Story time with Dad', checked: false, source: 'routine' },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: time of day
// ─────────────────────────────────────────────────────────────────────────────

function getTimeOfDay(): TimeOfDay {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'midday'
  return 'evening'
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// Animated check icon
function CheckIcon({ checked, accent }: { checked: boolean; accent: string }) {
  return (
    <div
      className="relative flex-shrink-0 w-[22px] h-[22px] rounded-[6px] border-[1.5px] flex items-center justify-center transition-all duration-200"
      style={{
        borderColor: checked ? accent : 'var(--color-neutral-300)',
        backgroundColor: checked ? accent : 'transparent',
      }}
    >
      {checked && (
        <svg
          viewBox="0 0 12 12"
          className="w-3 h-3"
          style={{ animation: 'check-pop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
        >
          <path
            d="M2.5 6L5 8.5L9.5 3.5"
            fill="none"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}

// Star/sticker for kids
function StarReward({ earned, index }: { earned: boolean; index: number }) {
  return (
    <span
      className="inline-block text-2xl transition-all duration-300"
      style={{
        opacity: earned ? 1 : 0.2,
        transform: earned ? 'scale(1)' : 'scale(0.8)',
        filter: earned ? 'none' : 'grayscale(1)',
        animationDelay: earned ? `${index * 80}ms` : '0ms',
        animation: earned ? 'star-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) backwards' : 'none',
      }}
    >
      ⭐
    </span>
  )
}

// Section divider — thin, elegant
function SectionDivider({ label, icon }: { label: string; icon?: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="flex-1 h-px bg-neutral-200/80" />
      <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400 flex items-center gap-1.5">
        {icon && <span className="text-sm">{icon}</span>}
        {label}
      </span>
      <div className="flex-1 h-px bg-neutral-200/80" />
    </div>
  )
}

// Expandable section wrapper
function ExpandableSection({
  title,
  icon,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string
  icon: string
  defaultOpen?: boolean
  badge?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-neutral-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{icon}</span>
          <span className="text-sm font-medium text-neutral-700">{title}</span>
          {badge && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary-50 text-primary-600">
              {badge}
            </span>
          )}
        </div>
        <svg
          className="w-4 h-4 text-neutral-400 transition-transform duration-200"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div
        className="transition-all duration-300 ease-out overflow-hidden"
        style={{
          maxHeight: open ? '800px' : '0px',
          opacity: open ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLIST COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function ChecklistCard({
  checklist,
  accent,
  onToggle,
  mode = 'adult',
}: {
  checklist: DailyChecklist
  accent: PersonAccent
  onToggle: (checklistId: string, itemId: string) => void
  mode?: PageMode
}) {
  const completedCount = checklist.items.filter(i => i.checked).length
  const total = checklist.items.length
  const allDone = completedCount === total

  if (mode === 'child') {
    return (
      <div className="space-y-3">
        {checklist.items.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => onToggle(checklist.id, item.id)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-200 text-left"
            style={{
              backgroundColor: item.checked ? accent.colorLight : 'var(--color-bg-elevated)',
              boxShadow: item.checked ? 'none' : 'var(--shadow-card)',
            }}
          >
            <span className="text-2xl flex-shrink-0">{item.checked ? '✅' : '⬜'}</span>
            <span
              className="text-lg font-medium"
              style={{
                color: item.checked ? accent.color : 'var(--color-neutral-700)',
                textDecoration: item.checked ? 'line-through' : 'none',
                opacity: item.checked ? 0.7 : 1,
              }}
            >
              {item.label}
            </span>
            {item.checked && <StarReward earned index={idx} />}
          </button>
        ))}
        {allDone && (
          <div
            className="text-center py-4 text-lg font-display"
            style={{ color: accent.color, animation: 'fade-in-up 0.4s ease-out' }}
          >
            All done! You're a star! 🌟
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs text-neutral-400">
          <span>{completedCount}/{total}</span>
          {allDone && <span className="text-primary-500 font-medium">Complete ✓</span>}
        </div>
        <div className="w-20 h-1 rounded-full bg-neutral-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${(completedCount / total) * 100}%`,
              backgroundColor: accent.color,
            }}
          />
        </div>
      </div>

      {checklist.items.map(item => (
        <button
          key={item.id}
          onClick={() => onToggle(checklist.id, item.id)}
          className="w-full flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-neutral-50/60 transition-colors text-left group"
        >
          <CheckIcon checked={item.checked} accent={accent.color} />
          <span
            className="text-[15px] leading-snug transition-all duration-200"
            style={{
              color: item.checked ? 'var(--color-neutral-400)' : 'var(--color-neutral-700)',
              textDecoration: item.checked ? 'line-through' : 'none',
            }}
          >
            {item.label}
          </span>
          {item.source === 'goal' && (
            <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-50 text-primary-500 opacity-0 group-hover:opacity-100 transition-opacity">
              goal
            </span>
          )}
          {item.source === 'health' && (
            <span className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded bg-danger-50 text-danger-500 opacity-0 group-hover:opacity-100 transition-opacity">
              health
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSITION CUE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function TransitionCueCard({
  cue,
  accent,
}: {
  cue: TransitionCue
  accent: PersonAccent
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-300"
      style={{
        background: `linear-gradient(135deg, ${accent.colorLight} 0%, var(--color-bg-elevated) 100%)`,
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left"
      >
        <span className="text-xl flex-shrink-0">{cue.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: accent.colorMuted, color: accent.color }}
            >
              {cue.triggerTime}
            </span>
            <span className="text-sm font-medium text-neutral-700">
              {cue.triggerLabel}
            </span>
          </div>
        </div>
        <svg
          className="w-4 h-4 text-neutral-400 transition-transform duration-200 flex-shrink-0"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          viewBox="0 0 16 16"
          fill="none"
        >
          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      <div
        className="transition-all duration-300 ease-out overflow-hidden"
        style={{ maxHeight: expanded ? '400px' : '0px', opacity: expanded ? 1 : 0 }}
      >
        <div className="px-4 pb-4 pt-0">
          <div
            className="text-[14px] leading-relaxed text-neutral-600 whitespace-pre-line font-display italic"
            style={{ lineHeight: '1.7' }}
          >
            {cue.coachingText}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HANDOFF SCRIPT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function HandoffScriptCard({ handoff, accent }: { handoff: HandoffScript; accent: PersonAccent }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-neutral-700">
            Guidelines for {handoff.recipient}
          </div>
          <div className="text-xs text-neutral-400 mt-0.5">{handoff.visitType}</div>
        </div>
        <button
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          style={{
            backgroundColor: accent.colorLight,
            color: accent.color,
          }}
        >
          Share →
        </button>
      </div>

      <div className="space-y-2">
        {handoff.guidelines.map((g, i) => (
          <div key={i} className="flex gap-2.5 text-[13px] text-neutral-600">
            <span className="text-neutral-300 mt-0.5 flex-shrink-0">•</span>
            <span>{g}</span>
          </div>
        ))}
      </div>

      {handoff.medications.length > 0 && (
        <div className="p-3 rounded-lg bg-danger-50/60 border border-danger-500/10">
          <div className="text-[11px] font-medium uppercase tracking-wide text-danger-500 mb-1.5">
            Medications
          </div>
          {handoff.medications.map((m, i) => (
            <div key={i} className="text-[13px] text-danger-600">{m}</div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-neutral-500">
        <span>🕐</span>
        <span>Pickup: {handoff.pickupTime}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY RATING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

function DayRating({ accent }: { accent: PersonAccent }) {
  const [rating, setRating] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const faces = [
    { emoji: '😫', label: 'Rough' },
    { emoji: '😕', label: 'Meh' },
    { emoji: '😊', label: 'Good' },
    { emoji: '😄', label: 'Great' },
    { emoji: '🤩', label: 'Amazing' },
  ]

  const handleSubmit = useCallback(() => {
    if (rating !== null) setSubmitted(true)
  }, [rating])

  if (submitted) {
    return (
      <div
        className="text-center py-6"
        style={{ animation: 'fade-in-up 0.4s ease-out' }}
      >
        <div className="text-3xl mb-2">{faces[rating!].emoji}</div>
        <div className="font-display text-lg text-neutral-700">
          Noted. See you tomorrow.
        </div>
        <div className="text-xs text-neutral-400 mt-1">
          This feeds into your weekly patterns.
        </div>
      </div>
    )
  }

  return (
    <div className="text-center space-y-4">
      <div className="font-display text-lg text-neutral-600 italic">
        How'd today go?
      </div>
      <div className="flex justify-center gap-3">
        {faces.map((face, i) => (
          <button
            key={i}
            onClick={() => setRating(i)}
            className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-200"
            style={{
              backgroundColor: rating === i ? accent.colorLight : 'transparent',
              transform: rating === i ? 'scale(1.15)' : 'scale(1)',
              boxShadow: rating === i ? `0 0 0 2px ${accent.color}30` : 'none',
            }}
          >
            <span className="text-2xl">{face.emoji}</span>
            <span className="text-[10px] text-neutral-400">{face.label}</span>
          </button>
        ))}
      </div>
      {rating !== null && (
        <button
          onClick={handleSubmit}
          className="btn-primary text-sm px-6 py-2"
          style={{ animation: 'fade-in-up 0.3s ease-out' }}
        >
          Save
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: ADULT DAILY PAGE
// ─────────────────────────────────────────────────────────────────────────────

function AdultDailyPage({ person }: { person: PersonAccent }) {
  const timeOfDay = getTimeOfDay()
  const [checklists, setChecklists] = useState({
    morning: mockMorningChecklist,
    evening: mockEveningChecklist,
    leaving: mockLeavingChecklist,
  })

  const handleToggle = useCallback((checklistId: string, itemId: string) => {
    setChecklists(prev => {
      const key = checklistId as keyof typeof prev
      if (!prev[key]) return prev
      return {
        ...prev,
        [key]: {
          ...prev[key],
          items: prev[key].items.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        },
      }
    })
  }, [])

  // Determine which narrative section to show prominently
  const primaryNarrative = useMemo(() => {
    switch (timeOfDay) {
      case 'morning': return mockMorningBriefing
      case 'midday': return mockMiddayCheck
      case 'evening': return mockEveningReflection
    }
  }, [timeOfDay])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 stagger-in">
      {/* ─── Date header ─── */}
      <header className="text-center space-y-1">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
          {formatDate()}
        </div>
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: person.colorLight, color: person.color }}
        >
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: person.color }}
          >
            {person.initial}
          </span>
          {person.name}'s Day
        </div>
      </header>

      {/* ─── Primary narrative — the hero section ─── */}
      <section className="paper-texture card p-6 md:p-8">
        <div
          className="font-display text-[22px] md:text-[26px] leading-[1.5] text-neutral-800 whitespace-pre-line"
          style={{ fontStyle: 'italic' }}
        >
          {primaryNarrative}
        </div>
      </section>

      {/* ─── Transition coaching ─── */}
      {mockTransitions.length > 0 && (
        <section className="space-y-3">
          <SectionDivider label="Transition Coaching" icon="🧭" />
          {mockTransitions.map(cue => (
            <TransitionCueCard key={cue.id} cue={cue} accent={person} />
          ))}
        </section>
      )}

      {/* ─── Morning checklist (prominent in morning) ─── */}
      <section className="space-y-3">
        <SectionDivider
          label={timeOfDay === 'morning' ? 'Your Morning' : 'Morning Routine'}
          icon="☀️"
        />
        <div className="card p-4">
          <ChecklistCard
            checklist={checklists.morning}
            accent={person}
            onToggle={handleToggle}
          />
        </div>
      </section>

      {/* ─── Leaving the house ─── */}
      <ExpandableSection title="Leaving the House" icon="🚪" defaultOpen={timeOfDay === 'morning'}>
        <ChecklistCard
          checklist={checklists.leaving}
          accent={person}
          onToggle={handleToggle}
        />
      </ExpandableSection>

      {/* ─── Policies ─── */}
      {mockPolicies.length > 0 && (
        <section className="space-y-3">
          <SectionDivider label="Today's Policies" icon="📋" />
          {mockPolicies.map(policy => (
            <ExpandableSection
              key={policy.id}
              title={policy.title}
              icon={policy.icon}
              badge={`Agreed ${policy.agreedDate}`}
            >
              <div className="space-y-2">
                {policy.rules.map((rule, i) => (
                  <div key={i} className="flex gap-2.5 text-[13px] text-neutral-600">
                    <span className="text-neutral-300 mt-0.5 flex-shrink-0">•</span>
                    <span>{rule}</span>
                  </div>
                ))}
              </div>
            </ExpandableSection>
          ))}
        </section>
      )}

      {/* ─── Handoff script ─── */}
      <ExpandableSection title="Handoff — Grandma Carol" icon="👵">
        <HandoffScriptCard handoff={mockHandoff} accent={person} />
      </ExpandableSection>

      {/* ─── Reference cards ─── */}
      <section className="space-y-3">
        <SectionDivider label="Quick Reference" icon="📌" />
        <div className="grid grid-cols-3 gap-2">
          {mockReferenceCards.map(card => (
            <div
              key={card.id}
              className="card p-3 text-center space-y-1"
            >
              <span className="text-xl">{card.icon}</span>
              <div className="text-xs font-medium text-neutral-700">{card.title}</div>
              <div className="text-[11px] text-neutral-400">{card.detail}</div>
              {card.time && (
                <div
                  className="text-[11px] font-medium mt-1"
                  style={{ color: person.color }}
                >
                  {card.time}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ─── Meals ─── */}
      <ExpandableSection title="Today's Meals" icon="🍽️">
        <div className="space-y-3">
          {mockMeals.map((meal, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className="text-[11px] font-medium uppercase tracking-wide w-16 flex-shrink-0 pt-0.5"
                style={{ color: person.color }}
              >
                {meal.label}
              </div>
              <div>
                <div className="text-sm text-neutral-700">{meal.description}</div>
                {meal.note && (
                  <div className="text-xs text-neutral-400 italic mt-0.5">{meal.note}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </ExpandableSection>

      {/* ─── Evening checklist (prominent in evening) ─── */}
      <section className="space-y-3">
        <SectionDivider label="Tonight" icon="🌙" />
        <div className="card p-4">
          <ChecklistCard
            checklist={checklists.evening}
            accent={person}
            onToggle={handleToggle}
          />
        </div>
      </section>

      {/* ─── Other narrative sections (collapsed) ─── */}
      {timeOfDay !== 'morning' && (
        <ExpandableSection title="Morning Briefing" icon="☀️">
          <div className="font-display text-sm leading-relaxed text-neutral-600 whitespace-pre-line italic">
            {mockMorningBriefing}
          </div>
        </ExpandableSection>
      )}
      {timeOfDay !== 'midday' && (
        <ExpandableSection title="Midday Check" icon="⏰">
          <div className="font-display text-sm leading-relaxed text-neutral-600 whitespace-pre-line italic">
            {mockMiddayCheck}
          </div>
        </ExpandableSection>
      )}
      {timeOfDay !== 'evening' && (
        <ExpandableSection title="Evening Wind-Down" icon="🌅">
          <div className="font-display text-sm leading-relaxed text-neutral-600 whitespace-pre-line italic">
            {mockEveningReflection}
          </div>
        </ExpandableSection>
      )}

      {/* ─── Day rating ─── */}
      {timeOfDay === 'evening' && (
        <section className="card p-6">
          <DayRating accent={person} />
        </section>
      )}

      {/* ─── Footer ─── */}
      <footer className="text-center py-4 text-[11px] text-neutral-300">
        Today is one page in your yearbook.
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: CHILD DAILY PAGE (age 5)
// ─────────────────────────────────────────────────────────────────────────────

function ChildDailyPage({ person }: { person: PersonAccent }) {
  const [checklists, setChecklists] = useState({
    'sienna-morning': siennaChecklist,
    'sienna-afternoon': siennaAfternoon,
    'sienna-evening': siennaEvening,
  })

  const handleToggle = useCallback((checklistId: string, itemId: string) => {
    setChecklists(prev => {
      const key = checklistId as keyof typeof prev
      if (!prev[key]) return prev
      return {
        ...prev,
        [key]: {
          ...prev[key],
          items: prev[key].items.map(item =>
            item.id === itemId ? { ...item, checked: !item.checked } : item
          ),
        },
      }
    })
  }, [])

  const totalStars = Object.values(checklists).reduce(
    (sum, cl) => sum + cl.items.filter(i => i.checked).length,
    0
  )
  const totalItems = Object.values(checklists).reduce(
    (sum, cl) => sum + cl.items.length,
    0
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* ─── Header — playful, big ─── */}
      <header className="text-center space-y-3">
        <div className="text-4xl">🌞</div>
        <div
          className="font-display text-3xl"
          style={{ color: person.color }}
        >
          {new Date().toLocaleDateString('en-US', { weekday: 'long' })}!
        </div>
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium"
          style={{ backgroundColor: person.colorLight, color: person.color }}
        >
          {person.name}'s Day
        </div>
      </header>

      {/* ─── Star counter ─── */}
      <div className="text-center">
        <div className="flex justify-center gap-1">
          {Array.from({ length: totalItems }).map((_, i) => (
            <StarReward key={i} earned={i < totalStars} index={i} />
          ))}
        </div>
        <div className="text-xs text-neutral-400 mt-2">
          {totalStars} of {totalItems} stars earned!
        </div>
      </div>

      {/* ─── Narrative — big, warm, storybook-like ─── */}
      <section
        className="rounded-3xl p-6"
        style={{
          backgroundColor: person.colorLight,
          border: `2px solid ${person.colorMuted}`,
        }}
      >
        <div
          className="font-display text-xl leading-relaxed whitespace-pre-line"
          style={{ color: 'var(--color-neutral-700)' }}
        >
          {siennaBriefing}
        </div>
      </section>

      {/* ─── Checklists — big, tappable, with stars ─── */}
      {Object.entries(checklists).map(([key, cl]) => (
        <section key={key} className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xl">{cl.icon}</span>
            <span
              className="font-display text-xl"
              style={{ color: person.color }}
            >
              {cl.title}
            </span>
          </div>
          <ChecklistCard
            checklist={cl}
            accent={person}
            onToggle={handleToggle}
            mode="child"
          />
        </section>
      ))}

      {/* ─── Special info card ─── */}
      <div
        className="rounded-3xl p-5 text-center space-y-2"
        style={{
          backgroundColor: person.colorLight,
          border: `2px dashed ${person.colorMuted}`,
        }}
      >
        <span className="text-3xl">👵</span>
        <div className="font-display text-lg" style={{ color: person.color }}>
          Grandma Carol picks you up today!
        </div>
        <div className="text-sm text-neutral-500">At 3:15 after school</div>
      </div>

      {/* ─── Footer ─── */}
      <footer className="text-center py-4">
        <span className="text-2xl">🌟</span>
        <div className="text-xs text-neutral-400 mt-1">
          You're doing great, {person.name}!
        </div>
      </footer>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTED COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function DailyPageView() {
  const [mode, setMode] = useState<'scott' | 'sienna'>('scott')

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--color-bg-base)' }}>
      {/* Demo toggle — remove in production */}
      <div className="sticky top-0 z-10 glass border-b border-neutral-200/50">
        <div className="max-w-2xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
          <button
            onClick={() => setMode('scott')}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: mode === 'scott' ? SCOTT.color : 'transparent',
              color: mode === 'scott' ? 'white' : 'var(--color-neutral-500)',
            }}
          >
            Scott (Adult)
          </button>
          <button
            onClick={() => setMode('sienna')}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor: mode === 'sienna' ? SIENNA.color : 'transparent',
              color: mode === 'sienna' ? 'white' : 'var(--color-neutral-500)',
            }}
          >
            Sienna (Age 5)
          </button>
        </div>
      </div>

      {/* Page content */}
      <div key={mode} style={{ animation: 'fade-in-up 0.4s ease-out' }}>
        {mode === 'scott' ? (
          <AdultDailyPage person={SCOTT} />
        ) : (
          <ChildDailyPage person={SIENNA} />
        )}
      </div>
    </div>
  )
}
