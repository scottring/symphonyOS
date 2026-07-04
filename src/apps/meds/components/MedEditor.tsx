import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { Medication } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'

interface Props {
  initial?: Medication
  onSave: (input: MedicationInput) => void
  onCancel: () => void
}

export function MedEditor({ initial, onSave, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [strength, setStrength] = useState(initial?.strength ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [times, setTimes] = useState<string[]>(initial?.scheduleTimes ?? [])
  const [newTime, setNewTime] = useState('')

  function addTime() {
    if (!/^\d{2}:\d{2}$/.test(newTime)) return
    if (times.includes(newTime)) return
    setTimes([...times, newTime].sort())
    setNewTime('')
  }

  return (
    <div className="card p-4 space-y-3">
      <input className="input-base text-2xl font-display w-full" placeholder="Medication name"
        value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input-base w-full" placeholder="Strength (e.g. 25/100 mg)"
        value={strength} onChange={(e) => setStrength(e.target.value)} />
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {times.map((t) => (
            <span key={t} className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary-50 text-sm">
              {t}
              <button onClick={() => setTimes(times.filter((x) => x !== t))}><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input type="time" className="input-base" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
          <button className="card px-3 flex items-center gap-1" onClick={addTime}>
            <Plus className="w-4 h-4" /> Add time
          </button>
        </div>
      </div>
      <textarea className="input-base w-full" placeholder="Notes" value={notes}
        onChange={(e) => setNotes(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <button className="card px-4 py-2" onClick={onCancel}>Cancel</button>
        <button className="btn-primary px-4 py-2" disabled={!name.trim()}
          onClick={() => onSave({ name: name.trim(), strength: strength.trim() || undefined,
            scheduleTimes: times, notes: notes.trim() || undefined })}>
          Save
        </button>
      </div>
    </div>
  )
}
