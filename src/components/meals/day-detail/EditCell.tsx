import { useEffect, useRef, useState } from 'react'
import { GramHints } from './GramHints'

export type CellPerson = 'iris' | 'scott' | 'kids'

interface Hint {
  label: string
  grams: number
}

interface Props {
  person: CellPerson
  /** The current free-text body — recipe title, ad-hoc note, or "Skipping". */
  value: string
  /** Placeholder shown when value is empty. */
  placeholder?: string
  /** Called on blur if the value changed. */
  onCommit?: (next: string) => void | Promise<void>
  /** Optional gram-hint chips below the body. */
  hints?: Hint[]
  /** When true, render with the kid-side italic serif voice. */
  kidVoice?: boolean
  /** Fully read-only — disables editing entirely (e.g. shared kid sub-tag). */
  readOnly?: boolean
}

const PERSON_LABEL: Record<CellPerson, string> = {
  iris: 'IRIS',
  scott: 'SCOTT',
  kids: 'KIDS',
}

/** Map person → kicker color. Iris = primary-400 (teal-ish per design),
 *  Scott = sage-400 (literal hsl since the token isn't in the palette),
 *  Kids = sage-500. */
function personKickerClass(person: CellPerson): string {
  switch (person) {
    case 'iris':  return 'text-primary-400'
    case 'scott': return ''  // we apply inline style for sage-400
    case 'kids':  return 'text-sage-500'
  }
}

function personKickerStyle(person: CellPerson): React.CSSProperties | undefined {
  // Scott's sage-400 isn't in the Nordic Journal palette — invent it inline.
  return person === 'scott' ? { color: 'hsl(145 22% 48%)' } : undefined
}

/** One person's column in a meal row — editable line + gram hints.
 *  Saves on blur via `onCommit`. Empty / skip states render an italic
 *  placeholder in the design idiom. */
export function EditCell({
  person, value, placeholder, onCommit, hints, kidVoice, readOnly,
}: Props) {
  const [draft, setDraft] = useState(value)
  const original = useRef(value)

  // Stay in sync if the upstream value updates (e.g. after a save round-trip).
  useEffect(() => {
    setDraft(value)
    original.current = value
  }, [value])

  const fontClass = kidVoice
    ? 'font-display italic text-[1rem] leading-tight'
    : 'font-display text-[1rem] leading-tight'

  const handleBlur = () => {
    const next = draft.trim()
    if (next !== original.current.trim()) {
      original.current = next
      void onCommit?.(next)
    }
  }

  const isEmpty = !value || value.trim().length === 0

  return (
    <div className="min-w-0">
      <div
        className={`text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5 ${personKickerClass(person)}`}
        style={personKickerStyle(person)}
      >
        {PERSON_LABEL[person]}
      </div>
      {readOnly ? (
        <div
          className={`${fontClass} ${isEmpty ? 'text-neutral-400 italic' : 'text-neutral-800'}`}
        >
          {isEmpty ? (placeholder ?? '—') : value}
        </div>
      ) : (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              ;(e.currentTarget as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') {
              setDraft(original.current)
              ;(e.currentTarget as HTMLInputElement).blur()
            }
          }}
          placeholder={placeholder ?? '—'}
          className={`${fontClass} w-full bg-transparent outline-none border-b border-transparent
                      focus:border-primary-200 focus:bg-primary-50/30 rounded-sm
                      text-neutral-800 placeholder:text-neutral-400 placeholder:italic
                      transition-colors px-0.5 py-0.5`}
        />
      )}
      {hints && hints.length > 0 && <GramHints hints={hints} className="mt-1" />}
    </div>
  )
}
