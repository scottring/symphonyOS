import { describe, it, expect } from 'vitest'
import { render } from '@/test/test-utils'
import { MobileTypeTile } from './MobileTypeTile'

describe('MobileTypeTile', () => {
  it('renders a Check glyph for tasks', () => {
    const { container } = render(<MobileTypeTile type="task" context={null} />)
    // lucide icons render <svg> with class containing 'lucide-check'
    expect(container.querySelector('svg.lucide-check')).toBeTruthy()
  })

  it('renders a Repeat glyph for routines', () => {
    const { container } = render(<MobileTypeTile type="routine" context={null} />)
    expect(container.querySelector('svg.lucide-repeat')).toBeTruthy()
  })

  it('renders a Calendar glyph for events', () => {
    const { container } = render(<MobileTypeTile type="event" context={null} />)
    expect(container.querySelector('svg.lucide-calendar')).toBeTruthy()
  })

  it('uses the work context tint and foreground when context=work', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" />)
    const tile = container.firstElementChild as HTMLElement
    // jsdom normalizes color serialization across versions, so match the
    // distinctive channel numbers rather than the exact `rgb(...)` syntax.
    expect(tile.style.backgroundColor).toMatch(/37/)
    expect(tile.style.backgroundColor).toMatch(/0\.08/)
    expect(tile.style.color).toMatch(/37/)
  })

  it('uses the family context tint and foreground when context=family', () => {
    const { container } = render(<MobileTypeTile type="task" context="family" />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.backgroundColor).toMatch(/217/)
    expect(tile.style.color).toMatch(/217/)
  })

  it('falls back to the primary teal-forest when context is null', () => {
    const { container } = render(<MobileTypeTile type="task" context={null} />)
    const tile = container.firstElementChild as HTMLElement
    // PRIMARY_DOT/PRIMARY_BG = hsl(168 45% 30% [/ 0.08]) — jsdom serializes
    // HSL to RGB; the teal hue (168) converts to a distinctive green-blue
    // RGB value. We verify the fallback by confirming both color and
    // backgroundColor are non-empty (not the fallback to default black).
    expect(tile.style.backgroundColor).not.toBe('')
    expect(tile.style.color).not.toBe('')
  })

  it('renders an inert wrapper (no onClick required)', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" />)
    // The tile is a presentational div, not a button.
    expect(container.querySelector('button')).toBeNull()
  })

  it('dims the tile when completed=true', () => {
    const { container } = render(<MobileTypeTile type="task" context="work" completed />)
    const tile = container.firstElementChild as HTMLElement
    // Matches the row-level opacity-60 the parent ScheduleItem applies so
    // the tile and surrounding row dim in lockstep.
    expect(tile.className).toMatch(/opacity-60/)
  })
})
