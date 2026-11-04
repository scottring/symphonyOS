// Scott, 2026-11-04: paper-style horizons. The level above (the Fall season
// beside November) sits folded behind this period's sheet. Tap or drag its
// edge, or press F, and it swings out on a hinge with a spring and paper
// sounds to lie beside the page, for reading. Ported from the approved
// prototype, docs/superpowers/specs/2026-11-04-paper-fold-prototype.html.
//
// Task 5c (Scott, 2026-11-04: "yes, add the calendar fold on the right"):
// Year, Season and Month also carry this period's calendar, folded on the
// right edge, mirrored (key C, remembered as symphony-fold:<horizon>:calendar).
// With both open the page is a planner spread: Fall | November | November's
// calendar. When the spread has no room for three (spreadFits), opening one
// folds the other; in Duo it is one companion at a time, and with the calendar
// open this sheet takes the left page.
//
// The motion of each companion (spring, drag, keys, sounds) is useFoldMotion;
// this file lays them out. The page can also drive a companion open or folded
// for a while (`drive`: the planning ribbon's steps, the guide's Today step)
// without touching what the reader left; letting go returns it there.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react'
import { detectFoldMode, foldSizes, type FoldMode } from '@/lib/fold/foldMode'
import { hasStored, readStored, useFoldMotion, type FoldMotion, type FoldSide, type GoOptions } from './useFoldMotion'
import './paperFold.css'

export type FoldHorizon = 'year' | 'season' | 'month' | 'week' | 'day'

export interface PaperFoldProps {
  /** Storage key and aria. */
  horizon: FoldHorizon
  /** The sheet above's name on its edge, e.g. "Fall 2026". */
  edgeLabel: string
  /** Open items on the sheet above. */
  edgeCount?: number
  /** Read-only content of the sheet above. */
  above: ReactNode
  /** This period's sheet. */
  children: ReactNode
  className?: string
  /** Put away for now (Today while a session runs on the page): no edge, no
   *  sheet above and no F key, while this sheet stays where it is, so what is
   *  on it is never remounted. */
  stowed?: boolean
  /** The sheet above's accessible name. Default "{edgeLabel}, for reading";
   *  Today's week sheet, which has a + on each row, is "…, to pick from". */
  frontLabel?: string
  /** This period's calendar, for reading, folded on the right edge (Year,
   *  Season and Month; the Week and Today pages are the calendar already). */
  calendar?: ReactNode
  /** The calendar's name on its edge, e.g. "November calendar". */
  calendarLabel?: string
  /** The page drives a companion for now: true opens it, false folds it,
   *  with the sound, and nothing is remembered. A key left undefined (or no
   *  `drive`) is the reader's: it returns to what they left. */
  drive?: { above?: boolean; calendar?: boolean }
}

const storageKey = (h: FoldHorizon) => `symphony-fold:${h}`

function mm(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches
  } catch {
    return false
  }
}

/** The nearest ancestor that scrolls (the shell's .scenery-scroll), or null
 *  when the window does. */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p)
    if (overflowY === 'auto' || overflowY === 'scroll') return p
  }
  return null
}

// ---------- paper grain: made once per page, the prototype's way ----------
const grainCache = new Map<string, string | null>()

function paperGrain(alphaRaw: string): string | null {
  const key = alphaRaw.trim() || '.055'
  if (grainCache.has(key)) return grainCache.get(key) ?? null
  let url: string | null = null
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 180
    const g = c.getContext('2d')
    if (g) {
      const img = g.createImageData(180, 180)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 120 + Math.random() * 135
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = Math.random() < 0.5 ? 255 * (Math.random() * 0.9) : 0
      }
      g.putImageData(img, 0, 0)
      const alpha = parseFloat(key) || 0.05
      const c2 = document.createElement('canvas')
      c2.width = c2.height = 180
      const g2 = c2.getContext('2d')
      if (g2) {
        g2.globalAlpha = alpha
        g2.drawImage(c, 0, 0)
        url = `url(${c2.toDataURL()})`
      }
    }
  } catch {
    url = null // plain paper is fine
  }
  grainCache.set(key, url)
  return url
}


/** A different horizon in the same spot starts fresh with that horizon's remembered state. */
export function PaperFold(props: PaperFoldProps) {
  return <PaperFoldSheet key={props.horizon} {...props} />
}

type Drive = { above?: boolean; calendar?: boolean }

/** On a spread with room for one companion, which stays open when both would:
 *  the one the page drives open (with both driven, the calendar: the step
 *  that asks for it is the later, narrower ask); with neither driven, the
 *  sheet above, as in the prototype. */
function keepsOpen(drive: Drive): FoldSide {
  return drive.calendar === true ? 'calendar' : 'above'
}

function Chevron({ d }: { d: string }) {
  return (
    <svg
      className="paper-fold-chevron"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

function PaperFoldSheet({
  horizon,
  edgeLabel,
  edgeCount,
  above,
  children,
  className,
  stowed = false,
  frontLabel,
  calendar,
  calendarLabel = 'Calendar',
  drive,
}: PaperFoldProps) {
  const hasCal = calendar !== undefined && calendar !== null && calendar !== false
  const aboveKey = storageKey(horizon)
  const calKey = `${aboveKey}:calendar`
  const frontId = useId()
  const calId = useId()

  const rootRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const flapRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const aboveBodyRef = useRef<HTMLDivElement>(null)
  const calSlotRef = useRef<HTMLDivElement>(null)
  const calPinRef = useRef<HTMLDivElement>(null)
  const calFlapRef = useRef<HTMLDivElement>(null)
  const calScrollRef = useRef<HTMLDivElement>(null)
  const calBodyRef = useRef<HTMLDivElement>(null)
  const currentRef = useRef<HTMLElement>(null)

  // The layout, outside React: the mode and whether both companions fit.
  const modeRef = useRef<FoldMode | ''>('')
  const bothRef = useRef(false)
  // Last sizes the ResizeObserver reported, so it re-lays out only on changes that matter.
  const seen = useRef({ parentW: NaN, aboveH: NaN, calH: NaN })
  const stowedRef = useRef(stowed)
  const hasCalRef = useRef(hasCal)
  const driveRef = useRef<Drive>({ above: drive?.above, calendar: drive?.calendar })
  useLayoutEffect(() => {
    stowedRef.current = stowed
    hasCalRef.current = hasCal
  }, [stowed, hasCal])

  // Each companion, when it opens, folds the other unless the spread holds both.
  const motions = useRef<Partial<Record<FoldSide, FoldMotion>>>({})
  const foldOther = useCallback((other: FoldSide, o: { remember: boolean }) => {
    const f = motions.current[other]
    if (!f || bothRef.current || f.m.current.target !== 1) return
    f.go(0, { quiet: true, remember: o.remember })
  }, [])

  const A = useFoldMotion({
    side: 'above',
    storageKey: aboveKey,
    initialOpen: readStored(aboveKey),
    mode: modeRef,
    rootRef,
    slotRef,
    flapRef,
    keyName: 'f',
    keyEnabled: () => !stowedRef.current,
    onOpen: (o) => foldOther('calendar', o),
  })
  const C = useFoldMotion({
    side: 'calendar',
    storageKey: calKey,
    initialOpen: hasCal && readStored(calKey),
    mode: modeRef,
    rootRef,
    slotRef: calSlotRef,
    flapRef: calFlapRef,
    keyName: 'c',
    keyEnabled: () => hasCalRef.current && !stowedRef.current,
    onOpen: (o) => foldOther('above', o),
  })
  useLayoutEffect(() => {
    motions.current = { above: A, calendar: C }
  })
  const { m: mA, apply: applyA, go: goA, stop: stopA, patch: patchA } = A
  const { m: mC, apply: applyC, go: goC, stop: stopC, patch: patchC } = C

  // In Duo, with the calendar open, this sheet turns to the left page
  // (November | calendar). Written like data-fold-mode: from the layout, and
  // when the calendar crosses halfway.
  const markDuoPage = useCallback(() => {
    const el = currentRef.current
    if (!el) return
    if (modeRef.current === 'duo' && hasCalRef.current && mC.current.open) el.dataset.duoPage = 'left'
    else delete el.dataset.duoPage
  }, [mC])

  // ---------- geometry ----------
  // Beside the page ('h', 'duo') the edges and the companions are pinned
  // under the top bar, as tall as the room allows, so a long page scrolls
  // past them and only a sheet's own list scrolls under the pointer (Scott,
  // 2026-11-04: "the week scrolls while everything else remains fixed"). The
  // room is the scroller's: its height, less the landscape standing at its
  // foot (--scenery-clearance) and the bar docked under it (--dock-clearance),
  // as useColumnsFitWindow measures the planning columns. The top bar's height
  // is --paper-fold-sticky-top (72px, level with the horizon strip), with
  // --paper-fold-sticky-gap (24px) left below. On a phone ('v') the companions
  // fold from the top and bottom edges, capped, and are not pinned.
  const pinSheet = useCallback((mode: FoldMode | '') => {
    const root = rootRef.current
    if (!root || !mode) return
    const pins = [pinRef.current, calPinRef.current].filter((x): x is HTMLDivElement => !!x)
    if (mode === 'v') {
      for (const pin of pins) {
        pin.style.position = ''
        pin.style.top = ''
        pin.style.height = ''
        pin.style.maxHeight = ''
      }
      return
    }
    const cs = getComputedStyle(root)
    const top = parseFloat(cs.getPropertyValue('--paper-fold-sticky-top')) || 72
    const gap = parseFloat(cs.getPropertyValue('--paper-fold-sticky-gap')) || 24
    const scroller = scrollParent(root)
    const prop = (name: string) => {
      if (!scroller) return 0
      return parseFloat(scroller.style.getPropertyValue(name) || getComputedStyle(scroller).getPropertyValue(name)) || 0
    }
    const room = (scroller?.clientHeight || innerHeight) - top - prop('--scenery-clearance') - prop('--dock-clearance') - gap
    for (const pin of pins) {
      pin.style.position = 'sticky'
      pin.style.top = `${top}px`
      pin.style.height = `${Math.max(160, Math.round(room))}px`
      pin.style.maxHeight = '100%'
    }
  }, [])

  const layout = useCallback(() => {
    const root = rootRef.current
    const flap = flapRef.current
    if (!root || !flap) return
    const calFlap = hasCalRef.current ? calFlapRef.current : null
    const a = mA.current
    const c = mC.current
    const was = modeRef.current
    const mode = detectFoldMode({
      width: innerWidth,
      height: innerHeight,
      coarse: mm('(pointer: coarse)'),
      segments: mm('(horizontal-viewport-segments: 2)'),
    })
    modeRef.current = mode
    root.dataset.foldMode = mode
    pinSheet(mode)

    let spread = 0
    const parent = root.parentElement
    if (parent) {
      const cs = getComputedStyle(parent)
      spread =
        parent.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)
    }
    if (!(spread > 0)) spread = innerWidth - 32
    const sizes = foldSizes(mode, spread, innerHeight, { calendar: !!calFlap })
    bothRef.current = sizes.both
    patchA({ edge: sizes.edge })
    patchC({ edge: sizes.edge })
    const folded = { p: 0, v: 0, target: 0, landed: true } as const

    // Two open on a spread with room for one: one keeps its place (keepsOpen).
    const settleOne = () => {
      if (sizes.both || a.target !== 1 || c.target !== 1) return
      const [stop, patch] = keepsOpen(driveRef.current) === 'calendar' ? [stopA, patchA] : [stopC, patchC]
      stop()
      patch(folded)
    }
    const applyBoth = () => {
      applyA(a.p)
      applyC(c.p)
    }

    if (mode === 'duo') {
      flap.style.height = ''
      patchA({ W: sizes.above })
      flap.style.width = `${sizes.above}px`
      if (calFlap) {
        calFlap.style.height = ''
        patchC({ W: sizes.calendar })
        calFlap.style.width = `${sizes.calendar}px`
      }
      root.style.setProperty('--paper-fold-half', `${sizes.current}px`)
      // Opening the phone opens the sheet; closing it folds the sheet away.
      if (was && was !== 'duo') {
        applyBoth()
        goA(1, { remember: false })
        markDuoPage()
        return
      }
      // Mounting in Duo keeps what the reader left; with nothing remembered
      // (and the calendar not open), the book opens on the sheet above.
      if (!was && !hasStored(aboveKey) && c.target !== 1) patchA({ p: 1, target: 1 })
      settleOne()
      applyBoth()
      markDuoPage()
      return
    }
    if (was === 'duo') {
      stopA()
      stopC()
      patchA(folded)
      patchC(folded)
    }
    if (mode === 'v') {
      // Faces are absolutely placed, so an auto-height flap collapses and the
      // scroll box reports its content's full height.
      const measure = (fl: HTMLDivElement, box: HTMLDivElement | null, patch: typeof patchA) => {
        fl.style.width = ''
        fl.style.height = 'auto'
        const inner = box?.scrollHeight ?? 0
        const H = Math.max(sizes.edge + 1, Math.min(inner + 2, sizes.maxAboveHeight))
        patch({ H })
        fl.style.height = `${H}px`
      }
      measure(flap, scrollRef.current, patchA)
      if (calFlap) measure(calFlap, calScrollRef.current, patchC)
    } else {
      flap.style.height = ''
      patchA({ W: sizes.above })
      flap.style.width = `${sizes.above}px`
      if (calFlap) {
        calFlap.style.height = ''
        patchC({ W: sizes.calendar })
        calFlap.style.width = `${sizes.calendar}px`
      }
      root.style.setProperty('--paper-fold-cur', `${sizes.current}px`)
    }
    settleOne()
    applyBoth()
    markDuoPage()
  }, [aboveKey, mA, mC, applyA, applyC, goA, stopA, stopC, patchA, patchC, pinSheet, markDuoPage])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (root) {
      const grain = paperGrain(getComputedStyle(root).getPropertyValue('--paper-fold-grain-alpha'))
      if (grain) root.style.setProperty('--paper-fold-grain', grain)
    }
    layout()
  }, [layout, hasCal])

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      clearTimeout(t)
      t = setTimeout(layout, 80)
    }
    addEventListener('resize', onResize)
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      const parent = rootRef.current?.parentElement
      const aboveBody = aboveBodyRef.current
      const calBody = calBodyRef.current
      // The parent grows with the spread every animation frame (in 'v' the slot's
      // height changes; in 'h' its width), so react only to what the layout reads:
      // the parent's width, and each companion's content height in 'v'. The parent
      // must not size itself to the fold (no shrink-to-fit), or the spread would
      // feed back into its own measure.
      ro = new ResizeObserver((entries) => {
        const r = seen.current
        let changed = false
        for (const e of entries) {
          if (e.target === parent) {
            const w = e.contentRect.width
            if (!(Math.abs(w - r.parentW) < 0.5)) changed = true
            r.parentW = w
          } else if (e.target === aboveBody || e.target === calBody) {
            const h = e.contentRect.height
            const k = e.target === aboveBody ? 'aboveH' : 'calH'
            if (!(Math.abs(h - r[k]) < 0.5) && modeRef.current === 'v') changed = true
            r[k] = h
          }
        }
        if (changed) layout()
      })
      if (parent) ro.observe(parent)
      if (aboveBody) ro.observe(aboveBody)
      if (calBody) ro.observe(calBody)
    }
    return () => {
      clearTimeout(t)
      removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [layout, hasCal])

  // The pinned sheets' room changes with their scroller: the scroller resizing,
  // and the landscape writing its height (--scenery-clearance) onto the
  // scroller's style after it lays out, and again when the place changes.
  useEffect(() => {
    const root = rootRef.current
    const scroller = root && scrollParent(root)
    if (!scroller) return
    const repin = () => pinSheet(modeRef.current)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(repin) : null
    ro?.observe(scroller)
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(repin) : null
    mo?.observe(scroller, { attributes: true, attributeFilter: ['style'] })
    return () => {
      ro?.disconnect()
      mo?.disconnect()
    }
  }, [pinSheet])

  // ---------- driven by the page ----------
  // Declarative (fix round 1): whenever the page's word changes, each
  // companion goes to the page's word if it gave one, else to what the reader
  // left. On a spread with room for one, only one opens (keepsOpen): a driven
  // key beats a remembered one, and with both driven the calendar wins. The
  // other folds quietly first, so the only sound is the one that opens. Nothing
  // is remembered on the way; `go` does nothing for a companion already there.
  const driveAbove = drive?.above
  const driveCal = drive?.calendar
  const prevDrive = useRef<Drive>({})
  useEffect(() => {
    const prev = prevDrive.current
    driveRef.current = { above: driveAbove, calendar: driveCal }
    prevDrive.current = { above: driveAbove, calendar: driveCal }
    // The reader's own fold: never driven, nothing to hand back.
    if (driveAbove === undefined && driveCal === undefined && prev.above === undefined && prev.calendar === undefined) return
    let wantA = driveAbove ?? readStored(aboveKey)
    let wantC = hasCal && (driveCal ?? readStored(calKey))
    if (!bothRef.current && wantA && wantC) {
      if (keepsOpen(driveRef.current) === 'calendar') wantA = false
      else wantC = false
    }
    const fold: GoOptions = { remember: false, quiet: true }
    const unfold: GoOptions = { remember: false }
    if (!wantA) goA(0, fold)
    if (!wantC) goC(0, fold)
    if (wantA) goA(1, unfold)
    if (wantC) goC(1, unfold)
  }, [driveAbove, driveCal, hasCal, aboveKey, calKey, goA, goC])

  const open = A.open
  const calOpen = hasCal && C.open
  useLayoutEffect(markDuoPage, [markDuoPage, calOpen])
  const countPart = edgeCount === undefined ? '' : `, ${edgeCount} open`
  const edgeName = open ? `Fold ${edgeLabel} away` : `${edgeLabel}${countPart}. Unfold to read`
  const calName = calOpen ? `Fold ${calendarLabel} away` : `${calendarLabel}. Unfold to read`

  return (
    <div
      ref={rootRef}
      className={['paper-fold', className].filter(Boolean).join(' ')}
      data-horizon={horizon}
      data-open={open ? 'true' : 'false'}
      data-calendar-open={hasCal ? (calOpen ? 'true' : 'false') : undefined}
      data-stowed={stowed ? 'true' : undefined}
    >
      <div ref={slotRef} className="paper-fold-slot" data-open={open ? 'true' : 'false'} hidden={stowed}>
        <div ref={pinRef} className="paper-fold-pin">
          <button
            type="button"
            className="paper-fold-edge"
            aria-expanded={open}
            aria-controls={frontId}
            aria-label={edgeName}
            {...A.handlers}
          >
            <Chevron d="M10 3 5 8l5 5" />
            <span className="paper-fold-edge-label">{edgeLabel}</span>
            {edgeCount !== undefined && <span className="paper-fold-edge-count">{edgeCount}</span>}
          </button>
          <div ref={flapRef} className="paper-fold-flap">
            <section
              id={frontId}
              className="paper-fold-face paper-fold-front"
              aria-label={frontLabel ?? `${edgeLabel}, for reading`}
              inert={!open}
              aria-hidden={!open}
            >
              <div ref={scrollRef} className="paper-fold-scroll" style={{ overscrollBehavior: 'contain' }}>
                <div ref={aboveBodyRef} className="paper-fold-above">
                  {above}
                </div>
              </div>
            </section>
            <div className="paper-fold-face paper-fold-back" aria-hidden="true" />
            <button
              type="button"
              className="paper-fold-grip"
              aria-label="Fold the sheet away"
              aria-hidden={!open}
              tabIndex={open ? 0 : -1}
              {...A.handlers}
            />
          </div>
        </div>
      </div>
      <article ref={currentRef} className="paper-fold-current">
        {children}
      </article>
      {hasCal && (
        <div
          ref={calSlotRef}
          className="paper-fold-slot paper-fold-slot--calendar"
          data-open={calOpen ? 'true' : 'false'}
          hidden={stowed}
        >
          <div ref={calPinRef} className="paper-fold-pin">
            <button
              type="button"
              className="paper-fold-edge"
              aria-expanded={calOpen}
              aria-controls={calId}
              aria-label={calName}
              {...C.handlers}
            >
              <Chevron d="M6 3l5 5-5 5" />
              <span className="paper-fold-edge-label">{calendarLabel}</span>
            </button>
            <div ref={calFlapRef} className="paper-fold-flap">
              <section
                id={calId}
                className="paper-fold-face paper-fold-front"
                aria-label={`${calendarLabel}, for reading`}
                inert={!calOpen}
                aria-hidden={!calOpen}
              >
                <div ref={calScrollRef} className="paper-fold-scroll" style={{ overscrollBehavior: 'contain' }}>
                  <div ref={calBodyRef} className="paper-fold-cal-body">
                    {calendar}
                  </div>
                </div>
              </section>
              <div className="paper-fold-face paper-fold-back" aria-hidden="true" />
              <button
                type="button"
                className="paper-fold-grip"
                aria-label="Fold the calendar away"
                aria-hidden={!calOpen}
                tabIndex={calOpen ? 0 : -1}
                {...C.handlers}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
