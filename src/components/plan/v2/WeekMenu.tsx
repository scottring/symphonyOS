// src/components/plan/v2/WeekMenu.tsx
//
// The Week header's ⋯ (calm pass 2, mockup approved 2026-10-18): the page's
// view choices and its help, out of the way. The four choices are
// useWeekViewPrefs, remembered on this device; ticking one keeps the menu
// open. "How this page works" is the title's old ?, "Watch the guide" its ▷.

import { useContext, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useWeekViewPrefs, type WeekViewPref } from '@/hooks/useWeekViewPrefs'
import { usePageHelp } from '@/components/explain/PageHelp'
import { LearnPageContext, LearnVideoDialog } from '@/components/learn/LearnVideoChip'
import { LEARN_VIDEOS, PAGE_VIDEOS, markSeen, readSeen, videoForPage, type LearnVideo } from '@/lib/learn/learnVideos'

const CHOICES: { pref: WeekViewPref; label: string; hint?: string }[] = [
  { pref: 'freeTime', label: 'Show free time', hint: '“Calendar clear” under each day' },
  { pref: 'weather', label: 'Show weather' },
  { pref: 'done', label: 'Show done' },
  { pref: 'dailyInDays', label: 'Show daily routines in each day' },
]

export function WeekMenu() {
  const [open, setOpen] = useState(false)
  const [playing, setPlaying] = useState<LearnVideo | null>(null)
  const prefs = useWeekViewPrefs()
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
      <button ref={buttonRef} type="button" className="wk-more" aria-label="Week options" aria-haspopup="menu"
        aria-expanded={open} aria-controls="week-options-menu" data-explain="week-options" data-explain-label="Week options"
        onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id="week-options-menu" role="menu" aria-label="Week options" className="wk-menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(true); return }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]'))
            const at = items.indexOf(document.activeElement as HTMLElement)
            items[e.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length]?.focus()
          }}>
          {CHOICES.map((c) => {
            const on = prefs[c.pref]
            return (
              <button key={c.pref} type="button" role="menuitemcheckbox" aria-checked={on} aria-label={c.label}
                aria-describedby={c.hint ? `week-option-${c.pref}` : undefined} className="wk-menu-item"
                onClick={() => prefs.set(c.pref, !on)}>
                <span className="wk-menu-check" aria-hidden="true">{on && <Check size={13} strokeWidth={2.5} />}</span>
                <span>{c.label}{c.hint && <small id={`week-option-${c.pref}`}>{c.hint}</small>}</span>
              </button>
            )
          })}
          {(help || video) && <hr className="wk-menu-rule" />}
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
