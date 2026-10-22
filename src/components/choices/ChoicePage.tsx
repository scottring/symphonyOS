import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHOICES_UPDATED, useChoice } from '@/hooks/useChoices'
import { useAuth } from '@/hooks/useAuth'
import { useContacts } from '@/hooks/useContacts'
import { supabase } from '@/lib/supabase'
import * as db from '@/lib/choices/db'
import type { ChoiceDetail } from '@/lib/choices/db'
import { choiceSummary } from '@/lib/choices/facts'
import { workLabel } from '@/lib/choices/price'
import { sortOptions, type SortKey } from '@/lib/choices/sort'
import type { ChoiceOption, CellValue } from '@/types/choice'
import { WorkBar } from './WorkBar'
import { ComparisonTable, type ComparisonProps } from './ComparisonTable'
import { OptionCards } from './OptionCards'
import { optionLines, priceCellFor } from './cells'
import { useChoiceEditing, type ChoicePageWriters } from './useChoiceEditing'
import { OptionActions } from './OptionRow'
import { CellEditor } from './CellEditor'
import { PriceLinesEditor } from './PriceLinesEditor'
import { ColumnAdd, ColumnMenu } from './ColumnAdd'
import { WorkEditor } from './WorkEditor'
import { ChooseDialog, DecidedBanner } from './ChooseDialog'
import { AddOptionInput } from './AddOptionInput'
import { FilesCell, FilesDialog } from './OptionFiles'
import { useOptionFiles, type OptionFilesApi } from './useOptionFiles'
import { linkButton } from './DialogFrame'

export type { ChoicePageWriters } from './useChoiceEditing'

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

type Open =
  | { kind: 'price'; optionId: string }
  | { kind: 'choose'; optionId: string }
  | { kind: 'files'; optionId: string }
  | { kind: 'work' }
  | null

export function ChoicePageView({ detail, writers, files }: {
  detail: ChoiceDetail
  writers: ChoicePageWriters
  /** Option attachments; left out where they aren't loaded (tests). */
  files?: OptionFilesApi
}) {
  const { choice, options, lines, followUps, contacts } = detail
  const navigate = useNavigate()
  const edit = useChoiceEditing(detail, writers)
  const narrow = useNarrow()
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [showRuledOut, setShowRuledOut] = useState(false)
  const [open, setOpen] = useState<Open>(null)
  const now = useMemo(() => new Date(), [])
  const decided = choice.status === 'decided'

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
  const optionOf = (id: string) => options.find((o) => o.id === id)

  const back = () => { if (window.history.length > 1) navigate(-1); else navigate('/today') }
  const close = () => setOpen(null)

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
    renderFiles: files && ((o) => {
      const list = files.filesOf(o.id)
      return list.length > 0 ? <FilesCell files={list} onOpen={files.open} /> : null
    }),
  }
  const editing: Partial<ComparisonProps> = decided ? {} : {
    renderActions: (o) => (
      <OptionActions
        option={o}
        onChoose={(x) => setOpen({ kind: 'choose', optionId: x.id })}
        onStatus={edit.setStatus}
        onFollowUp={edit.followUp}
        onDelete={edit.deleteOption}
        onRename={edit.rename}
        onNotes={edit.setNotes}
        onFiles={files && ((x) => setOpen({ kind: 'files', optionId: x.id }))}
      />
    ),
    addColumnSlot: <ColumnAdd onAdd={edit.addColumn} />,
    renderColumnMenu: (c) => (
      <ColumnMenu column={c} onRename={(l) => edit.renameColumn(c, l)} onRemove={() => void edit.removeColumn(c)} />
    ),
    renderCell: (o, c) => (
      <CellEditor column={c} value={edit.valuesOf(o)[c.id] as CellValue | undefined} optionName={o.name}
        onSave={(v) => edit.setValue(o, c.id, v)} />
    ),
    onEditPrice: (o) => setOpen({ kind: 'price', optionId: o.id }),
  }
  const props = { ...common, ...editing }
  const chosen = choice.chosenOptionId ? optionOf(choice.chosenOptionId) : undefined
  const editWork = !decided && (
    <button type="button" onClick={() => setOpen({ kind: 'work' })} className={linkButton}>
      {choice.work.length > 0 ? 'Edit the work' : '+ The work'}
    </button>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
      <button type="button" onClick={back} className="mb-3 text-[13px] text-primary-600 hover:text-primary-700">
        ‹ {detail.goalTitle}
      </button>
      <h1 className="font-display text-[28px] font-semibold leading-tight text-neutral-900">{choice.title}</h1>
      <p className="mb-5 mt-1 text-sm text-neutral-500">{choiceSummary(options, followUps, now)}</p>
      {decided && (
        <DecidedBanner name={chosen?.name ?? 'an option'} note={choice.decidedNote} decidedAt={choice.decidedAt}
          onReopen={() => void edit.reopen()} />
      )}
      <WorkBar work={choice.work} selected={selected} onToggle={(id) => void edit.toggleWork(id)} action={editWork} disabled={decided} />
      {choice.work.length === 0 && editWork && <div className="mb-3">{editWork}</div>}
      {narrow ? <OptionCards {...props} /> : <ComparisonTable {...props} />}
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
      {!decided && narrow && <div className="mt-3"><ColumnAdd onAdd={edit.addColumn} /></div>}
      {!decided && <AddOptionInput onAdd={edit.addOption} />}
      <Dialogs open={open} close={close} detail={detail} edit={edit} files={files} optionOf={optionOf} />
    </div>
  )
}

function Dialogs({ open, close, detail, edit, files, optionOf }: {
  open: Open
  close: () => void
  detail: ChoiceDetail
  edit: ReturnType<typeof useChoiceEditing>
  files?: OptionFilesApi
  optionOf: (id: string) => ChoiceOption | undefined
}) {
  if (!open) return null
  if (open.kind === 'work') return <WorkEditor work={detail.choice.work} onSave={edit.saveWork} onClose={close} />
  const o = optionOf(open.optionId)
  if (!o) return null
  if (open.kind === 'choose') return <ChooseDialog name={o.name} onSave={(note) => edit.choose(o, note)} onClose={close} />
  if (open.kind === 'files') {
    return files ? <FilesDialog option={o} api={files} onUpload={(x, f) => edit.addFile(x, f, files)} onClose={close} /> : null
  }
  return (
    <PriceLinesEditor
      option={o}
      lines={optionLines(detail.lines, o)}
      work={detail.choice.work}
      onAdd={(input) => edit.addLine(o, input)}
      onUpdate={edit.updateLine}
      onDelete={edit.deleteLine}
      onClose={close}
    />
  )
}

/** Binds every writer to the client, the choice and the signed-in user;
 *  each announces the change so the page (and the goal's Choices) refetch. */
function useBoundWriters(choiceId: string): ChoicePageWriters {
  const { user } = useAuth()
  const contacts = useContacts()
  const latest = useRef({ user, contacts })
  useEffect(() => { latest.current = { user, contacts } })
  return useMemo<ChoicePageWriters>(() => {
    const announce = async <T,>(p: Promise<T>): Promise<T> => {
      const r = await p
      window.dispatchEvent(new Event(CHOICES_UPDATED))
      return r
    }
    const uid = () => latest.current.user?.id
    return {
      setSelectedWork: (ids) => announce(db.updateChoice(supabase, choiceId, { selected_work: ids })),
      updateChoice: (patch) => announce(db.updateChoice(supabase, choiceId, patch)),
      addOption: async (input) => {
        const me = uid()
        return me ? announce(db.addOption(supabase, me, choiceId, input)) : null
      },
      updateOption: (id, patch) => announce(db.updateOption(supabase, id, patch)),
      deleteOption: (id) => announce(db.deleteOption(supabase, id)),
      addPriceLine: async (optionId, input) => {
        const me = uid()
        return me ? announce(db.addPriceLine(supabase, me, optionId, input)) : null
      },
      updatePriceLine: (id, patch) => announce(db.updatePriceLine(supabase, id, patch)),
      deletePriceLine: (id) => announce(db.deletePriceLine(supabase, id)),
      createFollowUp: async (detail, option, on) => {
        const me = uid()
        return me ? announce(db.createFollowUp(supabase, me, detail, option, on)) : null
      },
      deleteTask: (id) => announce(db.deleteFollowUp(supabase, id)),
      chooseOption: (detail, optionId, note, now) => announce(db.chooseOption(supabase, detail, optionId, note, now)),
      reopenChoice: (detail) => announce(db.reopenChoice(supabase, detail)),
      // Contacts: their own hook, read through a ref so an Undo made later
      // sees the contact list that includes the one it added.
      addContact: (input) => latest.current.contacts.addContact(input),
      deleteContact: (id) => latest.current.contacts.deleteContact(id),
    }
  }, [choiceId])
}

export function ChoicePage({ id }: { id: string }) {
  const { detail, loading } = useChoice(id)
  const writers = useBoundWriters(id)
  const files = useOptionFiles(detail?.options.map((o) => o.id) ?? [])

  if (loading && !detail) return <div className="p-8 text-center text-neutral-500">Loading…</div>
  if (!detail) return <div className="p-8 text-center text-neutral-500">This choice isn't available</div>
  return <ChoicePageView detail={detail} writers={writers} files={files} />
}
