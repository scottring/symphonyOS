// src/components/plan/PageMenu.tsx
//
// The shared ⋯ menu of the calm pages (Week, Month, Season, Year): the page's
// own choices, then its help. A choice with `checked` is a tick that keeps the
// menu open; one without is an action that closes it. "How this page works" is
// the title's old ?, "Watch the guide" its ▷. On a phone, which has no Chat
// bar, a page passes `talk` to offer "Talk it through".

import { useContext, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { usePageHelp } from '@/components/explain/PageHelp'
import { LearnPageContext, LearnVideoDialog } from '@/components/learn/LearnVideoChip'
import { LEARN_VIDEOS, PAGE_VIDEOS, markSeen, readSeen, videoForPage, type LearnVideo } from '@/lib/learn/learnVideos'

export type PageMenuChoice = {
  id: string
  label: string
  hint?: string
  /** Present: a tick that keeps the menu open. Absent: an action that closes it. */
  checked?: boolean
  onSelect: () => void
}

export function PageMenu({ label, choices, talk }: { label: string; choices: PageMenuChoice[]; talk?: () => void }) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const menuId = `${slug}-menu`
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState<LearnVideo | null>(null)
  const help = usePageHelp()
  const page = useContext(LearnPageContext)
  // The page's next unseen guide, as the ▷ chose it; once all are seen, the
  // first one again (the ▷ hid itself; the menu still offers it).
  const video = videoForPage(page, readSeen()) ?? (page && PAGE_VIDEOS[page]?.[0] ? LEARN_VIDEOS[PAGE_VIDEOS[page][0]] ?? null : null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    wrapRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    // A press anywhere else closes it.
    const away = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  return (
    <div className="wk-more-wrap" ref={wrapRef}>
      <button ref={buttonRef} type="button" className="wk-more" aria-label={label} aria-haspopup="menu"
        aria-expanded={open} aria-controls={menuId} data-explain={slug} data-explain-label={label}
        onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={label} className="wk-menu"
          // Focus leaving the menu (and not to its own button) closes it, as
          // the range menu does.
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget !== buttonRef.current) setOpen(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(true); return }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
            const at = items.indexOf(document.activeElement as HTMLElement)
            items[e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length]?.focus()
          }}>
          {choices.map((c) => {
            const tick = c.checked !== undefined
            return (
              <button key={c.id} type="button" role={tick ? 'menuitemcheckbox' : 'menuitem'} aria-checked={tick ? c.checked : undefined}
                aria-label={c.label} aria-describedby={c.hint ? `${menuId}-${c.id}` : undefined} className="wk-menu-item"
                onClick={() => { if (!tick) close(false); c.onSelect() }}>
                <span className="wk-menu-check" aria-hidden="true">{c.checked && <Check size={13} strokeWidth={2.5} />}</span>
                <span>{c.label}{c.hint && <small id={`${menuId}-${c.id}`}>{c.hint}</small>}</span>
              </button>
            )
          })}
          {(choices.length > 0 && (talk || help || video)) && <hr className="wk-menu-rule" />}
          {talk && (
            <button type="button" role="menuitem" className="wk-menu-item" onClick={() => { close(false); talk() }}>
              <span className="wk-menu-check" aria-hidden="true" /><span>Talk it through</span>
            </button>
          )}
          {help && (
            <button type="button" role="menuitem" className="wk-menu-item" onClick={() => { close(false); help() }}>
              <span className="wk-menu-check" aria-hidden="true" /><span>How this page works</span>
            </button>
          )}
          {video && (
            <button type="button" role="menuitem" className="wk-menu-item" onClick={() => { close(false); markSeen(video.id); setPlaying(video) }}>
              <span className="wk-menu-check" aria-hidden="true" /><span>Watch the guide</span>
            </button>
          )}
        </div>
      )}
      {playing && <LearnVideoDialog video={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}
