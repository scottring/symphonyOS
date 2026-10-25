// src/components/canvas/strip/HorizonStrip.tsx
//
// The strip on the left of every horizon (Scott's wireframe, 2026-10-25): what
// this page draws from — the week's own list, the month above, the year above
// — in tabs, with the routines that run at this page's pace in their own tab.
// It folds to a narrow rail; the open/closed state and the tab are remembered
// on this device per page. Phones draw it above the page, open.

import { useState, type ReactNode } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import './horizonStrip.css'

export interface StripTab {
  id: string
  label: string
  /** A small count after the label ("Week 4"). */
  count?: number
  content: ReactNode
}

const read = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const write = (key: string, v: string) => { try { window.localStorage.setItem(key, v) } catch { /* private mode */ } }

export function HorizonStrip({ id, label, tabs, railLabel }: {
  /** Remembers this page's open/closed and tab ("week", "month" …). */
  id: string
  /** Accessible name ("Week strip"). */
  label: string
  tabs: StripTab[]
  /** What the folded rail says ("This week · 4"). */
  railLabel: string
}) {
  const phone = useMediaQuery('(max-width: 767px)')
  const [open, setOpen] = useState(() => read(`symphony-strip-open:${id}`) !== '0')
  const [tab, setTab] = useState(() => read(`symphony-strip-tab:${id}`) ?? tabs[0]?.id)
  const active = tabs.find((t) => t.id === tab) ?? tabs[0]
  const toggle = () => setOpen((o) => { write(`symphony-strip-open:${id}`, o ? '0' : '1'); return !o })
  const pick = (t: string) => { setTab(t); write(`symphony-strip-tab:${id}`, t) }
  if (!active) return null

  if (!open && !phone) {
    return (
      <button type="button" className="hs-rail" aria-expanded={false} aria-label={`Show ${label.toLowerCase()}`} onClick={toggle}>
        <span aria-hidden="true">»</span> {railLabel}
      </button>
    )
  }
  return (
    <aside className="hs" aria-label={label} data-strip={id}>
      <div className="hs-head">
        {tabs.length > 1
          ? <div role="tablist" aria-label={`${label}: what it shows`} className="hs-tabs">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" id={`hs-${id}-${t.id}`} aria-selected={t.id === active.id} aria-controls={`hs-${id}-panel`}
                className="hs-tab" onClick={() => pick(t.id)}>
                {t.label}{t.count ? <span className="hs-tab-count">{t.count}</span> : null}
              </button>
            ))}
          </div>
          : <p className="hs-title">{active.label}</p>}
        {!phone && <button type="button" className="hs-fold" aria-expanded aria-label={`Hide ${label.toLowerCase()}`} onClick={toggle}>«</button>}
      </div>
      <div className="hs-body" id={`hs-${id}-panel`} role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `hs-${id}-${active.id}` : undefined}>
        {active.content}
      </div>
    </aside>
  )
}
