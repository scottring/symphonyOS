// src/components/schedule/StatsRow.tsx
import { CheckCircle2, CalendarRange, Circle, Sparkles } from 'lucide-react'

interface StatsRowProps {
  dueToday: number
  thisWeek: number
  total: number
  clarityLabel: string
  aiAvailable: boolean
}

function plural(n: number) {
  return n === 1 ? 'task' : 'tasks'
}

export function StatsRow({ dueToday, thisWeek, total, clarityLabel, aiAvailable }: StatsRowProps) {
  return (
    <div className="flex items-center flex-wrap gap-x-6 gap-y-2 text-[13px] text-neutral-500">
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-primary-500" />
        {dueToday} {plural(dueToday)} due today
      </span>
      <span className="inline-flex items-center gap-1.5">
        <CalendarRange className="w-4 h-4 text-neutral-400" />
        {thisWeek} {plural(thisWeek)} this week
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Circle className="w-4 h-4 text-neutral-300" />
        {total} {plural(total)} total
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Sparkles className="w-4 h-4 text-amber-400" />
        <span className="text-neutral-600 font-medium">Clarity</span>
        <span className="text-neutral-400">{clarityLabel}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${aiAvailable ? 'bg-primary-500' : 'bg-neutral-300'}`} />
        <span className="text-neutral-600 font-medium">AI</span>
        <span className="text-neutral-400">{aiAvailable ? 'Suggestions available' : 'No suggestions'}</span>
      </span>
    </div>
  )
}
