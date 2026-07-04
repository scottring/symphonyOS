import { Check, Circle } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import { matchLogsToSlots } from '@/lib/meds/slotMatching'

interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}
function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function TodayStrip({ medications, logs, onLogDose }: Props) {
  const today = new Date()
  const active = medications.filter((m) => m.active)
  if (active.length === 0) return <p className="text-neutral-500">No active medications. Add one in Manage.</p>

  return (
    <div className="space-y-4">
      {active.map((m) => {
        const todaysLogs = logs.filter((l) => l.medicationId === m.id && isToday(l.takenAt))
        const { slots, extras } = matchLogsToSlots(m.scheduleTimes, todaysLogs, today, 90)
        return (
          <div key={m.id} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">{m.name} {m.strength && <span className="text-neutral-400">· {m.strength}</span>}</div>
              <button className="btn-primary px-3 py-1 text-sm" onClick={() => onLogDose(m.id)}>Take now</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {slots.map((s) => (
                <span key={s.slot} className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm ${
                  s.log ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                }`}>
                  {s.log ? <Check className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
                  {s.slot}{s.log ? ` · ${fmt(s.log.takenAt)}` : ''}
                </span>
              ))}
              {extras.map((l) => (
                <span key={l.id} className="flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-700">
                  <Check className="w-3 h-3" /> extra · {fmt(l.takenAt)}
                </span>
              ))}
              {m.scheduleTimes.length === 0 && todaysLogs.length === 0 && (
                <span className="text-sm text-neutral-400">As needed — no doses logged today</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
