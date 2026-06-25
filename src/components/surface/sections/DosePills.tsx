import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface DosePillsProps {
  times: string[]
  onChange: (times: string[]) => void
}

function norm(t: string): string {
  return t.slice(0, 5)
}

export function DosePills({ times, onChange }: DosePillsProps) {
  const [draft, setDraft] = useState('')

  const remove = (t: string) => onChange(times.filter(x => norm(x) !== norm(t)))

  const add = () => {
    if (!draft) return
    const next = norm(draft)
    if (times.some(x => norm(x) === next)) return
    onChange([...times.map(norm), next].sort())
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {times.map(t => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 text-primary-700 text-sm px-2.5 py-1">
            {norm(t)}
            <button type="button" aria-label={`Remove ${norm(t)}`} onClick={() => remove(t)} className="hover:text-primary-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        {times.length === 0 && <span className="text-sm text-neutral-500">No set times — runs once.</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          aria-label="Add a dose time"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="input-base text-sm py-1 px-2"
        />
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:text-primary-900">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
    </div>
  )
}
