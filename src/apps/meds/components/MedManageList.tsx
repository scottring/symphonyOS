import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, KeyRound } from 'lucide-react'
import type { Medication } from '@/types/medication'
import type { MedicationInput } from '@/hooks/useMedications'
import { MedEditor } from './MedEditor'
import { supabase } from '@/lib/supabase'

interface Props {
  medications: Medication[]
  onAdd: (input: MedicationInput) => Promise<Medication | null>
  onUpdate: (id: string, patch: Partial<MedicationInput>) => void
  onDelete: (id: string) => void
  onLogDose: (medicationId: string, takenAt?: Date, note?: string) => void
}

export function MedManageList(props: Props) {
  const { medications, onAdd, onUpdate, onDelete, onLogDose } = props
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  async function revealToken() {
    const { data, error } = await supabase.rpc('ensure_med_log_token')
    if (!error && typeof data === 'string') setToken(data)
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <button className="flex items-center gap-2 text-sm" onClick={revealToken}>
          <KeyRound className="w-4 h-4" /> Show voice-logging token
        </button>
        {token && (
          <code className="block mt-2 break-all text-xs bg-neutral-100 p-2 rounded select-all">{token}</code>
        )}
      </div>

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
              <button className="card px-2 py-1" onClick={() => {
                if (window.confirm('Delete this medication and all its logged doses?')) onDelete(m.id)
              }}><Trash2 className="w-4 h-4" /></button>
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
