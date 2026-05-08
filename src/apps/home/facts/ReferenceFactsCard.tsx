import { useState } from 'react'
import { useReferenceFacts } from '@/hooks/useReferenceFacts'
import { FactRow } from './FactRow'
import type { Fact } from '@/types/home'

interface Props {
  spaceId: string
  facts: Fact[]
  updateSpace: (id: string, patch: { facts: Fact[] }) => Promise<void> | void
}

export function ReferenceFactsCard({ spaceId, facts, updateSpace }: Props) {
  const { addFact, updateFact, removeFact } = useReferenceFacts(spaceId, facts, updateSpace)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<Fact>({ type: 'wifi', label: '', value: '' })

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-display text-lg">Facts</h3>
        <button
          className="text-sm text-primary-700"
          onClick={() => setAdding(true)}
          aria-label="Add fact"
        >+ Add</button>
      </div>

      <div className="divide-y divide-neutral-200">
        {facts.map((f, i) => (
          <FactRow
            key={i}
            fact={f}
            onChange={(patch) => updateFact(i, patch)}
            onRemove={() => removeFact(i)}
          />
        ))}
      </div>

      {adding && (
        <div className="mt-3 pt-3 border-t border-neutral-200 space-y-2">
          <select
            className="input-base"
            aria-label="Type"
            value={draft.type}
            onChange={(e) => setDraft({ ...draft, type: e.target.value as Fact['type'] })}
          >
            <option value="wifi">WiFi</option>
            <option value="paint">Paint</option>
            <option value="code">Code / Combo</option>
            <option value="supply">Supply / Spec</option>
            <option value="measurement">Measurement</option>
            <option value="freetext">Note</option>
          </select>
          <input
            className="input-base"
            placeholder="Label"
            aria-label="Label"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            className="input-base"
            placeholder="Value"
            aria-label="Value"
            value={draft.value}
            onChange={(e) => setDraft({ ...draft, value: e.target.value })}
          />
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                try {
                  addFact(draft)
                  setDraft({ type: 'wifi', label: '', value: '' })
                  setAdding(false)
                } catch (err) {
                  alert((err as Error).message)
                }
              }}
            >Save</button>
            <button
              className="px-3 py-1 text-sm text-neutral-500"
              onClick={() => setAdding(false)}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
