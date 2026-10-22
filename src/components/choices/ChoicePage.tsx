import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHOICES_UPDATED, useChoice } from '@/hooks/useChoices'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { supabase } from '@/lib/supabase'
import { updateChoice, type ChoiceDetail } from '@/lib/choices/db'
import { choiceSummary } from '@/lib/choices/facts'
import { workLabel } from '@/lib/choices/price'
import { sortOptions, type SortKey } from '@/lib/choices/sort'
import type { ChoiceOption } from '@/types/choice'
import { WorkBar } from './WorkBar'
import { ComparisonTable, type ComparisonProps } from './ComparisonTable'
import { OptionCards } from './OptionCards'
import { optionLines, priceCellFor } from './cells'

/** The writers this page calls, already bound to the client. */
export interface ChoicePageWriters {
  setSelectedWork: (ids: string[]) => Promise<boolean>
}

const NARROW = '(max-width: 859px)'

function useNarrow(): boolean {
  const query = () => typeof window !== 'undefined' && !!window.matchMedia?.(NARROW).matches
  const [narrow, setNarrow] = useState(query)
  useEffect(() => {
    const mq = window.matchMedia?.(NARROW)
    if (!mq) return
    const on = () => setNarrow(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

const sameKey = (a: SortKey | null, b: SortKey) =>
  !!a && a.kind === b.kind && (a.kind !== 'column' || (b.kind === 'column' && a.columnId === b.columnId))

export function ChoicePageView({ detail, writers }: { detail: ChoiceDetail; writers: ChoicePageWriters }) {
  const { choice, options, lines, followUps, contacts } = detail
  const navigate = useNavigate()
  const { run } = useCanvasActivity()
  const narrow = useNarrow()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [showRuledOut, setShowRuledOut] = useState(false)
  const now = useMemo(() => new Date(), [])

  const selected = choice.selectedWork
  const priceCellOf = (o: ChoiceOption) => priceCellFor(optionLines(lines, o), selected, choice.work)
  const priceOf = (o: ChoiceOption) => {
    const cell = priceCellOf(o)
    return cell.kind === 'total' ? cell.totalCents : null
  }

  const live = options.filter((o) => o.status !== 'ruled_out')
  const ruledOut = [...options.filter((o) => o.status === 'ruled_out')].sort((a, b) => a.sortOrder - b.sortOrder)
  const sorted = sortOptions(live, sortKey, priceOf)
  const shown = showRuledOut ? [...sorted, ...ruledOut] : sorted

  const toggle = (id: string) => {
    const next = choice.work.filter((w) => w.id === id ? !selected.includes(id) : selected.includes(w.id)).map((w) => w.id)
    const prev = [...selected]
    void run('Change the work', () => writers.setSelectedWork(next), { undo: () => writers.setSelectedWork(prev) })
  }
  const back = () => { if (window.history.length > 1) navigate(-1); else navigate('/today') }

  const label = workLabel(selected, choice.work)
  const common: ComparisonProps = {
    options: shown,
    columns: choice.columns,
    priceHeading: label ? `Price · ${label}` : 'Price',
    priceCellOf,
    contacts,
    followUpOf: (o) => followUps.find((f) => f.optionId === o.id && !f.completed),
    now,
    sortKey,
    onSort: (k) => setSortKey((cur) => (sameKey(cur, k) ? null : k)),
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
      <button type="button" onClick={back} className="mb-3 text-[13px] text-primary-600 hover:text-primary-700">
        ‹ {detail.goalTitle}
      </button>
      <h1 className="font-display text-[28px] font-semibold leading-tight text-neutral-900">{choice.title}</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-500">{choiceSummary(options, followUps, now)}</p>
      <WorkBar work={choice.work} selected={selected} onToggle={toggle} />
      {narrow ? <OptionCards {...common} /> : <ComparisonTable {...common} />}
      {ruledOut.length > 0 && (
        <button
          type="button"
          onClick={() => setShowRuledOut((v) => !v)}
          aria-expanded={showRuledOut}
          className="mt-3 text-[13px] text-neutral-500 hover:text-neutral-700"
        >
          {`+${ruledOut.length} ruled out · ${ruledOut.map((o) => o.name).join(', ')}`}
        </button>
      )}
    </div>
  )
}

export function ChoicePage({ id }: { id: string }) {
  const { detail, loading } = useChoice(id)
  const writers = useMemo<ChoicePageWriters>(() => ({
    setSelectedWork: async (ids) => {
      const ok = await updateChoice(supabase, id, { selected_work: ids })
      window.dispatchEvent(new Event(CHOICES_UPDATED))
      return ok
    },
  }), [id])

  if (loading && !detail) return <div className="p-8 text-center text-neutral-500">Loading…</div>
  if (!detail) return <div className="p-8 text-center text-neutral-500">This choice isn't available</div>
  return <ChoicePageView detail={detail} writers={writers} />
}
