import { useState, useMemo } from 'react'
import { Pencil, Trash2, Pill, Activity } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { Symptom, SymptomLog, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'
import { computeIntervals } from '@/lib/meds/intervals'
import { mergeTimeline } from '@/lib/meds/timelineMerge'
import type { TimelineRow } from '@/lib/meds/timelineMerge'
import { LogEditor } from './LogEditor'

interface Props {
  medications: Medication[]
  doseLogs: MedicationLog[]
  onUpdateDose: (id: string, patch: { medicationId?: string; takenAt?: Date; note?: string }) => void
  onDeleteDose: (id: string) => void
  symptoms: Symptom[]
  symptomLogs: SymptomLog[]
  onUpdateSymptom: (id: string, patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => void
  onDeleteSymptom: (id: string) => void
}

function fmt(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtGap(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
const SEVERITY_COLOR: Record<Severity, string> = {
  1: 'text-amber-500', 2: 'text-orange-500', 3: 'text-red-600',
}

export function TimingView(props: Props) {
  const { medications, doseLogs, onUpdateDose, onDeleteDose, symptoms, symptomLogs, onUpdateSymptom, onDeleteSymptom } = props
  const [days, setDays] = useState<7 | 30>(7)
  const [editingId, setEditingId] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/purity -- range boundary is intentionally computed at render time
  const since = Date.now() - days * 86_400_000
  const doses = useMemo(() => doseLogs.filter((l) => l.takenAt.getTime() >= since), [doseLogs, since])
  const symps = useMemo(() => symptomLogs.filter((l) => l.loggedAt.getTime() >= since), [symptomLogs, since])
  const timeline = useMemo(() => mergeTimeline(doses, symps), [doses, symps])

  const medName = (id: string) => medications.find((m) => m.id === id)?.name ?? 'Medication'
  const sympName = (id: string) => symptoms.find((s) => s.id === id)?.name ?? 'Symptom'

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([7, 30] as const).map((d) => (
          <button key={d} className={`px-3 py-1 rounded-full text-sm ${days === d ? 'btn-primary' : 'card'}`}
            onClick={() => setDays(d)}>{d} days</button>
        ))}
      </div>

      {timeline.length === 0 && <p className="text-neutral-500">Nothing logged in this range.</p>}
      {timeline.map((day) => {
        // Dose intervals are computed among that day's doses only, in chronological order,
        // then keyed by dose id so render order (e.g. an in-progress edit) can't shift them.
        const dayDoses = day.rows
          .filter((r): r is Extract<TimelineRow, { kind: 'dose' }> => r.kind === 'dose')
          .map((r) => r.log)
        const intervals = computeIntervals(dayDoses)
        const gapById = new Map<string, number>()
        dayDoses.forEach((d, i) => { if (i > 0) gapById.set(d.id, intervals[i - 1].minutes) })
        return (
          <div key={day.key} className="card p-4">
            <div className="font-medium mb-2">{day.label}</div>
            <div className="space-y-1">
              {day.rows.map((row) => {
                if (editingId === row.log.id) {
                  return row.kind === 'dose' ? (
                    <LogEditor key={row.log.id} kind="dose" log={row.log} medications={medications}
                      onSave={(patch) => { onUpdateDose(row.log.id, patch); setEditingId(null) }}
                      onCancel={() => setEditingId(null)} />
                  ) : (
                    <LogEditor key={row.log.id} kind="symptom" log={row.log} symptoms={symptoms}
                      onSave={(patch) => { onUpdateSymptom(row.log.id, patch); setEditingId(null) }}
                      onCancel={() => setEditingId(null)} />
                  )
                }
                if (row.kind === 'dose') {
                  const gap = gapById.get(row.log.id)
                  return (
                    <div key={row.log.id} className="flex items-center gap-3 text-sm">
                      <Pill className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="w-16 tabular-nums">{fmt(row.at)}</span>
                      <span className="text-neutral-700">{medName(row.log.medicationId)}</span>
                      {gap !== undefined && <span className="text-neutral-400">+{fmtGap(gap)}</span>}
                      <div className="ml-auto flex items-center gap-1">
                        <button className="card px-2 py-1" onClick={() => setEditingId(row.log.id)} title="Edit dose"><Pencil className="w-4 h-4" /></button>
                        <button className="card px-2 py-1" onClick={() => { if (window.confirm('Delete this logged dose?')) onDeleteDose(row.log.id) }} title="Delete dose"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  )
                }
                const sev = row.log.severity
                return (
                  <div key={row.log.id} className="flex items-center gap-3 text-sm">
                    <Activity className={`w-4 h-4 shrink-0 ${SEVERITY_COLOR[sev]}`} />
                    <span className="w-16 tabular-nums">{fmt(row.at)}</span>
                    <span className="text-neutral-700">{sympName(row.log.symptomId)}</span>
                    <span className={`text-xs ${SEVERITY_COLOR[sev]}`}>{SEVERITY_LABELS[sev]}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button className="card px-2 py-1" onClick={() => setEditingId(row.log.id)} title="Edit symptom"><Pencil className="w-4 h-4" /></button>
                      <button className="card px-2 py-1" onClick={() => { if (window.confirm('Delete this logged symptom?')) onDeleteSymptom(row.log.id) }} title="Delete symptom"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
