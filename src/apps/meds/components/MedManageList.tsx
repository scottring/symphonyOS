import { useState } from 'react'
import { Plus, Pencil, Trash2, Check } from 'lucide-react'
import type { Medication, MedicationLog } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'
import { MedEditor } from './MedEditor'

interface Props {
  medications: Medication[]; logs: MedicationLog[]
  onAdd: (input: MedicationInput) => Promise<Medication | null>
  onUpdate: (id: string, patch: Partial<MedicationInput>) => void
  onDelete: (id: string) => void
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
  onUpdateLog: (id: string, patch: { takenAt?: Date; note?: string }) => void
  onDeleteLog: (id: string) => void
}

export function MedManageList(props: Props) {
  const { medications, onAdd, onUpdate, onDelete, onLogDose } = props
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {medications.map((m) =>
        editingId === m.id ? (
          <MedEditor key={m.id} initial={m}
            onSave={(input) => { onUpdate(m.id, input); setEditingId(null) }}
            onCancel={() => setEditingId(null)} />
        ) : (
          <div key={m.id} className="card p-4 flex items-center justify-between">
            <div>
              <div className="font-medium">{m.name} {m.strength && <span className="text-neutral-400">· {m.strength}</span>}</div>
              <div className="text-sm text-neutral-500">{m.scheduleTimes.join(', ') || 'No schedule'}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-primary px-3 py-1 flex items-center gap-1 text-sm"
                onClick={() => onLogDose(m.id)} title="Log a dose now">
                <Check className="w-4 h-4" /> Take now
              </button>
              <button className="card px-2 py-1" onClick={() => setEditingId(m.id)}><Pencil className="w-4 h-4" /></button>
              <button className="card px-2 py-1" onClick={() => onDelete(m.id)}><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        )
      )}

      {adding ? (
        <MedEditor onSave={async (input) => { await onAdd(input); setAdding(false) }} onCancel={() => setAdding(false)} />
      ) : (
        <button className="card p-4 w-full flex items-center gap-2 justify-center" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Add medication
        </button>
      )}
    </div>
  )
}
