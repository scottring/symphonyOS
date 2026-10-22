import { useRef, useState } from 'react'
import { inputClass } from './DialogFrame'
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
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void submit() }}
      placeholder="Add an option: a name, or paste a phone number"
      aria-label="Add an option"
      className={`mt-4 ${inputClass} py-2`}
    />
  )
}
