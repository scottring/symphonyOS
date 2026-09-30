// "This week ▾" (Scott, 2026-09-30: the Inbox needs this weekend / next week /
// next weekend). The chip still sends to this week in one tap; the caret
// beside it opens the week's other choices, each named with its day, so the
// row doesn't grow three more buttons.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { getNextMonday, getNextWeekend, getWeekendAfterNext } from '@/lib/dateHelpers'

export type WeekChoice = 'this-weekend' | 'next-week' | 'next-weekend'

const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

export function weekChoices(): { when: WeekChoice; label: string; date: Date }[] {
  return [
    { when: 'this-weekend', label: 'This weekend', date: getNextWeekend() },
    { when: 'next-week', label: 'Next week', date: getNextMonday() },
    { when: 'next-weekend', label: 'Next weekend', date: getWeekendAfterNext() },
  ]
}

export function WeekChoiceChip({ label, title, onThisWeek, onPick, className, caretClassName }: {
  label: string
  title: string
  onThisWeek: () => void
  onPick: (when: WeekChoice) => void
  className: string
  caretClassName: string
}) {
  const [open, setOpen] = useState(false)
  const caret = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties>({})
  useLayoutEffect(() => {
    if (!open || !caret.current) return
    const r = caret.current.getBoundingClientRect()
    const up = window.innerHeight - r.bottom < 160 && r.top > 160
    setPos({ right: Math.max(8, window.innerWidth - r.right), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) })
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node
      if (!caret.current?.contains(t) && !menu.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); caret.current?.focus() } }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])
  return (
    <span className="inline-flex items-stretch">
      <button type="button" onClick={onThisWeek} className={`${className} rounded-r-none`}>{label}</button>
      <button ref={caret} type="button" aria-label={`Other weeks for ${title}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} className={`${caretClassName} rounded-l-none border-l border-white/70 px-1`}>
        <ChevronDown className="h-3 w-3" aria-hidden="true" />
      </button>
      {open && createPortal(
        <div ref={menu} role="menu" aria-label={`Other weeks for ${title}`} style={pos}
          className="fixed z-[60] min-w-[200px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {weekChoices().map((c) => (
            <button key={c.when} type="button" role="menuitem" onClick={() => { setOpen(false); onPick(c.when) }}
              className="flex w-full items-baseline justify-between gap-4 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-primary-50 hover:text-primary-700">
              <span>{c.label}</span><span className="text-xs text-neutral-400">{day(c.date)}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  )
}
