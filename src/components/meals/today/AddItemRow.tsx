import { useState } from 'react'

interface Props {
  onAdd: (title: string, grams: string) => void
}

/** "+ add item" inline row at the end of the meal section. */
export function AddItemRow({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [grams, setGrams] = useState('')

  const submit = () => {
    if (!title.trim()) { setOpen(false); return }
    onAdd(title.trim(), grams.trim())
    setTitle(''); setGrams(''); setOpen(false)
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
              className="mt-2 text-[12px] text-primary-500 hover:text-primary-600 italic">
        + add item
      </button>
    )
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2 items-center">
      <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
             onKeyDown={e => e.key === 'Enter' && submit()}
             placeholder="Apple, almonds, …"
             className="px-2 py-1 text-[13px] rounded-md border border-neutral-200 bg-bg-base flex-1 min-w-[180px] focus:border-primary-500 focus:outline-none" />
      <input value={grams} onChange={e => setGrams(e.target.value)}
             onKeyDown={e => e.key === 'Enter' && submit()}
             placeholder="grams"
             className="px-2 py-1 text-[13px] rounded-md border border-neutral-200 bg-bg-base w-24 focus:border-primary-500 focus:outline-none" />
      <button onClick={submit}
              className="px-3 py-1 text-[12px] rounded-md bg-primary-500 text-white hover:bg-primary-600">add</button>
      <button onClick={() => setOpen(false)}
              className="px-3 py-1 text-[12px] rounded-md text-neutral-500 hover:text-neutral-700">cancel</button>
    </div>
  )
}
