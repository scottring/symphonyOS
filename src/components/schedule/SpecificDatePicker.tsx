// src/components/schedule/SpecificDatePicker.tsx
//
// Small shared date + optional-time entry form used by the reschedule grid and
// the triage fan-out for picking a precise slot. Date only → all-day; date +
// time → a timed slot. Calls onSubmit(date, isAllDay).

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'

interface Props {
  onSubmit: (date: Date, isAllDay: boolean) => void
  onBack?: () => void
}

export function SpecificDatePicker({ onSubmit, onBack }: Props) {
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')

  const submit = () => {
    if (!dateStr) return
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    let isAllDay = true
    if (timeStr) {
      const [hh, mm] = timeStr.split(':').map(Number)
      date.setHours(hh, mm, 0, 0)
      isAllDay = false
    } else {
      date.setHours(0, 0, 0, 0)
    }
    onSubmit(date, isAllDay)
  }

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      {onBack && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onBack() }}
          className="flex items-center gap-1.5 px-1 pb-1 text-[11px] uppercase tracking-wider font-medium text-neutral-400 hover:text-neutral-600"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Pick a date
        </button>
      )}
      <input
        type="date"
        value={dateStr}
        onChange={(e) => setDateStr(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      />
      <input
        type="time"
        value={timeStr}
        onChange={(e) => setTimeStr(e.target.value)}
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); submit() }}
        disabled={!dateStr}
        className={`w-full rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          dateStr ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-neutral-100 text-neutral-300 cursor-not-allowed'
        }`}
      >
        {timeStr ? 'Set date & time' : 'Set date (all day)'}
      </button>
    </div>
  )
}
