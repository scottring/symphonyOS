import { useRef } from 'react'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import type { ChoiceDetail, ChoiceLists } from '@/lib/choices/db'
import {
  applyWorkDiff, renamedColumn, restoredColumn, revertWorkDiff, withColumn, withSelected, withValue, withoutColumn, workDiff,
} from '@/lib/choices/edits'
import type {
  CellValue, ChoiceColumn, ChoiceOption, ColumnKind, DbChoice, DbChoiceOption, DbPriceLine, GoalRef,
  OptionStatus, PriceLine, WorkPiece,
} from '@/types/choice'
import type { LineInput } from './PriceLinesEditor'
import type { OptionFilesApi } from './useOptionFiles'
import type { Attachment } from '@/types/attachment'
import type { TaskContext } from '@/types/task'
import type { LogEntry, LogKind } from '@/types/goalLog'
import { deleteEntryCommand, editEntryCommand, logEventCommand, type EntryPatch, type LogInput } from '@/lib/choices/logSave'
import { useLatest } from './useLatest'

type ChoicePatch = Partial<Pick<DbChoice, 'title' | 'columns' | 'work' | 'selected_work'>>
type OptionPatch = Partial<Pick<DbChoiceOption, 'name' | 'contact_id' | 'status' | 'values' | 'notes'>>
type LinePatch = Partial<Pick<DbPriceLine, 'work_ids' | 'amount_cents' | 'note'>>
export type { LogInput } from '@/lib/choices/logSave'

/** The writers this page calls, already bound to the client and the user.
 *  Each mirrors its db.ts writer without (db, userId), and announces the change. */
export interface ChoicePageWriters {
  /** The choice's columns, work and selection as they are now (null: the read failed). */
  readChoice: () => Promise<ChoiceLists | null>
  /** One option's values as they are now (null: the read failed). */
  readOptionValues: (id: string) => Promise<Record<string, CellValue> | null>
  setSelectedWork: (ids: string[]) => Promise<boolean>
  updateChoice: (patch: ChoicePatch) => Promise<boolean>
  /** Deletes the choice, its options and their price lines. */
  deleteChoice: () => Promise<boolean>
  addOption: (input: { name: string; contactId?: string; status?: OptionStatus }) => Promise<ChoiceOption | null>
  updateOption: (id: string, patch: OptionPatch) => Promise<boolean>
  deleteOption: (id: string) => Promise<boolean>
  addPriceLine: (optionId: string, input: LineInput) => Promise<PriceLine | null>
  updatePriceLine: (id: string, patch: LinePatch) => Promise<boolean>
  deletePriceLine: (id: string) => Promise<boolean>
  createFollowUp: (detail: ChoiceDetail, option: ChoiceOption, on: Date) => Promise<string | null>
  deleteTask: (id: string) => Promise<boolean>
  chooseOption: (detail: ChoiceDetail, optionId: string, note: string | null, now: Date) => Promise<boolean>
  reopenChoice: (detail: ChoiceDetail) => Promise<boolean>
  addContact: (input: { name: string; phone: string; context?: TaskContext }) => Promise<{ id: string } | null>
  deleteContact: (id: string) => Promise<boolean>
  addLogEntry: (input: { goal: GoalRef; optionId?: string; kind: LogKind; on: string; time?: string; summary: string }) => Promise<LogEntry | null>
  updateLogEntry: (id: string, patch: EntryPatch) => Promise<boolean>
  deleteLogEntry: (id: string) => Promise<boolean>
  /** A future event, as a task that is a step of the goal; its id. */
  planEvent: (input: {
    goal: GoalRef; goalContext: TaskContext | null; goalScope: string
    optionId?: string; optionName?: string; contactId?: string
    kind: LogKind; on: string; time?: string; summary: string
  }) => Promise<string | null>
}

const all = async (steps: Promise<boolean>[]) => (await Promise.all(steps)).every(Boolean)

/** Runs writes to one row one at a time, in the order asked, so each one's
 *  fresh read sees the one before it. */
function useSerial() {
  const tails = useRef(new Map<string, Promise<unknown>>())
  return <T,>(key: string, step: () => Promise<T>): Promise<T> => {
    const next = (tails.current.get(key) ?? Promise.resolve()).then(step, step)
    tails.current.set(key, next.catch(() => {}))
    return next
  }
}

/** Every edit on the comparison page, each run as one command with an Undo
 *  built from the values captured before the write. */
export function useChoiceEditing(detail: ChoiceDetail, w: ChoicePageWriters) {
  const { run } = useCanvasActivity()
  const { choice } = detail
  // The selection the last toggle asked for, so quick taps build on each
  // other instead of on a render that hasn't refetched yet.
  const selection = useRef({ from: choice.selectedWork, ids: choice.selectedWork })
  // Each option's values as the last edit left them (quick edits on one row
  // build on each other).
  const values = useLatest<Record<string, CellValue>>()
  const serial = useSerial()

  // Whole-JSON writes: re-read the row, apply this one change to what is
  // there now, write that. null from a change = it no longer applies (the
  // write is refused, nothing written).
  const onChoice = (change: (fresh: ChoiceLists) => ChoicePatch | null) => serial('choice', async () => {
    const fresh = await w.readChoice()
    const patch = fresh && change(fresh)
    return patch ? w.updateChoice(patch) : false
  })
  const onSelection = (id: string, on: boolean) => serial('choice', async () => {
    const fresh = await w.readChoice()
    return fresh ? w.setSelectedWork(withSelected(fresh.work, fresh.selectedWork, id, on)) : false
  })
  const onValues = (optionId: string, key: string, value: CellValue | undefined) => serial(`option:${optionId}`, async () => {
    const fresh = await w.readOptionValues(optionId)
    return fresh ? w.updateOption(optionId, { values: withValue(fresh, key, value) }) : false
  })
  const columnEdit = (label: string, change: (cols: ChoiceColumn[]) => ChoiceColumn[] | null, undo: (cols: ChoiceColumn[]) => ChoiceColumn[] | null) => {
    const patch = (f: (cols: ChoiceColumn[]) => ChoiceColumn[] | null) => (fresh: ChoiceLists) => {
      const columns = f(fresh.columns)
      return columns ? { columns } : null
    }
    return run(label, () => onChoice(patch(change)), { undo: () => onChoice(patch(undo)) })
  }

  return {
    toggleWork: (id: string) => {
      const s = selection.current
      const prev = s.from === choice.selectedWork ? s.ids : choice.selectedWork
      const on = !prev.includes(id)
      selection.current = { from: choice.selectedWork, ids: withSelected(choice.work, prev, id, on) }
      // Only this piece's tick changes; a partner's other ticks stay.
      return run('Change the work', () => onSelection(id, on), { undo: () => onSelection(id, !on) })
    },

    addOption: (name: string, phone?: string) => {
      const made: { optionId?: string; contactId?: string } = {}
      return run('Add option', async () => {
        if (phone) {
          const c = await w.addContact(detail.goalContext ? { name, phone, context: detail.goalContext } : { name, phone })
          if (!c) return false
          made.contactId = c.id
        }
        const o = await w.addOption(made.contactId ? { name, contactId: made.contactId } : { name })
        if (!o) {
          if (made.contactId) await w.deleteContact(made.contactId)
          return false
        }
        made.optionId = o.id
        return true
      }, {
        undo: async () => {
          if (made.optionId && !(await w.deleteOption(made.optionId))) return false
          return made.contactId ? w.deleteContact(made.contactId) : true
        },
      })
    },

    setStatus: (o: ChoiceOption, status: OptionStatus) => {
      const prev = o.status
      return run('Set status', () => w.updateOption(o.id, { status }), { undo: () => w.updateOption(o.id, { status: prev }) })
    },

    followUp: (o: ChoiceOption, on: Date) => {
      let taskId: string | null = null
      return run('Follow up', async () => {
        taskId = await w.createFollowUp(detail, o, on)
        return !!taskId
      }, { undo: async () => (taskId ? w.deleteTask(taskId) : false) })
    },

    /** The option's values including edits still being written. */
    valuesOf: (o: ChoiceOption) => values.get(o.id, o.values),

    /** Sets one value; an updater reads the latest value (yes/no taps). */
    setValue: (o: ChoiceOption, columnId: string, value: CellValue | ((prev: CellValue | undefined) => CellValue)) => {
      const prev = values.get(o.id, o.values)
      const v = typeof value === 'function' ? value(prev[columnId]) : value
      const was = prev[columnId]
      // Shown at once; saved as this one value onto the option as it is now.
      const put = (to: CellValue | undefined) =>
        values.write(o.id, o.values, withValue(values.get(o.id, o.values), columnId, to), () => onValues(o.id, columnId, to))
      return run('Change a value', () => put(v), { undo: () => put(was) })
    },

    rename: (o: ChoiceOption, name: string) => {
      const prev = o.name
      return run('Rename option', () => w.updateOption(o.id, { name }), { undo: () => w.updateOption(o.id, { name: prev }) })
    },

    setNotes: (o: ChoiceOption, notes: string | null) => {
      const prev = o.notes ?? null
      return run('Change notes', () => w.updateOption(o.id, { notes }), { undo: () => w.updateOption(o.id, { notes: prev }) })
    },

    addLine: (o: ChoiceOption, input: LineInput) => {
      let id: string | null = null
      return run('Add price line', async () => {
        const l = await w.addPriceLine(o.id, input)
        id = l?.id ?? null
        return !!l
      }, { undo: async () => (id ? w.deletePriceLine(id) : false) })
    },

    updateLine: (l: PriceLine, patch: LinePatch) => {
      const prev: LinePatch = {}
      if (patch.work_ids !== undefined) prev.work_ids = l.workIds
      if (patch.amount_cents !== undefined) prev.amount_cents = l.amountCents
      if (patch.note !== undefined) prev.note = l.note ?? null
      return run('Change price line', () => w.updatePriceLine(l.id, patch), { undo: () => w.updatePriceLine(l.id, prev) })
    },

    deleteLine: (l: PriceLine) => run('Remove price line', () => w.deletePriceLine(l.id), {
      undo: async () => !!(await w.addPriceLine(l.optionId, { workIds: l.workIds, amountCents: l.amountCents, ...(l.note ? { note: l.note } : {}) })),
    }),

    addColumn: (label: string, kind: ColumnKind) => {
      const col: ChoiceColumn = { id: crypto.randomUUID(), label, kind }
      return columnEdit('Add column', (cols) => withColumn(cols, col), (cols) => withoutColumn(cols, col.id))
    },
    renameColumn: (c: ChoiceColumn, label: string) =>
      columnEdit('Rename column', (cols) => renamedColumn(cols, c.id, label), (cols) => renamedColumn(cols, c.id, c.label)),
    removeColumn: (c: ChoiceColumn) => {
      const index = choice.columns.findIndex((x) => x.id === c.id)
      return columnEdit('Remove column', (cols) => withoutColumn(cols, c.id), (cols) => restoredColumn(cols, c, index))
    },

    /** Edit the work saves the whole list; only what this save changed
     *  (pieces added, renamed or described, removed) lands on the work as it
     *  is now. */
    saveWork: (next: WorkPiece[], base: readonly WorkPiece[] = choice.work) => {
      // Against the list the editor opened on, not the page's (which may have
      // refetched a partner's edit while the editor was open).
      const diff = workDiff(base, choice.selectedWork, next)
      const write = (f: typeof applyWorkDiff) => onChoice((fresh) => {
        const r = f(fresh, diff)
        return { work: r.work, selected_work: r.selectedWork }
      })
      return run('Change the work', () => write(applyWorkDiff), { undo: () => write(revertWorkDiff) })
    },

    renameChoice: (title: string) => {
      const prev = choice.title
      return run('Rename choice', () => w.updateChoice({ title }), { undo: () => w.updateChoice({ title: prev }) })
    },

    /** No Undo: its options, prices and values go with it. The page says so
     *  before it asks. */
    deleteChoice: () => run('Delete choice', () => w.deleteChoice()),

    choose: (o: ChoiceOption, note: string | null) => {
      const prevStatus = o.status
      // Choosing again (chooseOption sets the earlier option back to Heard back):
      // Undo chooses the earlier one again, with its reason and date.
      const earlier = choice.status === 'decided' && choice.chosenOptionId && choice.chosenOptionId !== o.id ? choice.chosenOptionId : undefined
      const after: ChoiceDetail = {
        ...detail,
        choice: { ...choice, status: 'decided', chosenOptionId: o.id },
        options: detail.options.map((x) => (x.id === o.id ? { ...x, status: 'chosen' } : x.id === earlier ? { ...x, status: 'heard_back' } : x)),
      }
      return run('Choose', () => w.chooseOption(detail, o.id, note, new Date()), {
        undo: async () => {
          const ok = earlier
            ? await w.chooseOption(after, earlier, choice.decidedNote ?? null, choice.decidedAt ?? new Date())
            : await w.reopenChoice(after)
          return ok && (prevStatus === 'heard_back' ? true : w.updateOption(o.id, { status: prevStatus }))
        },
      })
    },

    reopen: () => {
      const chosenId = choice.chosenOptionId
      const note = choice.decidedNote ?? null
      const at = choice.decidedAt ?? new Date()
      return run('Reopen', () => w.reopenChoice(detail), {
        undo: async () => (chosenId ? w.chooseOption(detail, chosenId, note, at) : false),
      })
    },

    addFile: (o: ChoiceOption, file: File, files: OptionFilesApi) => {
      let added: Attachment | null = null
      return run('Add file', async () => {
        added = await files.upload(o.id, file)
        return !!added
      }, { undo: async () => (added ? files.remove(added) : false) })
    },

    /** Logs a past event, or plans one on a later day; see logEventCommand. */
    logEvent: (input: LogInput) => {
      const c = logEventCommand(w, { goal: choice.goal, goalContext: detail.goalContext, goalScope: detail.goalScope },
        input.optionId ? detail.options.find((o) => o.id === input.optionId) : undefined, input)
      return run(c.label, c.command, c.options)
    },

    editLogEntry: (e: LogEntry, patch: EntryPatch) => {
      const c = editEntryCommand(w, e, patch)
      return run(c.label, c.command, c.options)
    },

    deleteLogEntry: (e: LogEntry) => {
      const c = deleteEntryCommand(w, e)
      return run(c.label, c.command, c.options)
    },

    deleteOption: (o: ChoiceOption) => {
      const lines = detail.lines.filter((l) => l.optionId === o.id)
      return run('Delete option', () => w.deleteOption(o.id), {
        // Puts the option back with its values and priced lines (as a new row;
        // its files and follow-ups stay with the deleted one).
        undo: async () => {
          const back = await w.addOption({ name: o.name, contactId: o.contactId, status: o.status })
          if (!back) return false
          const steps: Promise<boolean>[] = []
          if (Object.keys(o.values).length > 0 || o.notes) {
            steps.push(w.updateOption(back.id, { values: o.values, ...(o.notes ? { notes: o.notes } : {}) }))
          }
          for (const l of lines) {
            steps.push(w.addPriceLine(back.id, { workIds: l.workIds, amountCents: l.amountCents, ...(l.note ? { note: l.note } : {}) }).then(Boolean))
          }
          return all(steps)
        },
      })
    },
  }
}

export type ChoiceEditing = ReturnType<typeof useChoiceEditing>
