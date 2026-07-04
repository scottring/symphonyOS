import { useState, useMemo } from 'react'
import { Pencil, Trash2, Check } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import { computeIntervals } from '@/lib/meds/intervals'

interface Props {
  medications: Medication[]
  logs: MedicationLog[]
  onUpdateLog: (id: string, patch: { takenAt?: Date; note?: string }) => void
  onDeleteLog: (id: string) => void
}

function dayKey(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtGap(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TimingView({ medications, logs, onUpdateLog, onDeleteLog }: Props) {
  const [days, setDays] = useState<7 | 30>(7)
  const [medId, setMedId] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [time, setTime] = useState('')

  // eslint-disable-next-line react-hooks/purity -- range boundary is intentionally computed at render time
  const since = Date.now() - days * 86_400_000
  const filtered = useMemo(() => {
    return logs.filter((l) => l.takenAt.getTime() >= since && (medId === 'all' || l.medicationId === medId))
  }, [logs, medId, since])

  const byDay = useMemo(() => {
    const groups = new Map<string, MedicationLog[]>()
    for (const l of [...filtered].sort((a, b) => a.takenAt.getTime() - b.takenAt.getTime())) {
      const k = dayKey(l.takenAt)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k)!.push(l)
    }
    return [...groups.entries()].reverse()
  }, [filtered])

  function startEdit(l: MedicationLog) {
    setEditingId(l.id)
    setTime(toTimeInputValue(l.takenAt))
  }

  function saveEdit(l: MedicationLog) {
    const [hours, minutes] = time.split(':').map(Number)
    if (Number.isNaN(hours) || Number.isNaN(minutes)) { setEditingId(null); return }
    const newDate = new Date(l.takenAt)
    newDate.setHours(hours, minutes, 0, 0)
    onUpdateLog(l.id, { takenAt: newDate })
    setEditingId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {([7, 30] as const).map((d) => (
            <button key={d} className={`px-3 py-1 rounded-full text-sm ${days === d ? 'btn-primary' : 'card'}`}
              onClick={() => setDays(d)}>{d} days</button>
          ))}
        </div>
        <select className="input-base" value={medId} onChange={(e) => setMedId(e.target.value)}>
          <option value="all">All meds</option>
          {medications.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {byDay.length === 0 && <p className="text-neutral-500">No doses logged in this range.</p>}
      {byDay.map(([day, dayLogs]) => {
        const intervals = computeIntervals(dayLogs)
        return (
          <div key={day} className="card p-4">
            <div className="font-medium mb-2">{day}</div>
            <div className="space-y-1">
              {dayLogs.map((l, i) => (
                <div key={l.id} className="flex items-center gap-3 text-sm">
                  {editingId === l.id ? (
                    <>
                      <input type="time" className="input-base w-32" value={time}
                        onChange={(e) => setTime(e.target.value)} />
                      <button className="card px-2 py-1" onClick={() => saveEdit(l)} title="Save">
                        <Check className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-16 tabular-nums">{fmt(l.takenAt)}</span>
                      {i > 0 && <span className="text-neutral-400">+{fmtGap(intervals[i - 1].minutes)}</span>}
                      {l.source !== 'web' && l.source !== 'manual' && <span className="text-xs text-primary-500">voice</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <button className="card px-2 py-1" onClick={() => startEdit(l)} title="Edit time">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button className="card px-2 py-1" onClick={() => onDeleteLog(l.id)} title="Delete dose">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
