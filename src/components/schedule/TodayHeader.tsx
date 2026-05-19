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
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-3xl md:text-4xl text-neutral-900 tracking-tight truncate">{label}</h1>
        <div className="flex items-center gap-1 shrink-0">
          <button aria-label="Previous day" onClick={() => onDateChange(shift(viewedDate, -1))}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button aria-label="Next day" onClick={() => onDateChange(shift(viewedDate, 1))}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      {onToggleWeather && (
        <div className="flex items-center gap-2 shrink-0">
          <button aria-label="Toggle weather" onClick={onToggleWeather}
            className="p-1.5 rounded-md text-amber-400 hover:bg-amber-50">
            <Sun className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  )
}
