import { describe, it, expect } from 'vitest'
import { shouldDismissPanel } from './TaskDetailPanel'

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
