import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import type { Symptom } from '@/types/symptom'
import type { SymptomInput } from '@/hooks/useSymptoms'

interface Props {
  symptoms: Symptom[]
  onAdd: (input: SymptomInput) => Promise<Symptom | null>
  onUpdate: (id: string, patch: Partial<SymptomInput>) => void
  onDelete: (id: string) => void
}

export function SymptomManageList({ symptoms, onAdd, onUpdate, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  async function add() {
    if (!newName.trim()) return
    await onAdd({ name: newName.trim() })
    setNewName(''); setAdding(false)
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-display">Symptoms</h2>
      {symptoms.map((s) =>
        editingId === s.id ? (
          <div key={s.id} className="card p-3 flex items-center gap-2">
            <input className="input-base flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button className="card px-2 py-1" onClick={() => { onUpdate(s.id, { name: editName.trim() }); setEditingId(null) }} title="Save">
              <Check className="w-4 h-4" />
            </button>
            <button className="card px-2 py-1" onClick={() => setEditingId(null)} title="Cancel">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div key={s.id} className="card p-3 flex items-center justify-between">
            <span className={s.active ? '' : 'text-neutral-400 line-through'}>{s.name}</span>
            <div className="flex items-center gap-1">
              <button className="card px-2 py-1 text-xs" onClick={() => onUpdate(s.id, { active: !s.active })}>
                {s.active ? 'Active' : 'Inactive'}
              </button>
              <button className="card px-2 py-1" onClick={() => { setEditingId(s.id); setEditName(s.name) }} title="Rename">
                <Pencil className="w-4 h-4" />
              </button>
              <button className="card px-2 py-1" onClick={() => {
                if (window.confirm('Delete this symptom and all its logs?')) onDelete(s.id)
              }} title="Delete symptom">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )
      )}
      {adding ? (
        <div className="card p-3 flex items-center gap-2">
          <input className="input-base flex-1 text-lg font-display" placeholder="Symptom name" autoFocus
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button className="btn-primary px-3 py-1" onClick={add} disabled={!newName.trim()}>Add</button>
          <button className="card px-2 py-1" onClick={() => { setAdding(false); setNewName('') }} title="Cancel">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button className="card p-3 w-full flex items-center gap-2 justify-center" onClick={() => setAdding(true)}>
          <Plus className="w-4 h-4" /> Add symptom
        </button>
      )}
    </div>
  )
}
