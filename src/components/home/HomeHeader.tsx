import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, CalendarCheck } from 'lucide-react'
import type { HomeViewType } from '@/types/homeView'
import { HomeViewSwitcher } from '@/components/home/HomeViewSwitcher'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'
import { DayNavCluster } from '@/components/schedule/DayNavCluster'
import { mondayOfWeek } from '@/lib/workweekHelpers'
import { useAppShellChrome } from '@/contexts/AppShellChromeContext'
import { HorizonExplainer } from '@/components/planning/explainers/HorizonExplainer'

interface HomeHeaderProps {
  currentView: HomeViewType
  onViewChange: (v: HomeViewType) => void

  /** For currentView === 'today' */
  viewedDate: Date
  onDateChange: (d: Date) => void

  /** For currentView === 'week' | 'workweek' */
  weekStart: Date
  onWeekChange: (d: Date) => void

  /** For currentView === 'month' */
  monthStart: Date
  onMonthChange: (d: Date) => void

  /** Launch the weekly planning session — shown only in week/workweek view. */
  onOpenWeeklyPlanning?: () => void
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n
}

function addMonths(d: Date, months: number): Date {
  const n = new Date(d); n.setMonth(n.getMonth() + months); return n
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function HomeHeader(props: HomeHeaderProps) {
  const { currentView, viewedDate, onDateChange, weekStart, onWeekChange, monthStart, onMonthChange, onViewChange, onOpenWeeklyPlanning } = props
  const { chatOpen, onChatOpenChange } = useAppShellChrome()
  // "What is this level?" — today's explainer. Link only, no first-visit
  // auto-open: Today is the app's default view, so a modal on first launch
  // would fight the empty state. Reachable via the link at any time.
  const [explainerOpen, setExplainerOpen] = useState(false)

  // Per-view label + chevron handlers
  let label: { short: string; long: string }
  let onPrev: () => void
  let onNext: () => void
  let prevLabel: string
  let nextLabel: string

  if (currentView === 'today') {
    label = {
      short: viewedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      long: viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    }
    onPrev = () => onDateChange(addDays(viewedDate, -1))
    onNext = () => onDateChange(addDays(viewedDate, 1))
    prevLabel = 'Previous day'
    nextLabel = 'Next day'
  } else if (currentView === 'workweek') {
    // Workweek: render Monday-anchored 5-day range. Step by 7 days to stay
    // Sunday-anchored at the state layer (HomeView's onWeekChange normalizes).
    const mondayStart = mondayOfWeek(weekStart)
    const fri = addDays(mondayStart, 4)
    const shortStr = `${formatDayShort(mondayStart)} – ${formatDayShort(fri)}`
    label = { short: shortStr, long: shortStr }
    onPrev = () => onWeekChange(addDays(weekStart, -7))
    onNext = () => onWeekChange(addDays(weekStart, 7))
    prevLabel = 'Previous week'
    nextLabel = 'Next week'
  } else if (currentView === 'week') {
    const lastDay = addDays(weekStart, 6)
    const shortStr = `${formatDayShort(weekStart)} – ${formatDayShort(lastDay)}`
    label = { short: shortStr, long: shortStr }
    onPrev = () => onWeekChange(addDays(weekStart, -7))
    onNext = () => onWeekChange(addDays(weekStart, 7))
    prevLabel = 'Previous week'
    nextLabel = 'Next week'
  } else {
    // month
    const shortStr = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    label = { short: shortStr, long: shortStr }
    onPrev = () => onMonthChange(addMonths(monthStart, -1))
    onNext = () => onMonthChange(addMonths(monthStart, 1))
    prevLabel = 'Previous month'
    nextLabel = 'Next month'
  }

  return (
    <header className="mb-6 px-3 md:px-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        {currentView === 'today' ? (
          <DayNavCluster viewedDate={viewedDate} onDateChange={onDateChange} />
        ) : (
          <div className="flex items-center gap-2 min-w-0 justify-center md:justify-start">
            <button
              aria-label={prevLabel}
              onClick={onPrev}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h1 className="font-display text-2xl md:text-[32px] leading-tight text-neutral-900 min-w-0 text-center md:text-left">
              <span className="md:hidden">{label.short}</span>
              <span className="hidden md:inline">{label.long}</span>
            </h1>
            <button
              aria-label={nextLabel}
              onClick={onNext}
              className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

      <div className="hidden md:flex items-center gap-2 md:shrink-0 md:pb-1">
        <DomainSwitcher />
        <HomeViewSwitcher currentView={currentView} onViewChange={onViewChange} />
        {onOpenWeeklyPlanning && (currentView === 'week' || currentView === 'workweek') && (
          <button
            onClick={onOpenWeeklyPlanning}
            className="flex items-center gap-1.5 h-9 px-3 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-600 hover:text-primary-600 hover:border-primary-300 transition-all text-sm font-medium shadow-card"
            aria-label="Plan the week"
            title="Plan the week"
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Plan the week</span>
          </button>
        )}
        {currentView === 'today' && (
          <button
            type="button"
            onClick={() => setExplainerOpen(true)}
            className="text-[12px] text-neutral-400 hover:text-primary-700 transition-colors px-1"
          >
            What is this level?
          </button>
        )}
        <button
          onClick={() => onChatOpenChange(!chatOpen)}
          className={`w-9 h-9 rounded-full bg-bg-elevated border border-neutral-200 text-neutral-500 hover:text-primary-500 hover:border-primary-300 transition-all grid place-items-center shadow-card ${
            chatOpen ? 'ring-2 ring-primary-500/30 text-primary-500 border-primary-500' : ''
          }`}
          aria-label="AI chat"
          title="AI chat"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </div>
      </div>

      {/* Hairline rule anchors the masthead and separates it from the content below */}
      <div className="hidden md:block mt-4 h-px bg-gradient-to-r from-neutral-200 to-transparent" />
      <HorizonExplainer horizon="today" open={explainerOpen} onClose={() => setExplainerOpen(false)} />
    </header>
  )
}
