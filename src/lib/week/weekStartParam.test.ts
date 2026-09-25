import { describe, it, expect } from 'vitest'
import { weekRangeFromParams, weekStartParam } from './weekStartParam'
import { weekRangeFromStartParam } from '@/lib/planning/dateRange'

describe('weekStartParam', () => {
  // S2-25: the week paged to lived only in component state, so a reload — or
  // coming back from a task — re-derived it from today and returned you to
  // this week. The week has to be IN the URL for the page to keep its place.
  it('writes the week being shown, and that week reads back unchanged', () => {
    const anchor = new Date(2026, 8, 20)
    const next = weekStartParam('week', 7, '', anchor)!
    expect(next.get('start')).toBe('2026-09-20')
    expect(weekRangeFromStartParam(next.get('start'), 0)![0]).toEqual(anchor)
  })

  it('keeps the rest of the query, and replaces a stale start', () => {
    const next = weekStartParam('week', 7, '?detail=t1&start=2026-09-06', new Date(2026, 8, 20))!
    expect(next.get('detail')).toBe('t1')
    expect(next.get('start')).toBe('2026-09-20')
  })


  it('leaves the URL alone on views that never read start', () => {
    expect(weekStartParam('workweek', 7, '', new Date(2026, 8, 20))).toBeNull()
    expect(weekStartParam('today', 7, '', new Date(2026, 8, 20))).toBeNull()
    expect(weekStartParam(undefined, 7, '', new Date(2026, 8, 20))).toBeNull()
  })

  // A weekend or a custom run used to write nothing, because `start` alone
  // would reopen it as a full week — so a paged weekend came back as THIS
  // weekend on reload, and a custom run as the week. It now carries its kind
  // and length, and reads back as exactly the days that were on screen.
  describe('runs other than the calendar week', () => {
    const ymds = (days: Date[]) => days.map((d) => `${d.getMonth() + 1}/${d.getDate()}`)
    const today = new Date(2026, 8, 23)

    it('a weekend paged to a later weekend reopens on that weekend, not this one', () => {
      const saturday = new Date(2026, 9, 3)
      const next = weekStartParam('week', 2, '?range=weekend', saturday, 0)!
      expect(next.get('range')).toBe('weekend')
      expect(next.get('start')).toBe('2026-10-03')
      expect(next.get('days')).toBe('2')
      expect(ymds(weekRangeFromParams(next, 0, today))).toEqual(['10/3', '10/4'])
    })

    it('a custom run reopens as that run, not as the full week', () => {
      const thursday = new Date(2026, 9, 1)
      const next = weekStartParam('week', 4, '?range=custom&detail=t1', thursday, 0)!
      expect(next.get('range')).toBe('custom')
      expect(next.get('detail')).toBe('t1')
      expect(ymds(weekRangeFromParams(next, 0, today))).toEqual(['10/1', '10/2', '10/3', '10/4'])
    })

    it('a seven-day run that does not start the week keeps its own start', () => {
      const thursday = new Date(2026, 9, 1)
      const next = weekStartParam('week', 7, '', thursday, 0)!
      expect(next.get('range')).toBe('custom')
      expect(next.get('days')).toBe('7')
      expect(weekRangeFromParams(next, 0, today)[0]).toEqual(thursday)
    })

    it('three days is named as three days, whatever it starts on', () => {
      const next = weekStartParam('week', 3, '', new Date(2026, 8, 30), 0)!
      expect(next.get('range')).toBe('three')
      expect(ymds(weekRangeFromParams(next, 0, today))).toEqual(['9/30', '10/1', '10/2'])
    })

    it('two days that are not Sat–Sun are a custom run, not a weekend', () => {
      expect(weekStartParam('week', 2, '', new Date(2026, 9, 5), 0)!.get('range')).toBe('custom')
    })

    // Back to the calendar week: the leftover kind must go, or it would
    // outvote `start` and reopen the old weekend.
    it('returning to the calendar week drops the range and days it no longer has', () => {
      const next = weekStartParam('week', 7, '?range=weekend&start=2026-10-03&days=2', new Date(2026, 8, 27), 0)!
      expect(next.get('range')).toBeNull()
      expect(next.get('days')).toBeNull()
      expect(next.get('start')).toBe('2026-09-27')
    })

    it('honours a Monday week start when deciding what is the calendar week', () => {
      const monday = new Date(2026, 8, 28)
      expect(weekStartParam('week', 7, '', monday, 1)!.get('range')).toBeNull()
      expect(weekStartParam('week', 7, '', monday, 0)!.get('range')).toBe('custom')
    })
  })

  describe('weekRangeFromParams keeps the links that already exist', () => {
    const wednesday = new Date(2026, 8, 23)
    it('start alone is the calendar week around it', () => {
      const days = weekRangeFromParams(new URLSearchParams('start=2026-10-01'), 0, wednesday)
      expect(days).toHaveLength(7)
      expect(days[0]).toEqual(new Date(2026, 8, 27))
    })
    it('a bare preset is the next such run from today', () => {
      const days = weekRangeFromParams(new URLSearchParams('range=weekend'), 0, wednesday)
      expect(days.map((d) => d.getDate())).toEqual([26, 27])
      expect(weekRangeFromParams(new URLSearchParams('range=three'), 0, wednesday)).toHaveLength(3)
    })
    it('no parameters, a bare custom request, or nonsense days is this week', () => {
      for (const q of ['', 'range=custom', 'start=2026-10-01&days=0', 'start=2026-10-01&days=12']) {
        expect(weekRangeFromParams(new URLSearchParams(q), 0, wednesday)).toHaveLength(7)
      }
    })
  })
})
