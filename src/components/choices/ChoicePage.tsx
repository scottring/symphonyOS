import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHOICES_UPDATED, useChoice, useGoalChoices } from '@/hooks/useChoices'
import { useAuth } from '@/hooks/useAuth'
import { useContacts } from '@/hooks/useContacts'
import { useLogWriters } from '@/hooks/useLogWriters'
import { useMemberName } from '@/hooks/useMemberName'
import { useGoalLog } from '@/hooks/useGoalLog'
import { supabase } from '@/lib/supabase'
import * as db from '@/lib/choices/db'
import { rowLine, type LogLine, type MergedLog } from '@/lib/choices/log'
import type { LogEntry } from '@/types/goalLog'
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
import { InlineEdit, OptionActions } from './OptionRow'
import { PopMenu } from './StatusMenu'
import { CellEditor } from './CellEditor'
import { PriceLinesEditor } from './PriceLinesEditor'
import { ColumnAdd, ColumnMenu } from './ColumnAdd'
import { WorkEditor } from './WorkEditor'
import { ChooseDialog, DecidedBanner } from './ChooseDialog'
import { AddOptionInput } from './AddOptionInput'
import { FilesCell, FilesDialog } from './OptionFiles'
import { useOptionFiles, type OptionFilesApi } from './useOptionFiles'
import { DialogFrame, linkButton, quietButton } from './DialogFrame'
import { LogDialog } from './LogDialog'
import { LogList } from './LogList'

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

/** The goal's log as the page shows it; ChoicePage reads it (useGoalLog). */
export interface PageLog {
  log: MergedLog
  entries: readonly LogEntry[]
  /** Option names across the goal's choices, for lines about another choice's option. */
  optionNames?: ReadonlyMap<string, string>
  /** A logger's first name. */
  memberName?: (userId: string) => string | undefined
}
const NO_LOG: PageLog = { log: { upcoming: [], passed: [], done: [] }, entries: [] }

const sameKey = (a: SortKey | null, b: SortKey) =>
  !!a && a.kind === b.kind && (a.kind !== 'column' || (b.kind === 'column' && a.columnId === b.columnId))

type Open =
  | { kind: 'price'; optionId: string }
  | { kind: 'choose'; optionId: string }
  | { kind: 'files'; optionId: string }
  | { kind: 'work' }
  | { kind: 'log'; optionId?: string }
  | { kind: 'editLog'; entryId: string }
  | { kind: 'history'; optionId: string }
  | null

export function ChoicePageView({ detail, writers, files, goalLog = NO_LOG }: {
  detail: ChoiceDetail
  writers: ChoicePageWriters
  /** Option attachments; left out where they aren't loaded (tests). */
  files?: OptionFilesApi
  goalLog?: PageLog
}) {
  const { choice, options, lines, followUps, contacts } = detail
  const navigate = useNavigate()
  const edit = useChoiceEditing(detail, writers, goalLog.entries)
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
  const { log } = goalLog
  const logged = (o: ChoiceOption) => [log.upcoming, log.passed, log.done].some((ls) => ls.some((l) => l.optionId === o.id))

  // A planned event is edited as a task: open it where tasks open (as the task panel's links do).
  const openTask = (taskId: string) => navigate(`/today?detail=task:${taskId}`)
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
    logLineOf: (o) => rowLine(log, o.id),
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
        nowrap={!narrow}
        onFiles={files && ((x) => setOpen({ kind: 'files', optionId: x.id }))}
        onLog={(x) => setOpen({ kind: 'log', optionId: x.id })}
        onHistory={logged(o) ? (x) => setOpen({ kind: 'history', optionId: x.id }) : undefined}
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
      <ChoiceHeading title={choice.title} onRename={edit.renameChoice}
        onDelete={async () => { const ok = await edit.deleteChoice(); if (ok) back(); return ok }} />
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
      <LogSection goalLog={goalLog} options={options} edit={edit} onOpen={setOpen} onOpenTask={openTask} />
      <Dialogs open={open} close={close} detail={detail} edit={edit} files={files} optionOf={optionOf} goalLog={goalLog} onOpen={setOpen} onOpenTask={openTask} />
    </div>
  )
}

/** The title, with ⋯ Rename and Delete (after an inline confirm). */
function ChoiceHeading({ title, onRename, onDelete }: {
  title: string
  onRename: (title: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const [mode, setMode] = useState<'rename' | 'delete' | null>(null)
  if (mode === 'rename') {
    return (
      <div className="max-w-md">
        <InlineEdit label="Choice name" initial={title} onCancel={() => setMode(null)}
          onSave={async (text) => {
            const next = text.trim()
            if (!next || next === title) { setMode(null); return }
            if (await onRename(next)) setMode(null)
          }} />
      </div>
    )
  }
  return (
    <div>
      <div className="flex items-start gap-3">
        <h1 className="min-w-0 flex-1 font-display text-[28px] font-semibold leading-tight text-neutral-900">{title}</h1>
        <PopMenu label="Choice actions" trigger="⋯" className="mt-1.5 px-1 text-lg leading-none text-neutral-500 hover:text-neutral-700" items={[
          { label: 'Rename', onPick: () => setMode('rename') },
          { label: 'Delete choice', danger: true, onPick: () => setMode('delete') },
        ]} />
      </div>
      {mode === 'delete' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-neutral-600">{`Delete ${title}? Its options, prices, values and their log go too. Can't be undone.`}</span>
          <button type="button" onClick={async () => { if (await onDelete()) setMode(null) }}
            className="rounded-lg bg-red-500 px-3 py-1 text-[13px] font-medium text-white hover:bg-red-600">Delete</button>
          <button type="button" onClick={() => setMode(null)}
            className="px-2 py-1 text-[13px] font-medium text-neutral-500 hover:text-neutral-700">Cancel</button>
        </div>
      )}
    </div>
  )
}

/** Option names for log lines: this choice's as they are now, over the goal's. */
function namesOf(goalLog: PageLog, options: readonly ChoiceOption[]): Map<string, string> {
  const names = new Map(goalLog.optionNames ?? [])
  for (const o of options) names.set(o.id, o.name)
  return names
}
const noName = () => undefined

/** The goal's whole log under the comparison: latest 10 done, with "+ Log". */
function LogSection({ goalLog, options, edit, onOpen, onOpenTask }: {
  goalLog: PageLog
  options: readonly ChoiceOption[]
  edit: ReturnType<typeof useChoiceEditing>
  onOpen: (open: Open) => void
  onOpenTask: (taskId: string) => void
}) {
  const id = useId()
  const entryOf = (entryId: string) => goalLog.entries.find((e) => e.id === entryId)
  return (
    <section aria-labelledby={id} className="mt-8">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 id={id} className="font-display text-xl font-semibold text-neutral-900">Log</h2>
        <button type="button" onClick={() => onOpen({ kind: 'log' })} className={linkButton}>+ Log</button>
      </div>
      <LogList log={goalLog.log} optionNames={namesOf(goalLog, options)} memberName={goalLog.memberName ?? noName} limit={10}
        onEdit={(entryId) => onOpen({ kind: 'editLog', entryId })}
        onDelete={async (entryId) => { const e = entryOf(entryId); return e ? edit.deleteLogEntry(e) : false }}
        onOpenTask={onOpenTask} />
    </section>
  )
}

function Dialogs({ open, close, detail, edit, files, optionOf, goalLog, onOpen, onOpenTask }: {
  open: Open
  close: () => void
  detail: ChoiceDetail
  edit: ReturnType<typeof useChoiceEditing>
  files?: OptionFilesApi
  optionOf: (id: string) => ChoiceOption | undefined
  goalLog: PageLog
  onOpen: (open: Open) => void
  onOpenTask: (taskId: string) => void
}) {
  if (!open) return null
  // Today as of now, not as of when the page opened: saving decides entry or plan the same way.
  const now = new Date()
  if (open.kind === 'work') return <WorkEditor work={detail.choice.work} onSave={edit.saveWork} onClose={close} />
  const choices = [...detail.options].sort((a, b) => a.sortOrder - b.sortOrder).map((o) => ({ id: o.id, name: o.name }))
  const titleFor = (optionId?: string) => {
    // An entry can be about another choice's option on the same goal.
    const name = optionId && namesOf(goalLog, detail.options).get(optionId)
    return name ? `Log for ${name}` : 'Log'
  }
  if (open.kind === 'log') {
    return <LogDialog title={titleFor(open.optionId)} options={choices} about={open.optionId} now={now} onSave={edit.logEvent} onCancel={close} />
  }
  if (open.kind === 'editLog') {
    const e = goalLog.entries.find((x) => x.id === open.entryId)
    if (!e) return null
    return (
      <LogDialog title={titleFor(e.optionId)} options={choices} initial={e} now={now} onCancel={close}
        onSave={(input) => edit.editLogEntry(e, { kind: input.kind, on: input.on, time: input.time ?? null, summary: input.summary })} />
    )
  }
  const o = optionOf(open.optionId)
  if (!o) return null
  if (open.kind === 'history') {
    const only = (lines: LogLine[]) => lines.filter((l) => l.optionId === o.id)
    const entryOf = (entryId: string) => goalLog.entries.find((e) => e.id === entryId)
    return (
      <DialogFrame title={`History · ${o.name}`} onClose={close}>
        <LogList log={{ upcoming: only(goalLog.log.upcoming), passed: only(goalLog.log.passed), done: only(goalLog.log.done) }}
          optionNames={namesOf(goalLog, detail.options)} memberName={goalLog.memberName ?? noName}
          onEdit={(entryId) => onOpen({ kind: 'editLog', entryId })}
          onDelete={async (entryId) => { const e = entryOf(entryId); return e ? edit.deleteLogEntry(e) : false }}
          onOpenTask={onOpenTask} />
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={close} className={quietButton}>Done</button>
        </div>
      </DialogFrame>
    )
  }
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
  const { addLogEntry, updateLogEntry, deleteLogEntry, planEvent } = useLogWriters()
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
      readChoice: () => db.readChoiceLists(supabase, choiceId),
      readOptionValues: (id) => db.readOptionValues(supabase, id),
      setSelectedWork: (ids) => announce(db.updateChoice(supabase, choiceId, { selected_work: ids })),
      updateChoice: (patch) => announce(db.updateChoice(supabase, choiceId, patch)),
      deleteChoice: () => announce(db.deleteChoice(supabase, choiceId)),
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
      addLogEntry, updateLogEntry, deleteLogEntry, planEvent,
    }
  }, [choiceId, addLogEntry, updateLogEntry, deleteLogEntry, planEvent])
}

/** The goal's log for the page, with names for its options and loggers. */
function usePageLog(detail: ChoiceDetail | null): PageLog {
  const goal = detail?.choice.goal ?? null
  const { log, entries } = useGoalLog(goal)
  // The log covers every choice on the goal, so lines can be about another choice's option.
  const { rows } = useGoalChoices(goal)
  const memberName = useMemberName()
  const optionNames = useMemo(() => new Map(rows.flatMap((r) => r.options.map((o) => [o.id, o.name] as const))), [rows])
  return useMemo(() => ({ log, entries, optionNames, memberName }), [log, entries, optionNames, memberName])
}

export function ChoicePage({ id }: { id: string }) {
  const { detail, loading } = useChoice(id)
  const writers = useBoundWriters(id)
  const files = useOptionFiles(detail?.options.map((o) => o.id) ?? [])
  const goalLog = usePageLog(detail)

  if (loading && !detail) return <div className="p-8 text-center text-neutral-500">Loading…</div>
  if (!detail) return <div className="p-8 text-center text-neutral-500">This choice isn't available</div>
  return <ChoicePageView detail={detail} writers={writers} files={files} goalLog={goalLog} />
}
