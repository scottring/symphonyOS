import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Final review (2026-11-04): the session tray under the Week's days reused
// the strip's No day yet markup without the strip's CSS (every row rule was
// scoped to .hs), so its rows fell back to the 3-column chip grid. Checked on
// a fixture page; jsdom reads no stylesheets, so the rules are read here.
const css = readFileSync('src/components/canvas/strip/horizonStrip.css', 'utf8')

describe('the session tray reads like the strip’s No day yet', () => {
  it('no No day yet row rule is scoped to the strip alone', () => {
    expect(css).not.toMatch(/(^|\n)\s*\.hs \.wc-noday/)
    for (const part of ['.wc-noday-chips.hs-noday', '.wc-noday-chip {', '.wc-noday-open {', '.wc-noday-actions {']) {
      expect(css).toContain(`:is(.hs, .wc-session-week) ${part}`)
    }
    expect(css).toMatch(/:is\(\.hs, \.wc-session-week\) \.wc-noday-chip:not\(:hover\)[^{]*\.hs-when \{ opacity: 0; \}/)
  })
  it('the tray stacks its parts as the strip’s body does', () => {
    expect(/\.wc-session-week \{[^}]*\}/.exec(css)![0]).toMatch(/display: flex; flex-direction: column; gap: 10px;/)
  })
})
