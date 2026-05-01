import { useState } from 'react'
import { useDietaryRestrictions } from '@/hooks/useDietaryRestrictions'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

export function RestrictionsSection() {
  const { items, add, remove, loading, error } = useDietaryRestrictions()
  const { members } = useFamilyMembers()
  const [draftLabel, setDraftLabel] = useState('')
  const [draftWho, setDraftWho] = useState<string | null>(null)

  return (
    <section className="mt-12">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className="font-display text-[2rem] leading-tight text-neutral-800">
            Restrictions <span className="italic text-primary-500">.</span>
          </h2>
          <p className="font-display italic text-[1.05rem] text-neutral-500 mt-2 max-w-md">
            Hard rules the meal planner respects. Per person, or for the whole household.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-neutral-200 bg-bg-elevated shadow-card overflow-hidden">
        {error && (
          <div className="px-4 py-2 border-b border-neutral-100 text-[13px] text-accent-500 italic">
            {error}
          </div>
        )}
        {loading ? (
          <p className="px-4 py-3 text-[13px] italic text-neutral-400">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-4 py-4 text-[13px] italic text-neutral-400">No restrictions set.</p>
        ) : (
          <ul>
            {items.map(r => {
              const who = r.familyMemberId
                ? (members.find(m => m.id === r.familyMemberId)?.name ?? 'someone')
                : 'Household'
              return (
                <li key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 last:border-b-0 text-[14px]">
                  <div>
                    <span className="font-medium text-neutral-700">{who}:</span>{' '}
                    <span className="text-neutral-800">{r.label}</span>
                  </div>
                  <button
                    onClick={() => remove(r.id)}
                    aria-label={`Remove restriction: ${r.label}`}
                    className="text-neutral-400 hover:text-accent-500 text-[16px]"
                  >×</button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="grid grid-cols-[140px_1fr_80px] items-center gap-2 px-4 py-3 border-t border-neutral-100 bg-primary-50/40">
          <select
            value={draftWho ?? ''}
            onChange={e => setDraftWho(e.target.value || null)}
            className="px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base text-[13px] focus:outline-none focus:border-primary-500"
          >
            <option value="">Household</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <input
            type="text"
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && draftLabel.trim()) {
                await add(draftWho, draftLabel)
                setDraftLabel('')
              }
            }}
            placeholder="e.g. no shellfish, no added sugar"
            className="px-2 py-1.5 rounded-md border border-neutral-200 bg-bg-base text-[14px] focus:outline-none focus:border-primary-500"
          />
          <button
            disabled={!draftLabel.trim()}
            onClick={async () => {
              if (!draftLabel.trim()) return
              await add(draftWho, draftLabel)
              setDraftLabel('')
            }}
            className="px-3 py-1.5 rounded-md bg-primary-500 text-white text-[12px] font-medium hover:bg-primary-600 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      <p className="mt-4 text-[12px] italic text-neutral-500">
        Restrictions are sent to the AI on every plan generation as hard filters.
      </p>
    </section>
  )
}
