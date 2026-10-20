import { describe, expect, it } from 'vitest'
import { SCENE_HOLD_MS, dayAnchors, heldScreen, kioskScreen, sceneChoices, type KioskScreen } from './kioskScreen'

// The household's routines as rebuilt 2026-10-13: School morning 6:45–7:20,
// Home from school 5:45 (pickup leaves 5:15), bedtime 7:30 → lights out 8:30.
const schoolMorning = { timeOfDay: '06:45', rows: [{ timeOfDay: '06:45' }, { timeOfDay: null }, { timeOfDay: '07:15' }, { timeOfDay: '07:20' }] }
const homeFromSchool = { timeOfDay: '17:45', rows: [{ timeOfDay: null }] }
const bedtime = { timeOfDay: '19:30', rows: [{ timeOfDay: '19:30' }, { timeOfDay: '20:00' }, { timeOfDay: '20:15' }, { timeOfDay: '20:30' }] }
const dinnerAt = new Date(2026, 9, 13, 18, 0)
const at = (h: number, m: number, day = 13) => new Date(2026, 9, day, h, m)

describe('which screen leads the wall', () => {
  const tuesday = dayAnchors([schoolMorning, homeFromSchool, bedtime], dinnerAt)

  it('reads the times from the routines', () => {
    expect(tuesday).toEqual({ morning: { start: 405, end: 440 }, home: { start: 1035 }, dinner: 1080, bedtime: { start: 1170, end: 1230 } })
  })

  it('walks a school day', () => {
    const pick = (h: number, m: number) => kioskScreen(at(h, m), tuesday)
    expect(pick(6, 20)).toMatchObject({ screen: 'night', dark: true })
    expect(pick(6, 58)).toEqual({ screen: 'out-the-door', title: 'Out the door in 22 minutes', dark: false })
    expect(pick(7, 24).screen).toBe('out-the-door')
    expect(pick(10, 40)).toEqual({ screen: 'rest', title: 'A quiet morning', dark: false })
    expect(pick(14, 0).title).toBe('A quiet afternoon')
    expect(pick(17, 20)).toMatchObject({ screen: 'home', title: 'Home from school' })
    expect(pick(18, 12)).toMatchObject({ screen: 'dinner', dark: false })
    expect(pick(19, 10)).toMatchObject({ screen: 'rest', title: 'This evening', dark: true })
    expect(pick(19, 52)).toEqual({ screen: 'bedtime', title: 'Bedtime · lights out in 38 min', dark: true })
    expect(pick(21, 15)).toMatchObject({ screen: 'night', title: 'Goodnight' })
  })

  it('a day without a school morning is a weekend day until dinner', () => {
    const saturday = dayAnchors([bedtime], null)
    expect(kioskScreen(at(9, 5, 17), saturday)).toEqual({ screen: 'weekend', title: 'Saturday', dark: false })
    expect(kioskScreen(at(18, 10, 17), saturday).screen).toBe('dinner')
  })

  it('falls back to sensible times when a day has no routines at all', () => {
    const none = dayAnchors([], null)
    expect(none.bedtime).toEqual({ start: 1170, end: 1230 })
    expect(kioskScreen(at(5, 30), none).screen).toBe('night')
  })
})

// Scott, 2026-10-20: "if we're eating dinner late … we need a way to manually
// go back to the previous scene". A tapped scene holds until the clock's own
// scene changes or 30 minutes pass, whichever comes first.
describe('a scene held by hand', () => {
  const tuesday = dayAnchors([schoolMorning, homeFromSchool, bedtime], dinnerAt)
  const clock = (h: number, m: number) => kioskScreen(at(h, m), tuesday)
  const holdAt = (screen: KioskScreen, h: number, m: number) =>
    ({ screen, at: at(h, m).getTime(), clockScreen: clock(h, m).screen })

  it('offers the day’s scenes in order: a school day, then a weekend day', () => {
    expect(sceneChoices(tuesday)).toEqual(['out-the-door', 'home', 'dinner', 'bedtime'])
    expect(sceneChoices(dayAnchors([bedtime], null))).toEqual(['weekend', 'dinner', 'bedtime'])
  })

  it('shows dinner again after the clock has moved on', () => {
    const hold = holdAt('dinner', 19, 5)
    expect(heldScreen(clock(19, 10), hold, at(19, 10))).toEqual({ pick: { screen: 'dinner', title: 'Dinner', dark: false }, held: true })
  })

  it('lets go when the clock’s own scene changes', () => {
    const hold = holdAt('dinner', 19, 5)
    expect(heldScreen(clock(19, 30), hold, at(19, 30))).toEqual({ pick: clock(19, 30), held: false })
  })

  it('lets go after 30 minutes even if the clock’s scene has not changed', () => {
    const hold = holdAt('out-the-door', 10, 0)
    const later = new Date(hold.at + SCENE_HOLD_MS)
    expect(heldScreen(clock(10, 29), hold, at(10, 29)).held).toBe(true)
    expect(heldScreen(clock(10, 30), hold, later)).toEqual({ pick: clock(10, 30), held: false })
  })

  it('holding the scene the clock already shows is no hold at all', () => {
    const hold = holdAt('dinner', 18, 10)
    expect(heldScreen(clock(18, 15), hold, at(18, 15))).toEqual({ pick: clock(18, 15), held: false })
  })

  it('names a held scene plainly, without the clock’s countdowns', () => {
    expect(heldScreen(clock(10, 0), holdAt('out-the-door', 10, 0), at(10, 0)).pick).toEqual({ screen: 'out-the-door', title: 'Out the door', dark: false })
    expect(heldScreen(clock(10, 0), holdAt('home', 10, 0), at(10, 0)).pick).toEqual({ screen: 'home', title: 'Home from school', dark: false })
    expect(heldScreen(clock(10, 0), holdAt('bedtime', 10, 0), at(10, 0)).pick).toEqual({ screen: 'bedtime', title: 'Bedtime', dark: true })
    const saturday = dayAnchors([bedtime], null)
    const sat = kioskScreen(at(19, 10, 17), saturday)
    expect(heldScreen(sat, { screen: 'weekend', at: at(19, 10, 17).getTime(), clockScreen: sat.screen }, at(19, 10, 17)).pick)
      .toEqual({ screen: 'weekend', title: 'Saturday', dark: false })
  })
})
