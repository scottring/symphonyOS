// src/components/layout/JournalHeading.tsx
//
// One heading on every horizon, one plain line (Scott's sketch, 2026-11-11):
// "‹ 11 November 2026, Wednesday ›" — the arrows around the whole of it, the
// day as a big thin number, the words after it in one face and size. Week
// "‹ 7–13 November 2026 ›" (the days big); Month
// "‹ November 2026 ›", Season "‹ Fall 2026 ›", Year "‹ 2026 ›". `srTitle`
// is what the heading says aloud when the shown words differ.
//
// Away from the current period, a small pill after the arrows goes back to
// it (Scott, 2026-11-11: "a today button for all horizons"): "Today",
// "This week", "This month", "This season", "This year".

import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function JournalHeading({ numeral, title, srTitle, tag, onPrev, onNext, prevLabel, nextLabel, trailing, titleExtras, current }: {
  /** The big thin number inside the arrows: Today "11", Week "7–13". */
  numeral?: string
  title: ReactNode
  srTitle?: string
  /** After a comma, in the same words: Today's weekday (a button: the picker). */
  tag?: ReactNode
  onPrev: () => void
  onNext: () => void
  prevLabel: string
  nextLabel: string
  /** Hung after the line (a popover anchored to it). */
  trailing?: ReactNode
  /** After the line, quietly (the ? and ▷). */
  titleExtras?: ReactNode
  /** Set only while another period is on screen: the way back to the
   *  current one. `label` is the pill ("Today", "This week"…); `ariaLabel`
   *  what it says aloud ("Go to today"). */
  current?: { label: string; ariaLabel?: string; onGo: () => void }
}) {
  return (
    <div className="journal-heading" data-testid="journal-heading">
      <button type="button" className="journal-step" aria-label={prevLabel} onClick={onPrev}><ChevronLeft size={22} aria-hidden="true" /></button>
      {numeral && <span className="journal-num" aria-hidden="true">{numeral}</span>}
      <h1 className="journal-title" data-guide-anchor="title">
        {srTitle ? <><span aria-hidden="true">{title}</span><span className="sr-only">{srTitle}</span></> : title}
      </h1>
      {tag && <span className="journal-tag"><span aria-hidden="true">,</span>{tag}</span>}
      <button type="button" className="journal-step" aria-label={nextLabel} onClick={onNext}><ChevronRight size={22} aria-hidden="true" /></button>
      {current && <button type="button" className="journal-current" aria-label={current.ariaLabel ?? current.label} onClick={current.onGo}>{current.label}</button>}
      {titleExtras && <span className="journal-extras">{titleExtras}</span>}
      {trailing}
    </div>
  )
}
