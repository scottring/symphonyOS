import { useRef, useState } from 'react'
import { inputClass, primaryButton } from './DialogFrame'
import { splitPhone } from './cells'

export function AddOptionInput({ onAdd }: { onAdd: (name: string, phone?: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  const busy = useRef(false)
  const submit = async () => {
    if (busy.current || !text.trim()) return
    busy.current = true
    try {
      const { name, phone } = splitPhone(text)
      if (await onAdd(name, phone)) setText('')
    } finally {
      busy.current = false
    }
  }
  // A visible Add beside the box: Enter alone left a typed name looking saved.
  return (
    <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void submit() }}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add an option: a name, or paste a phone number"
        aria-label="Add an option"
        className={`${inputClass} py-2`}
      />
      <button type="submit" aria-label="Add option" disabled={!text.trim()} className={primaryButton}>Add</button>
    </form>
  )
}
