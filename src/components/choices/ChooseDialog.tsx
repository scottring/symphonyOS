import { useId, useState } from 'react'
import { DialogFrame, inputClass, primaryButton, quietButton } from './DialogFrame'

/** "Choose this": an optional reason in the person's words, then Save. */
export function ChooseDialog({ name, onSave, onClose }: {
  name: string
  onSave: (note: string | null) => Promise<boolean>
  onClose: () => void
}) {
  const id = useId()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (busy) return
    setBusy(true)
    const ok = await onSave(note.trim() || null)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <DialogFrame title={`Choose ${name}`} onClose={onClose}>
      <label htmlFor={id} className="mb-1 block text-[13px] text-neutral-600">Why (in your words)</label>
      <input id={id} autoFocus value={note} onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save() }} className={inputClass} />
      <div className="mt-4 flex justify-end gap-1">
        <button type="button" onClick={onClose} className={quietButton}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => void save()} className={primaryButton}>Save</button>
      </div>
    </DialogFrame>
  )
}

const shortDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** The decision, in one block: who was chosen, the reason as written, when. */
export function DecidedBanner({ name, note, decidedAt, onReopen }: {
  name: string
  note?: string
  decidedAt?: Date
  onReopen: () => void
}) {
  return (
    <section className="mb-5 flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm">
      <b className="font-semibold text-neutral-900">{`Chose ${name}`}</b>
      {note && <span className="text-neutral-700">{`“${note}”`}</span>}
      {decidedAt && <span className="text-neutral-500">{`· ${shortDate(decidedAt)}`}</span>}
      <button type="button" onClick={onReopen} className="ml-auto text-[13px] font-medium text-primary-600 hover:text-primary-700">
        Reopen
      </button>
    </section>
  )
}
