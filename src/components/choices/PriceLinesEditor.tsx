import { useState } from 'react'
import type { ChoiceOption, PriceLine, WorkPiece } from '@/types/choice'
import { parseCell } from '@/lib/choices/db'
import { formatCents } from '@/lib/choices/price'
import { DialogFrame, inputClass, linkButton, primaryButton, quietButton } from './DialogFrame'

const MONEY_HINT = 'Use a number, like 19,750'

export interface LineInput { workIds: string[]; amountCents: number; note?: string }

interface Props {
  option: ChoiceOption
  lines: readonly PriceLine[]
  work: readonly WorkPiece[]
  onAdd: (input: LineInput) => Promise<boolean>
  onUpdate: (line: PriceLine, patch: { work_ids?: string[]; amount_cents?: number; note?: string | null }) => Promise<boolean>
  onDelete: (line: PriceLine) => Promise<boolean>
  onClose: () => void
}

/** Pieces in work-list order, so a line reads the same however it was ticked. */
const inOrder = (ids: ReadonlySet<string>, work: readonly WorkPiece[]) => work.filter((w) => ids.has(w.id)).map((w) => w.id)

function Pieces({ work, ids, onToggle }: { work: readonly WorkPiece[]; ids: readonly string[]; onToggle: (id: string) => void }) {
  if (work.length === 0) return null
  const removed = ids.filter((id) => !work.some((w) => w.id === id))
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {work.map((w) => (
        <label key={w.id} className="inline-flex items-center gap-1.5 text-[13px] text-neutral-700">
          <input type="checkbox" checked={ids.includes(w.id)} onChange={() => onToggle(w.id)} />
          {w.label}
        </label>
      ))}
      {removed.length > 0 && <span className="text-[13px] text-neutral-400">Removed piece</span>}
    </div>
  )
}

function AmountInput({ value, onChange, onEnter, onBlur }: { value: string; onChange: (v: string) => void; onEnter?: () => void; onBlur?: () => void }) {
  return (
    <input
      aria-label="Amount"
      inputMode="decimal"
      placeholder="Amount"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.() }}
      onBlur={onBlur}
      className={`${inputClass} w-32`}
    />
  )
}

function LineRow({ line, work, onUpdate, onDelete }: { line: PriceLine; work: readonly WorkPiece[] } & Pick<Props, 'onUpdate' | 'onDelete'>) {
  const [amount, setAmount] = useState(formatCents(line.amountCents).replace('$', ''))
  const [note, setNote] = useState(line.note ?? '')
  const [hint, setHint] = useState(false)
  const saveAmount = () => {
    const cents = parseCell('money', amount)
    if (typeof cents !== 'number') { setHint(true); return }
    if (cents !== line.amountCents) void onUpdate(line, { amount_cents: cents })
  }
  const toggle = (id: string) => {
    const ids = new Set(line.workIds)
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    const kept = line.workIds.filter((x) => !work.some((w) => w.id === x))
    void onUpdate(line, { work_ids: [...inOrder(ids, work), ...kept] })
  }
  return (
    <li className="space-y-1.5 border-t border-neutral-100 py-2.5 first:border-t-0">
      <Pieces work={work} ids={line.workIds} onToggle={toggle} />
      <div className="flex items-center gap-2">
        <AmountInput value={amount} onChange={(v) => { setAmount(v); setHint(false) }} onEnter={saveAmount} onBlur={saveAmount} />
        <input
          aria-label="Note"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note.trim() !== (line.note ?? '')) void onUpdate(line, { note: note.trim() || null }) }}
          className={inputClass}
        />
        <button type="button" onClick={() => void onDelete(line)} className={quietButton} aria-label="Remove line">×</button>
      </div>
      {hint && <div className="text-xs text-amber-700">{MONEY_HINT}</div>}
    </li>
  )
}

function NewLine({ work, onAdd, onDone }: { work: readonly WorkPiece[]; onAdd: Props['onAdd']; onDone: () => void }) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [hint, setHint] = useState(false)
  const add = async () => {
    const cents = parseCell('money', amount)
    if (typeof cents !== 'number') { setHint(true); return }
    const input: LineInput = { workIds: inOrder(ids, work), amountCents: cents }
    if (note.trim()) input.note = note.trim()
    if (await onAdd(input)) onDone()
  }
  return (
    <li className="space-y-1.5 border-t border-neutral-100 py-2.5 first:border-t-0">
      <Pieces work={work} ids={[...ids]} onToggle={(id) => setIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })} />
      <div className="flex items-center gap-2">
        <AmountInput value={amount} onChange={(v) => { setAmount(v); setHint(false) }} onEnter={() => void add()} />
        <input aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        {hint && <span className="text-xs text-amber-700">{MONEY_HINT}</span>}
        <span className="ml-auto" />
        <button type="button" onClick={onDone} className={quietButton}>Cancel</button>
        <button type="button" disabled={work.length > 0 && ids.size === 0} onClick={() => void add()} className={primaryButton}>
          Add line
        </button>
      </div>
    </li>
  )
}

/** An option's priced lines: each covers some pieces of the work, has an
 *  amount, and maybe a note. */
export function PriceLinesEditor({ option, lines, work, onAdd, onUpdate, onDelete, onClose }: Props) {
  const [adding, setAdding] = useState(false)
  return (
    <DialogFrame title={`Price · ${option.name}`} onClose={onClose}>
      <ul>
        {lines.map((l) => <LineRow key={l.id} line={l} work={work} onUpdate={onUpdate} onDelete={onDelete} />)}
        {adding && <NewLine work={work} onAdd={onAdd} onDone={() => setAdding(false)} />}
      </ul>
      <div className="mt-3 flex items-center">
        {!adding && <button type="button" onClick={() => setAdding(true)} className={linkButton}>+ Line</button>}
        <button type="button" onClick={onClose} className={`${quietButton} ml-auto`}>Done</button>
      </div>
    </DialogFrame>
  )
}
