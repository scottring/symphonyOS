// src/components/plan/SortPlanPanel.tsx
//
// "Choose Fall's goals": one reviewed step that turns the outcomes and
// projects on an imported, flat list into the period's goals (horizon flows
// correction, 2026-09-26). Pick → preview → confirm. Nothing is pre-chosen,
// nothing is copied or deleted, and a row that cannot convert says why.
// The rules live in lib/planning/sortPlan.ts; this only draws them.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Target } from 'lucide-react'
import type { Task } from '@/types/task'
import { DOMAINS } from '@/lib/domains'
import { sortPreview, type SortCandidate } from '@/lib/planning/sortPlan'

function meta(t: Task): string {
  const parts: string[] = []
  const area = DOMAINS.find((d) => d.id === t.context)?.label
  parts.push(area ?? 'No area — private to its owner')
  const people = t.assignedToAll?.length ?? 0
  if (people) parts.push(`${people} ${people === 1 ? 'person' : 'people'}`)
  if (t.notes?.trim()) parts.push('notes')
  if (t.links?.length) parts.push(`${t.links.length} link${t.links.length === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

export function SortPlanPanel({ periodLabel, candidates, onConfirm, onClose }: {
  /** "Fall 2026", "October". */
  periodLabel: string
  candidates: readonly SortCandidate[]
  /** Flip the chosen rows to goals; resolves with the ids that did NOT save. */
  onConfirm: (ids: string[]) => Promise<string[]>
  onClose: () => void
}) {
  const [step, setStep] = useState<'pick' | 'preview'>('pick')
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string[]>([])
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Each step starts where a keyboard or screen-reader user would look: its heading.
  useEffect(() => { headingRef.current?.focus() }, [step])

  const eligible = useMemo(() => candidates.filter((c) => !c.blocked), [candidates])
  const blocked = useMemo(() => candidates.filter((c) => c.blocked), [candidates])
  const preview = useMemo(() => sortPreview(candidates, chosen), [candidates, chosen])
  const toggle = (id: string) => setChosen((prev) => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const n = preview.goals.length

  return (
    <section aria-label={`Choose ${periodLabel}'s goals`} className="sort-plan-panel mt-3 rounded-xl border border-primary-100 bg-white p-4"
      onKeyDown={(e) => { if (e.key === 'Escape' && !saving) { e.stopPropagation(); onClose() } }}>
      {step === 'pick' ? (
        <>
          <h3 ref={headingRef} tabIndex={-1} className="font-display text-lg text-neutral-800 focus:outline-none">
            Which of these are outcomes or projects?
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-neutral-500">
            Tick the ones that are bigger than a single action — they become {periodLabel}’s goals, and you can then add month goals and next actions under them. Leave the single actions unticked. You’ll see a preview before anything changes.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <button type="button" onClick={() => setChosen(new Set(eligible.map((c) => c.task.id)))}
              className="font-medium text-primary-700 hover:underline">Tick all {eligible.length}</button>
            {chosen.size > 0 && (
              <button type="button" onClick={() => setChosen(new Set())} className="text-neutral-500 hover:underline">Clear</button>
            )}
            <span className="text-neutral-400" aria-live="polite">{n} ticked</span>
          </div>
          <ul className="mt-2 divide-y divide-neutral-100">
            {eligible.map(({ task }) => (
              <li key={task.id}>
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2">
                  <input type="checkbox" checked={chosen.has(task.id)} onChange={() => toggle(task.id)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-primary-600,#2f5d46)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-[15px] text-neutral-800">{task.title}</span>
                    <span className="block text-[12px] text-neutral-500">{meta(task)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {blocked.length > 0 && (
            <details className="mt-2 text-[13px]">
              <summary className="cursor-pointer text-neutral-500">{blocked.length} can’t become goals here — why</summary>
              <ul className="mt-1 space-y-1.5 pl-1">
                {blocked.map(({ task, blocked: reason }) => (
                  <li key={task.id}><span className="text-neutral-700">{task.title}</span><span className="block text-[12px] text-neutral-500">{reason}</span></li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={n === 0} onClick={() => setStep('preview')}
              className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
              Preview {n > 0 ? `${n} goal${n === 1 ? '' : 's'}` : ''}
            </button>
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">Not now</button>
          </div>
        </>
      ) : (
        <>
          <h3 ref={headingRef} tabIndex={-1} className="font-display text-lg text-neutral-800 focus:outline-none">
            {n} {n === 1 ? 'item becomes a goal' : 'items become goals'} for {periodLabel}
          </h3>
          <ul aria-label="Becoming goals" className="mt-2 space-y-1">
            {preview.goals.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[15px] text-neutral-800">
                <Target className="mt-1 h-3.5 w-3.5 shrink-0 text-accent-600" aria-hidden="true" />{t.title}
              </li>
            ))}
          </ul>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] leading-snug text-neutral-600">
            <li>The same items, not copies: their notes, links, people, area and history stay exactly as they are.</li>
            <li>Nothing is scheduled or unscheduled. Goals stay on {periodLabel}; their next actions are what go into weeks.</li>
            {preview.untagged.length > 0 && (
              <li>{preview.untagged.length} {preview.untagged.length === 1 ? 'has' : 'have'} no area, so {preview.untagged.length === 1 ? 'it stays' : 'they stay'} private to {preview.untagged.length === 1 ? 'its' : 'their'} owner, as now.</li>
            )}
            <li>{preview.staying.length} {preview.staying.length === 1 ? 'stays a single action' : 'stay single actions'}.</li>
            <li>You can undo this afterwards, from this page.</li>
          </ul>
          {failed.length > 0 && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {failed.length} didn’t save — nothing else about {failed.length === 1 ? 'it' : 'them'} changed. Try again.
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled={saving}
              onClick={async () => {
                setSaving(true)
                const miss = await onConfirm(preview.goals.filter((t) => failed.length === 0 || failed.includes(t.id)).map((t) => t.id))
                setSaving(false)
                setFailed(miss)
              }}
              className="rounded-md bg-primary-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? 'Saving…' : failed.length ? `Try the ${failed.length} again` : `Make ${n} goal${n === 1 ? '' : 's'}`}
            </button>
            <button type="button" disabled={saving} onClick={() => setStep('pick')} className="rounded-md px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">← Change the selection</button>
          </div>
        </>
      )}
    </section>
  )
}
