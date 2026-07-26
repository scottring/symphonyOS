import { useEffect, useRef, useState } from 'react'

interface GroupNameInputProps {
  initialName: string
  /** Called once, with the final text. Never called with an empty string. */
  onCommit: (name: string) => void
  onCancel: () => void
}

/**
 * The inline rename a drag-created group opens with.
 *
 * A group is a thing you name, and the name is worth nothing if claiming it
 * costs a second gesture — so the field mounts focused with its placeholder
 * text SELECTED, and the first character you type replaces it. Enter, Tab, or
 * clicking away commits; Escape keeps the placeholder.
 */
export function GroupNameInput({ initialName, onCommit, onCancel }: GroupNameInputProps) {
  const [value, setValue] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  // Enter commits and then blurs, and blur commits too. One latch, so the
  // rename is written once however you leave the field.
  const settled = useRef(false)

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  const commit = (text: string) => {
    if (settled.current) return
    settled.current = true
    const trimmed = text.trim()
    if (trimmed) onCommit(trimmed)
    else onCancel()
  }

  const cancel = () => {
    if (settled.current) return
    settled.current = true
    onCancel()
  }

  return (
    <input
      ref={inputRef}
      aria-label="Group name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        // The row sits inside a click-to-open card; neither key should reach it.
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      onBlur={() => commit(value)}
      onClick={(e) => e.stopPropagation()}
      className="w-full px-3 py-2 md:py-1 text-base font-medium bg-white text-neutral-800 border border-primary-300 rounded-xl outline-none focus:ring-2 focus:ring-primary-200"
    />
  )
}
