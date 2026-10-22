import { useRef } from 'react'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import type { ChoiceDetail } from '@/lib/choices/db'
import type {
  CellValue, ChoiceColumn, ChoiceOption, ColumnKind, DbChoice, DbChoiceOption, DbPriceLine,
  OptionStatus, PriceLine, WorkPiece,
} from '@/types/choice'
import type { LineInput } from './PriceLinesEditor'
import type { OptionFilesApi } from './useOptionFiles'
import type { Attachment } from '@/types/attachment'

type ChoicePatch = Partial<Pick<DbChoice, 'columns' | 'work' | 'selected_work'>>
type OptionPatch = Partial<Pick<DbChoiceOption, 'name' | 'contact_id' | 'status' | 'values' | 'notes'>>
type LinePatch = Partial<Pick<DbPriceLine, 'work_ids' | 'amount_cents' | 'note'>>

/** The writers this page calls, already bound to the client and the user.
 *  Each mirrors its db.ts writer without (db, userId), and announces the change. */
export interface ChoicePageWriters {
  setSelectedWork: (ids: string[]) => Promise<boolean>
  updateChoice: (patch: ChoicePatch) => Promise<boolean>
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
  addContact: (input: { name: string; phone: string }) => Promise<{ id: string } | null>
  deleteContact: (id: string) => Promise<boolean>
}

const all = async (steps: Promise<boolean>[]) => (await Promise.all(steps)).every(Boolean)

/** Every edit on the comparison page, each run as one command with an Undo
 *  built from the values captured before the write. */
export function useChoiceEditing(detail: ChoiceDetail, w: ChoicePageWriters) {
  const { run } = useCanvasActivity()
  const { choice } = detail
  // The selection the last toggle asked for, so quick taps build on each
  // other instead of on a render that hasn't refetched yet.
  const selection = useRef({ from: choice.selectedWork, ids: choice.selectedWork })

  const setColumns = (label: string, next: ChoiceColumn[]) => {
    const prev = choice.columns
    return run(label, () => w.updateChoice({ columns: next }), { undo: () => w.updateChoice({ columns: prev }) })
  }

  return {
    toggleWork: (id: string) => {
      const s = selection.current
      const prev = s.from === choice.selectedWork ? s.ids : choice.selectedWork
      const next = choice.work.filter((p) => (p.id === id ? !prev.includes(id) : prev.includes(p.id))).map((p) => p.id)
      selection.current = { from: choice.selectedWork, ids: next }
      return run('Change the work', () => w.setSelectedWork(next), { undo: () => w.setSelectedWork(prev) })
    },

    addOption: (name: string, phone?: string) => {
      const made: { optionId?: string; contactId?: string } = {}
      return run('Add option', async () => {
        if (phone) {
          const c = await w.addContact({ name, phone })
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

    setValue: (o: ChoiceOption, columnId: string, value: CellValue) => {
      const prev = o.values
      const next = { ...prev }
      if (value === null) delete next[columnId]
      else next[columnId] = value
      return run('Change a value', () => w.updateOption(o.id, { values: next }), { undo: () => w.updateOption(o.id, { values: prev }) })
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

    addColumn: (label: string, kind: ColumnKind) =>
      setColumns('Add column', [...choice.columns, { id: crypto.randomUUID(), label, kind }]),
    renameColumn: (c: ChoiceColumn, label: string) =>
      setColumns('Rename column', choice.columns.map((x) => (x.id === c.id ? { ...x, label } : x))),
    removeColumn: (c: ChoiceColumn) =>
      setColumns('Remove column', choice.columns.filter((x) => x.id !== c.id)),

    saveWork: (next: WorkPiece[]) => {
      const prevWork = choice.work
      const prevSelected = choice.selectedWork
      const ids = new Set(next.map((p) => p.id))
      // A first list of pieces starts all selected, so prices show at once.
      const selected = prevWork.length === 0 ? next.map((p) => p.id) : prevSelected.filter((id) => ids.has(id))
      return run('Change the work', () => w.updateChoice({ work: next, selected_work: selected }), {
        undo: () => w.updateChoice({ work: prevWork, selected_work: prevSelected }),
      })
    },

    choose: (o: ChoiceOption, note: string | null) => {
      const prevStatus = o.status
      return run('Choose', () => w.chooseOption(detail, o.id, note, new Date()), {
        undo: async () => {
          const ok = await w.reopenChoice({ ...detail, choice: { ...choice, chosenOptionId: o.id } })
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
