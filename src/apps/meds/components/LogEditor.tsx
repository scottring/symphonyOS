import { useState } from 'react'
import { Check, X } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { Symptom, SymptomLog, Severity } from '@/types/symptom'
import { SEVERITY_LABELS } from '@/types/symptom'

export function toDatetimeLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export function fromDatetimeLocal(v: string): Date | null {
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

type Props =
  | {
      kind: 'dose'; log: MedicationLog; medications: Medication[]
      onSave: (patch: { medicationId?: string; takenAt?: Date; note?: string }) => void
      onCancel: () => void
    }
  | {
      kind: 'symptom'; log: SymptomLog; symptoms: Symptom[]
      onSave: (patch: { symptomId?: string; severity?: Severity; loggedAt?: Date; note?: string }) => void
      onCancel: () => void
    }

export function LogEditor(props: Props) {
  const initialAt = props.kind === 'dose' ? props.log.takenAt : props.log.loggedAt
  const [entityId, setEntityId] = useState(
    props.kind === 'dose' ? props.log.medicationId : props.log.symptomId,
  )
  const [when, setWhen] = useState(toDatetimeLocal(initialAt))
  const [note, setNote] = useState(props.log.note ?? '')
  const [severity, setSeverity] = useState<Severity>(props.kind === 'symptom' ? props.log.severity : 2)

  const options = props.kind === 'dose' ? props.medications : props.symptoms

  function save() {
    const at = fromDatetimeLocal(when)
    if (!at) return
    if (props.kind === 'dose') {
      props.onSave({ medicationId: entityId, takenAt: at, note: note.trim() })
    } else {
      props.onSave({ symptomId: entityId, severity, loggedAt: at, note: note.trim() })
    }
  }

  return (
    <div className="card p-3 space-y-2">
      <select className="input-base w-full" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <input type="datetime-local" className="input-base w-full" value={when} onChange={(e) => setWhen(e.target.value)} />
      {props.kind === 'symptom' && (
        <div className="flex items-center gap-2">
          {([1, 2, 3] as Severity[]).map((sev) => (
            <button key={sev} type="button"
              className={`px-3 py-1 rounded-full text-sm ${severity === sev ? 'btn-primary' : 'card'}`}
              onClick={() => setSeverity(sev)}>
              {SEVERITY_LABELS[sev]}
            </button>
          ))}
        </div>
      )}
      <input className="input-base w-full" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex justify-end gap-2">
        <button className="card px-3 py-1" onClick={props.onCancel} title="Cancel"><X className="w-4 h-4" /></button>
        <button className="btn-primary px-3 py-1" onClick={save} title="Save"><Check className="w-4 h-4" /></button>
      </div>
    </div>
  )
}
