import { useId, useState } from 'react'
import { inputClass, primaryButton, quietButton } from './DialogFrame'

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function threeDaysOut(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return iso(d)
}

/** "Follow up on…" a date (three days out to start). Save hands back the local day. */
export function FollowUpPicker({ onSave, onCancel }: { onSave: (on: Date) => void; onCancel: () => void }) {
  const id = useId()
  const [value, setValue] = useState(threeDaysOut)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2">
      <label htmlFor={id} className="text-[13px] text-neutral-600">Follow up on</label>
      <input id={id} type="date" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} w-auto`} />
      <button type="button" disabled={!m} onClick={() => m && onSave(new Date(+m[1], +m[2] - 1, +m[3]))} className={primaryButton}>
        Save
      </button>
      <button type="button" onClick={onCancel} className={quietButton}>Cancel</button>
    </div>
  )
}
