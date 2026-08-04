import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Phone, Mail, X } from 'lucide-react'

export type ReachKind = 'phone' | 'email'

const KIND = {
  phone: {
    label: 'Phone',
    icon: Phone,
    placeholder: 'Number to call…',
    inputType: 'tel',
    href: (v: string) => `tel:${v.replace(/[^\d+]/g, '')}`,
  },
  email: {
    label: 'Email',
    icon: Mail,
    placeholder: 'Address to write to…',
    inputType: 'email',
    href: (v: string) => `mailto:${v.trim()}`,
  },
} as const

interface Props {
  kind: ReachKind
  value?: string
  onChange: (next: string | undefined) => void
  /** Focus the input on mount — set when the section was just revealed. */
  autoFocus?: boolean
  /**
   * Render the stored value as a tel:/mailto: link. Off for phone in the task
   * panel, where the action bar already owns the call button — two competing
   * call affordances in one panel is the duplication this redesign is removing.
   */
  asLink?: boolean
}

/**
 * How to reach whoever this task requires.
 *
 * Phone and email are the same shape — a string you capture once and act on
 * later — so they share a component. Capturing it here is what lets the value
 * surface as a tap-to-act affordance elsewhere (the panel's action bar, the
 * card in the day list) instead of being something you look up again.
 *
 * Whether this section renders its own link is `asLink`: on for email, which
 * has no other affordance in the task panel; off for phone, which does.
 */
export function PanelReach({ kind, value, onChange, autoFocus, asLink = true }: Props) {
  const meta = KIND[kind]
  const Icon = meta.icon

  const [editing, setEditing] = useState(!value)
  const [draft, setDraft] = useState(value ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  // Follow the task when the panel switches to a different one.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraft(value ?? '')
    setEditing(!value)
  }

  useEffect(() => {
    if (autoFocus && editing) inputRef.current?.focus()
  }, [autoFocus, editing])

  function commit(e?: FormEvent) {
    e?.preventDefault()
    const next = draft.trim()
    onChange(next || undefined)
    if (next) setEditing(false)
  }

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
        {meta.label}
      </div>

      {value && !editing ? (
        <div className="flex items-center gap-1">
          {asLink ? (
            <a
              href={meta.href(value)}
              className="flex flex-1 items-center gap-2 rounded-md px-1 py-1.5 text-sm text-neutral-800 hover:bg-neutral-100/60"
            >
              <Icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <span className="truncate">{value}</span>
            </a>
          ) : (
            <span className="flex flex-1 items-center gap-2 px-1 py-1.5 text-sm text-neutral-800">
              <Icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <span className="truncate">{value}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Remove ${meta.label.toLowerCase()}`}
            onClick={() => onChange(undefined)}
            className="rounded-md p-1 text-neutral-300 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <form onSubmit={commit} className="flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <input
            ref={inputRef}
            type={meta.inputType}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit()}
            placeholder={meta.placeholder}
            aria-label={meta.label}
            className="min-w-0 flex-1 border-b border-neutral-200 bg-transparent py-1 text-sm text-neutral-800 placeholder:text-neutral-300 focus:border-primary-300 focus:outline-none"
          />
        </form>
      )}
    </section>
  )
}
