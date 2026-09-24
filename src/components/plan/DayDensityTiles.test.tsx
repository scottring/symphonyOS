import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DayDensityTiles } from './DayDensityTiles'
import { dayDensity, densityScale, DENSITY_SEGMENTS, type DensityItem } from '@/lib/planning/dayDensity'

const nov = (d: number) => new Date(2026, 10, d)
const items = (n: number, kind: DensityItem['kind'] = 'task'): DensityItem[] =>
  Array.from({ length: n }, (_, i) => ({ kind, id: `${kind}${i}` }))

const week = [
  { date: nov(8), label: 'Sun', dateLabel: 'Nov 8', density: dayDensity(nov(8), []) },
  { date: nov(9), label: 'Mon', dateLabel: 'Nov 9', density: dayDensity(nov(9), [...items(2, 'event'), ...items(1)]) },
  { date: nov(10), label: 'Tue', dateLabel: 'Nov 10', density: dayDensity(nov(10), items(6)) },
  { date: nov(11), label: 'Wed', dateLabel: 'Nov 11', density: dayDensity(nov(11), [], false) },
]

const show = (over: Partial<Parameters<typeof DayDensityTiles>[0]> = {}) => {
  const onPick = vi.fn()
  render(
    <DayDensityTiles
      days={week}
      level={densityScale(week.map((d) => d.density)).level}
      heading="A day in Nov 8 – 14"
      onPick={onPick}
      {...over}
    />,
  )
  return { onPick }
}

describe('DayDensityTiles', () => {
  // Scott: the days offered are the ones in VIEW. A November row must not be
  // quietly handed today's week.
  it('offers the dated days it was given, each with its real date', () => {
    show()
    expect(screen.getByText('A day in Nov 8 – 14')).toBeInTheDocument()
    for (const { label, dateLabel } of week) {
      const tile = screen.getByRole('menuitemradio', { name: new RegExp(`${label}, ${dateLabel}`) })
      expect(within(tile).getByText(dateLabel)).toBeInTheDocument()
    }
  })

  it('writes the day that was pressed', () => {
    const { onPick } = show()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Mon, Nov 9/ }))
    expect(onPick).toHaveBeenCalledWith(nov(9))
  })

  // The requirement Scott was explicit about: relative density of things, not
  // an hours or capacity forecast. Nothing on a tile may say otherwise.
  it('speaks counts, never hours or a percentage', () => {
    show()
    const mon = screen.getByRole('menuitemradio', { name: /Mon, Nov 9/ })
    expect(mon).toHaveAccessibleName(/2 events and 1 task already/)
    for (const tile of screen.getAllByRole('menuitemradio')) {
      expect(tile.getAttribute('aria-label')).not.toMatch(/%|percent|hour|booked|free|capacity|full/i)
    }
    expect(document.body.textContent).not.toMatch(/%|hours? booked|capacity/i)
  })

  it('draws the busiest day fullest, and an empty day not at all', () => {
    show()
    // The bar is decorative, so count its filled segments directly.
    const segs = (name: RegExp) => {
      const tile = screen.getByRole('menuitemradio', { name })
      return [...tile.querySelectorAll('span.h-1')].filter((s) => /bg-primary/.test(s.className)).length
    }
    expect(segs(/Tue, Nov 10/)).toBe(DENSITY_SEGMENTS)
    expect(segs(/Mon, Nov 9/)).toBeGreaterThan(0)
    expect(segs(/Mon, Nov 9/)).toBeLessThan(DENSITY_SEGMENTS)
    expect(segs(/Sun, Nov 8/)).toBe(0)
  })

  // An empty day and a day we could not read are different answers.
  it('says a day is unknown rather than drawing it empty', () => {
    show()
    expect(screen.getByRole('menuitemradio', { name: /Wed, Nov 11/ }))
      .toHaveAccessibleName(/hasn’t loaded yet/)
    expect(screen.getByRole('menuitemradio', { name: /Sun, Nov 8/ }))
      .toHaveAccessibleName(/nothing on it yet/)
    const unknown = screen.getByRole('menuitemradio', { name: /Wed, Nov 11/ })
    expect(unknown.querySelectorAll('span.border-dashed').length).toBe(DENSITY_SEGMENTS)
  })

  it('marks the day the task is already on', () => {
    show({ days: week.map((d, i) => (i === 1 ? { ...d, current: true } : d)) })
    expect(screen.getByRole('menuitemradio', { name: /Mon, Nov 9/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: /Tue, Nov 10/ })).toHaveAttribute('aria-checked', 'false')
  })
})
