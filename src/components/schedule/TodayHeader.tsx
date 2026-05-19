import { ChevronLeft, ChevronRight, Sun } from 'lucide-react'

interface TodayHeaderProps {
  viewedDate: Date
  onDateChange: (d: Date) => void
  onToggleWeather?: () => void
}

function shift(d: Date, days: number): Date {
  const n = new Date(d); n.setDate(n.getDate() + days); return n
}

export function TodayHeader({ viewedDate, onDateChange, onToggleWeather }: TodayHeaderProps) {
  const label = viewedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  return (
    <header className="flex items-center justify-between gap-4 mb-6">
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
        <h1 className="font-display text-[32px] leading-tight text-neutral-900 truncate">{label}</h1>
      </div>

      {/* Right: D/W/M segmented pill + sun toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="inline-flex rounded-full bg-neutral-100 p-1">
          <span className="bg-primary-600 text-white rounded-full px-4 py-1.5 text-sm font-medium">Day</span>
          <span className="text-neutral-500 px-4 py-1.5 text-sm cursor-default">Week</span>
          <span className="text-neutral-500 px-4 py-1.5 text-sm cursor-default">Month</span>
        </div>
        <button
          aria-label="Toggle weather"
          onClick={onToggleWeather}
          className="w-9 h-9 rounded-full border border-neutral-200 grid place-items-center text-amber-400 hover:bg-amber-50 transition-colors"
        >
          <Sun className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
