import { useState } from 'react'
import type { ManualRecipeInput } from '@/hooks/useRecipes'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSave: (input: ManualRecipeInput) => Promise<void>
}

export function RecipeManualEditor({ isOpen, onClose, onSave }: Props) {
  const [title, setTitle] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [prepMinutes, setPrepMinutes] = useState('')
  const [sourceLabel, setSourceLabel] = useState('')
  const [acceptanceSentence, setAcceptanceSentence] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSave = async () => {
    if (!title.trim()) { setError('Title required'); return }
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: title.trim(),
        ingredients: ingredients.split('\n').map(s => s.trim()).filter(Boolean),
        instructions: instructions.split('\n').map(s => s.trim()).filter(Boolean),
        prepMinutes: prepMinutes ? parseInt(prepMinutes, 10) : undefined,
        sourceLabel: sourceLabel.trim() || undefined,
        acceptanceSentence: acceptanceSentence.trim() || undefined,
      })
      handleClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
      setSaving(false)
    }
  }

  const handleClose = () => {
    setTitle(''); setIngredients(''); setInstructions(''); setPrepMinutes('')
    setSourceLabel(''); setAcceptanceSentence(''); setError(null); setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-bg-elevated rounded-3xl shadow-elevated max-w-3xl w-full mx-6 max-h-[90vh] overflow-y-auto p-10" onClick={(e) => e.stopPropagation()}>
        <div className="text-[0.7rem] font-bold uppercase tracking-[0.25em] text-neutral-500 mb-3">
          MANUAL ENTRY
        </div>
        <h2 className="font-display text-4xl text-neutral-800 mb-6">
          Add a <span className="italic text-primary-500">recipe.</span>
        </h2>

        <div className="space-y-5">
          <Field label="Title" value={title} onChange={setTitle} required />
          <Field label="Source (e.g. cookbook name)" value={sourceLabel} onChange={setSourceLabel} />
          <Field label="Total minutes" value={prepMinutes} onChange={setPrepMinutes} type="number" />

          <FieldArea label="Ingredients (one per line)" value={ingredients} onChange={setIngredients} rows={8} />
          <FieldArea label="Instructions (one step per line)" value={instructions} onChange={setInstructions} rows={6} />
          <FieldArea label="Kid acceptance sentence (optional)" value={acceptanceSentence} onChange={setAcceptanceSentence} rows={2}
                     placeholder="e.g. Both kids love this. Or: Kaleb negotiates." />
        </div>

        {error && <p className="mt-4 text-[14px] text-accent-500">{error}</p>}

        <div className="mt-6 flex gap-3 justify-end">
          <button onClick={handleClose} className="px-5 py-2 rounded-2xl text-neutral-600 hover:bg-neutral-100">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
                  className="px-6 py-2 rounded-2xl bg-primary-500 text-white font-medium disabled:opacity-40 hover:bg-primary-600">
            {saving ? 'Saving…' : 'Save to shelf'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-bold uppercase tracking-widest text-neutral-500 mb-1">
        {label}{required && ' *'}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
             className="w-full px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500" />
    </div>
  )
}

function FieldArea({ label, value, onChange, rows, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows: number; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[12px] font-bold uppercase tracking-widest text-neutral-500 mb-1">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
                className="w-full px-4 py-2 rounded-xl border border-neutral-200 bg-bg-base focus:outline-none focus:border-primary-500" />
    </div>
  )
}
