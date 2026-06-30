import { describe, it, expect } from 'vitest'
import { shouldDismissPanel, shouldCloseStaleEventPanel } from './TaskDetailPanel'

/**
 * Regression guard for the "card buttons only work when the detail pane is
 * closed" bug: PanelChrome's document mousedown listener closed the panel on any
 * click outside the panel <aside>, including card action buttons (Reschedule,
 * Add Project, ⋯, Context) and their popovers. The panel must stay open through
 * those interactions and only dismiss on genuinely neutral chrome.
 */
describe('shouldDismissPanel', () => {
  function el(html: string): HTMLElement {
    const host = document.createElement('div')
    host.innerHTML = html
    return host.firstElementChild as HTMLElement
  }

  it('does NOT dismiss when the panel itself is clicked', () => {
    const panel = el('<aside><span id="inner">x</span></aside>')
    const inner = panel.querySelector('#inner') as HTMLElement
    expect(shouldDismissPanel(inner, panel)).toBe(false)
  })

  it('does NOT dismiss when a card action button is clicked', () => {
    // e.g. the Reschedule / Add Project / ⋯ trigger, or an icon inside it
    const button = el('<button aria-label="Reschedule"><svg></svg></button>')
    const icon = button.querySelector('svg') as unknown as HTMLElement
    expect(shouldDismissPanel(button, null)).toBe(false)
    expect(shouldDismissPanel(icon, null)).toBe(false)
  })

  it('does NOT dismiss when a portaled popover menu item is clicked', () => {
    const menuItem = el('<div role="menu"><button>Tomorrow</button></div>')
      .querySelector('button') as HTMLElement
    expect(shouldDismissPanel(menuItem, null)).toBe(false)
  })

  it('does NOT dismiss when another selectable card row is clicked', () => {
    const row = el('<div data-selectable><span id="t">Title</span></div>')
    const title = row.querySelector('#t') as HTMLElement
    expect(shouldDismissPanel(title, null)).toBe(false)
  })

  it('DOES dismiss when neutral background chrome is clicked', () => {
    const bg = el('<div class="page-bg"></div>')
    expect(shouldDismissPanel(bg, null)).toBe(true)
  })

  it('returns false for a null target', () => {
    expect(shouldDismissPanel(null, null)).toBe(false)
  })
})

/**
 * Regression guard for the "event detail panel stuck on Loading…" bug: when a
 * calendar event is rescheduled to another day (or deleted), it leaves the
 * day-scoped `events` set but its id stays in ?detail=event:<id>, so the lookup
 * returns undefined. The panel must close instead of hanging on "Loading…" —
 * but only once the calendar has settled and the day has loaded events.
 */
describe('shouldCloseStaleEventPanel', () => {
  const base = { found: false, isFetching: false, isLoading: false, eventCount: 3 }

  it('closes when the event is gone, calendar settled, and the day has events', () => {
    expect(shouldCloseStaleEventPanel(base)).toBe(true)
  })

  it('does NOT close while the event is still found', () => {
    expect(shouldCloseStaleEventPanel({ ...base, found: true })).toBe(false)
  })

  it('does NOT close while a fetch is in flight', () => {
    expect(shouldCloseStaleEventPanel({ ...base, isFetching: true })).toBe(false)
  })

  it('does NOT close while the calendar is loading', () => {
    expect(shouldCloseStaleEventPanel({ ...base, isLoading: true })).toBe(false)
  })

  it('does NOT close on the pre-fetch tick when no events have loaded yet', () => {
    // Guards a fresh deep-link (?detail=event:x) from closing before the day's
    // first fetch resolves.
    expect(shouldCloseStaleEventPanel({ ...base, eventCount: 0 })).toBe(false)
  })
})
