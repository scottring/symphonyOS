import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Final review (2026-11-04): the Plan ribbon covered the first row on Month
// and "+ Add task" on Today. Ruling: it hangs above the sheet's top edge and
// reaches at most 18px into the sheet's top padding, never over text or
// controls. jsdom lays nothing out, so the placement rules are read from the
// stylesheet; the pages were checked on real data at 1319px and 390px.
const css = readFileSync('src/components/guide/ribbon.css', 'utf8')
const rule = (selector: string) => {
  const at = css.indexOf(`${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at))
}
const px = (s: string) => Number(/(-?\d+)px/.exec(s)?.[1])

describe('the Plan ribbon hangs above its sheet', () => {
  it('pins its foot at the host’s top plus a reach of at most 18px, so it grows upward', () => {
    const tab = rule('.ribbon-tab')
    expect(tab).toMatch(/top: auto; bottom: calc\(100% - var\(--ribbon-reach, 0px\)\)/)
    expect(tab).not.toMatch(/top: -6px/)
  })
  it('a period’s list sits 34px under the sheet’s edge: the foot reaches 18px into it', () => {
    const reach = px(rule('.plan-sheet.ribbon-host').split('--ribbon-reach:')[1])
    expect(34 + reach).toBeLessThanOrEqual(18)
    expect(34 + reach).toBeGreaterThan(0)
  })
  it('Today’s hangs in the page’s right margin, clear of the masthead’s controls', () => {
    expect(rule('.today-ribbon-host > .ribbon-tab')).toMatch(/left: auto; right: -\d+px/)
    expect(readFileSync('src/components/schedule/TodayView.tsx', 'utf8')).toContain('ribbon-host today-ribbon-host')
  })
  it('on a phone it is only an 18px foot inside the top padding of a period’s sheet or the week', () => {
    const phone = css.slice(css.lastIndexOf('@media (max-width: 760px)'))
    expect(phone).toMatch(/\.plan-sheet\.ribbon-host > \.ribbon-tab \{ top: 0; bottom: auto; \}/)
    expect(phone).toMatch(/\.wc-phone\.ribbon-host:has\(> \.ribbon-tab\) \{ padding-top: 18px; --ribbon-reach: 18px; \}/)
    expect(phone).toMatch(/height: 18px; min-height: 0/)
  })
  it('Today’s masthead line wraps in its column instead of running under Plan today and ⋯', () => {
    const today = readFileSync('src/styles/canvas-today.css', 'utf8')
    expect(/\.today-sentence-meta \{[^}]*\}/.exec(today)![0]).toContain('white-space: normal')
  })
})
