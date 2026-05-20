import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { HomeViewType } from '@/types/homeView'
import { HomeViewSwitcher } from '@/components/home/HomeViewSwitcher'
import { DomainSwitcher } from '@/components/domain/DomainSwitcher'

interface TodayHeaderProps {
  viewedDate: Date
  onDateChange: (d: Date) => void
  onToggleWeather?: () => void
  currentHomeView?: HomeViewType
  onHomeViewChange?: (view: HomeViewType) => void
}

function shift(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n
}

export function TodayHeader({ viewedDate, onDateChange, currentHomeView, onHomeViewChange }: TodayHeaderProps) {
  const label = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <header className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between md:gap-4">
      {/* Left: prev/next + date */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          aria-label="Previous day"
          onClick={() => onDateChange(shift(viewedDate, -1))}
          className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          aria-label="Next day"
          onClick={() => onDateChange(shift(viewedDate, 1))}
          className="p-1.5 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <h1 className="font-display text-2xl md:text-[32px] leading-tight text-neutral-900 truncate">{label}</h1>
      </div>

      {/* Right: context (domain) chooser + D/W/M switcher.
          Hidden on mobile to match the pre-redesign behaviour — last week's
          working mobile didn't render either of these in the header. */}
      <div className="hidden md:flex items-center gap-2 md:shrink-0">
        <DomainSwitcher />
        {currentHomeView !== undefined && onHomeViewChange !== undefined && (
          <HomeViewSwitcher
            currentView={currentHomeView}
            onViewChange={onHomeViewChange}
          />
        )}
      </div>
    </header>
  )
}
