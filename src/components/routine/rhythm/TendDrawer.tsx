import { useState } from 'react'
import { X } from 'lucide-react'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { RhythmCard } from './rhythmModel'
import type { TendFinding } from './tendHeuristics'
import { formatRange } from './format'
import { TendCard } from './TendCard'
import { SeasonalShelf } from './SeasonalShelf'

/** Dismissal key for a name-this-group suggestion (order-independent). */
export function groupSuggestionKey(card: RhythmCard): string {
  return `g:${card.routines.map(r => r.id).sort().join('.')}`
}

export interface TendDrawerProps {
  open: boolean
  onClose: () => void
  /** Arc cards with kind 'cluster', already filtered of dismissed keys. */
  clusters: RhythmCard[]
  findings: TendFinding[]
  routines: Routine[]
  /** Standalone active top-level routines (no steps, not a collection). */
  looseItems: Routine[]
  /** model.seasonal — resting routines. */
  sleepers: Routine[]
  foldTargets: { id: string; name: string }[]
  familyMembers: FamilyMember[]
  onNameGroup: (card: RhythmCard, name: string) => void
  onFoldInto: (targetId: string, routineIds: string[]) => void
  onDismiss: (key: string) => void
  onMerge: (survivorId: string, loserIds: string[]) => void
  onStampDomain: (id: string, context: 'work' | 'family' | 'personal') => void
  onRename: (id: string, name: string) => void
  onLetGo: (id: string) => void
  onWakeAll: () => void
  onOpenRoutine: (r: Routine) => void
}

function GroupRow({ card, foldTargets, onNameGroup, onFoldInto, onDismiss }: {
  card: RhythmCard
  foldTargets: { id: string; name: string }[]
  onNameGroup: TendDrawerProps['onNameGroup']
  onFoldInto: TendDrawerProps['onFoldInto']
  onDismiss: TendDrawerProps['onDismiss']
}) {
  const [name, setName] = useState('')
  const memberIds = card.routines.map(r => r.id)
  const targets = foldTargets.filter(t => !memberIds.includes(t.id))
  const typed = name.trim().toLowerCase()
  const suggestions = targets.filter(t => !typed || t.name.toLowerCase().includes(typed)).slice(0, 4)

  const submit = () => {
    if (!name.trim()) return
    const exact = targets.find(t => t.name.toLowerCase() === typed)
    if (exact) onFoldInto(exact.id, memberIds)
    else onNameGroup(card, name.trim())
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-neutral-700">
          These travel together ({formatRange(card.startTime, card.endTime)}):{' '}
          <span className="text-neutral-500">{card.routines.map(r => r.name).join(', ')}</span>
        </p>
        <button
          onClick={() => onDismiss(groupSuggestionKey(card))}
          aria-label={`Dismiss ${card.suggestedName ?? 'group'} suggestion`}
          className="flex-shrink-0 rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-500 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
        placeholder="Name this rhythm"
        className="mt-2 w-full rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm focus:outline-none
                   focus:ring-2 focus:ring-amber-400"
      />
      {suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-neutral-400">or add these into</span>
          {suggestions.map(t => (
            <button
              key={t.id}
              onClick={() => onFoldInto(t.id, memberIds)}
              className="text-left text-xs rounded-lg bg-emerald-50 px-2 py-1 text-emerald-900
                         hover:bg-emerald-100 transition-colors"
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function scheduleSummary(r: Routine): string {
  const p = r.recurrence_pattern
  const time = r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ''
  if (p.type === 'weekly' && p.days?.length) return `Weekly · ${p.days.join(', ')}${time}`
  if (p.type === 'daily') return `Daily${time}`
  return `${p.type}${time}`
}

function LooseRow({ r, foldTargets, onFoldInto, onOpenRoutine }: {
  r: Routine
  foldTargets: { id: string; name: string }[]
  onFoldInto: TendDrawerProps['onFoldInto']
  onOpenRoutine: TendDrawerProps['onOpenRoutine']
}) {
  const targets = foldTargets.filter(t => t.id !== r.id)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-white border border-neutral-200 px-2.5 py-2">
      <button onClick={() => onOpenRoutine(r)} className="flex-1 min-w-0 text-left">
        <span className="block text-sm text-neutral-700 truncate">{r.name}</span>
        <span className="block text-[10px] text-neutral-400">{scheduleSummary(r)}</span>
      </button>
      {targets.length > 0 && (
        <select
          value=""
          aria-label={`Move ${r.name} into`}
          onChange={e => { if (e.target.value) onFoldInto(e.target.value, [r.id]) }}
          className="max-w-[45%] rounded-lg border border-neutral-200 bg-white px-1.5 py-1 text-xs text-neutral-600"
        >
          <option value="">Move into…</option>
          {targets.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

export function TendDrawer(props: TendDrawerProps) {
  const { open, onClose, clusters, findings, routines, looseItems, sleepers, foldTargets } = props
  if (!open) return null

  const empty = clusters.length === 0 && findings.length === 0 && looseItems.length === 0 && sleepers.length === 0

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--color-bg-base)] p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-neutral-800">Tend</h2>
          <button onClick={onClose} aria-label="Close tend drawer"
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {empty && (
          <p className="py-10 text-center text-sm text-neutral-400">Nothing to tend — the rhythm is clean.</p>
        )}

        {clusters.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">Name your rhythms</h3>
            <div className="flex flex-col gap-2">
              {clusters.map(c => (
                <GroupRow key={c.id} card={c} foldTargets={foldTargets}
                  onNameGroup={props.onNameGroup} onFoldInto={props.onFoldInto} onDismiss={props.onDismiss} />
              ))}
            </div>
          </section>
        )}

        {findings.length > 0 && (
          <TendCard
            findings={findings}
            routines={routines}
            onMerge={props.onMerge}
            onStampDomain={props.onStampDomain}
            onRename={props.onRename}
            onLetGo={props.onLetGo}
            onDismiss={props.onDismiss}
          />
        )}

        {looseItems.length > 0 && (
          <section className="mb-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">On their own</h3>
            <div className="flex flex-col gap-1.5">
              {looseItems.map(r => (
                <LooseRow key={r.id} r={r} foldTargets={foldTargets}
                  onFoldInto={props.onFoldInto} onOpenRoutine={props.onOpenRoutine} />
              ))}
            </div>
          </section>
        )}

        {sleepers.length > 0 && (
          <SeasonalShelf routines={sleepers} onWakeAll={props.onWakeAll} onOpenRoutine={props.onOpenRoutine} />
        )}
      </div>
    </div>
  )
}
