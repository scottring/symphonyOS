import { describe, it, expect } from 'vitest'
import { createMockRoutine } from '@/test/mocks/factories'
import type { Routine } from '@/types/actionable'
import type { FamilyMember } from '@/types/family'
import type { Layer } from '@/lib/domains'
import { explainRoutine, daysText, explanationSummary, ROUTINE_HIDE_LABELS } from './explain'

/** Wednesday 2026-10-14. Fixed so the suite never rots on the wall clock. */
const WED = new Date(2026, 9, 14, 9, 0, 0)
/** Sunday-start week containing WED. */
const WEEK_START = new Date(2026, 9, 11)

const SCOTT = { id: 'scott', name: 'Scott', user_id: 'u-scott', auth_user_id: 'u-scott', is_full_user: true, age_range: 'adult' } as FamilyMember
const MIA = { id: 'mia', name: 'Mia', user_id: 'u-scott', is_full_user: false, age_range: 'child' } as FamilyMember
const MEMBERS = [SCOTT, MIA]

const r = (o: Partial<Routine> = {}) => createMockRoutine({ context: 'family', scope: 'compound', time_of_day: null, user_id: 'u-scott', ...o })
const ctx = { date: WED, weekStart: WEEK_START, familyMembers: MEMBERS }

describe('explainRoutine — Today', () => {
  it('a timed routine is on Today at its time', () => {
    const e = explainRoutine(r({ time_of_day: '07:00:00' }), ctx)
    expect(e.today).toMatchObject({ shows: true, rung: 'shows', reason: 'On Today at 7:00 AM' })
  })

  it('an untimed day-bound routine is on Today any time', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'weekly', days: ['wed'] } }), ctx)
    expect(e.today.reason).toBe('Any time today')
  })

  it('resting names its wake date and says it wakes on its own', () => {
    const e = explainRoutine(r({ visibility: 'reference', paused_until: '2027-06-21T04:00:00.000Z' }), ctx)
    expect(e.today).toMatchObject({ shows: false, rung: 'resting', reason: 'Resting until Jun 21, 2027 — it wakes on its own' })
    expect(e.week.rung).toBe('resting')
    expect(e.kiosk).toMatchObject({ shows: false, rung: 'resting' })
    expect(e.state).toBe('resting')
    expect(e.wakesOn?.getDate()).toBe(21)
  })

  it('not-today names the day and the days it runs', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'weekly', days: ['thu', 'tue'] } }), ctx)
    expect(e.today).toMatchObject({ shows: false, rung: 'not-today', reason: 'Not on Wednesdays — runs Tue & Thu' })
  })

  it('Off hides it from Today and planning but leaves the kiosk', () => {
    const e = explainRoutine(r({ show_on_timeline: false }), ctx)
    expect(e.today).toMatchObject({ shows: false, rung: 'off', reason: 'Hidden from Today and planning (Off)' })
    expect(e.week).toMatchObject({ shows: false, rung: 'off' })
    expect(e.kiosk).toMatchObject({ shows: true, reason: 'Still on the kitchen kiosk — Off only clears Today and planning' })
    expect(e.state).toBe('off')
  })

  it('the area filter', () => {
    const layers = new Set<Layer>(['family'])
    const e = explainRoutine(r({ context: 'personal' }), { ...ctx, prefs: { hideRoutines: false, layers } })
    expect(e.today).toMatchObject({ shows: false, rung: 'other-domain', reason: "Hidden by your area filter — it's a Personal routine" })
  })

  it('the people filter', () => {
    const e = explainRoutine(r({ assigned_to: 'mia' }), { ...ctx, member: ['scott'] })
    expect(e.today).toMatchObject({ shows: false, rung: 'not-theirs', reason: "Not for the people you're viewing" })
  })

  it('a step shows inside its routine — and only while the routine does', () => {
    const parent = r({ id: 'bed', name: 'Bedtime' })
    const step = r({ id: 's1', parent_routine_id: 'bed' })
    expect(explainRoutine(step, { ...ctx, parent }).today).toMatchObject({ shows: true, rung: 'in-collection', reason: 'Shows inside Bedtime' })
    const resting = { ...parent, visibility: 'reference' as const }
    const e = explainRoutine(step, { ...ctx, parent: resting })
    expect(e.today.shows).toBe(false)
    expect(e.today.reason).toMatch(/^Inside Bedtime, which isn't on Today: Resting/)
  })

  it('everyday routines folded by the hide-daily preference', () => {
    const e = explainRoutine(r({ show_on_timeline: undefined as unknown as boolean }), { ...ctx, prefs: { hideRoutines: true, layers: new Set<Layer>(['family', 'work', 'personal', 'unsorted'] as Layer[]) } })
    expect(e.today).toMatchObject({ shows: false, rung: 'everyday', reason: 'Every day — folded under Daily' })
  })

  it('Hide for today: skipped for today only, back tomorrow — the week and kiosk keep it', () => {
    const e = explainRoutine(r(), { ...ctx, skippedToday: true })
    expect(e.today).toMatchObject({ shows: false, rung: 'skipped', reason: 'Skipped for today only — back tomorrow' })
    expect(e.week.shows).toBe(true)
    expect(e.kiosk.reason).toBe('Still on the kitchen kiosk — Hide for today only clears Today')
    expect(e.state).toBe('running')
  })

  it('a skipped weekly routine comes back next time, not tomorrow', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'weekly', days: ['wed'] } }), { ...ctx, skippedToday: true })
    expect(e.today.reason).toBe('Skipped for today only — back next time it’s due')
  })

  it('a stronger rung beats skipped', () => {
    const e = explainRoutine(r({ show_on_timeline: false }), { ...ctx, skippedToday: true })
    expect(e.today.rung).toBe('off')
  })
})

describe('explainRoutine — Week', () => {
  it('names the days it lands on this week', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'weekly', days: ['tue', 'thu'] }, time_of_day: '18:30' }), ctx)
    expect(e.week).toMatchObject({ shows: true, reason: 'On the week on Tue & Thu at 6:30 PM' })
  })

  it('every day', () => {
    expect(explainRoutine(r(), ctx).week.reason).toBe('On the week every day')
  })

  it('a weekly rule with no day has nothing to place', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'weekly' } }), ctx)
    expect(e.week).toMatchObject({ shows: false, rung: 'no-day' })
  })

  it('a monthly rule outside this week', () => {
    const e = explainRoutine(r({ recurrence_pattern: { type: 'monthly', day_of_month: 1 } }), ctx)
    expect(e.week.shows).toBe(false)
    expect(e.week.reason).toMatch(/^Not this week — monthly on the 1st/)
  })
})

describe('explainRoutine — Kiosk', () => {
  it('a family routine due today is on the kiosk', () => {
    const e = explainRoutine(r({ time_of_day: '07:00' }), ctx)
    expect(e.kiosk).toMatchObject({ shows: true, rung: 'shows', reason: 'On the kitchen kiosk at 7:00 AM' })
  })

  it('a Personal routine is private — never on the shared kiosk, even assigned to a kid', () => {
    const e = explainRoutine(r({ context: 'personal', scope: 'individual', assigned_to: 'scott' }), ctx)
    expect(e.kiosk).toMatchObject({ shows: false, rung: 'private', reason: 'Private to Scott — never on the shared kiosk' })
    // Assignment is not permission: handing it to Mia does not put it on the wall.
    const kid = explainRoutine(r({ context: 'work', scope: 'couple', assigned_to: 'mia' }), ctx)
    expect(kid.kiosk.shows).toBe(false)
    expect(kid.kiosk.rung).toBe('private')
  })

  it('an untagged routine owned by one adult is private', () => {
    const e = explainRoutine(r({ context: null, scope: 'individual', assigned_to: 'scott' }), ctx)
    expect(e.kiosk).toMatchObject({ shows: false, rung: 'private', reason: 'Private to Scott — never on the shared kiosk' })
  })

  it('an untagged routine for a kid is not private, but the kiosk still reads Family only', () => {
    const e = explainRoutine(r({ context: null, assigned_to: 'mia' }), ctx)
    expect(e.kiosk).toMatchObject({ shows: false, rung: 'not-family' })
  })

  it('a collection is on the kiosk through its Family steps', () => {
    const parent = r({ id: 'bed', name: 'Bedtime', visibility: 'reference', context: null, time_of_day: '19:30' })
    const steps = [r({ id: 's1', parent_routine_id: 'bed' })]
    const e = explainRoutine(parent, { ...ctx, steps })
    expect(e.kiosk).toMatchObject({ shows: true, reason: 'On the kitchen kiosk at 7:30 PM' })
  })

  it('a collection resting until a later date is off the kiosk', () => {
    const parent = r({ id: 'camp', visibility: 'reference', paused_until: '2027-06-21T00:00:00.000Z' })
    const e = explainRoutine(parent, { ...ctx, steps: [r({ parent_routine_id: 'camp' })] })
    expect(e.kiosk).toMatchObject({ shows: false, rung: 'resting' })
  })
})

describe('helpers', () => {
  it('daysText', () => {
    expect(daysText([4, 2])).toBe('Tue & Thu')
    expect(daysText([1, 3, 5])).toBe('Mon, Wed & Fri')
    expect(daysText([6])).toBe('Sat')
  })

  it('labels the three strengths once', () => {
    expect(Object.values(ROUTINE_HIDE_LABELS)).toEqual(['Hide for today', 'Rest until…', 'Off'])
  })

  it('summarizes every surface in one line', () => {
    const s = explanationSummary(explainRoutine(r({ show_on_timeline: false }), ctx))
    expect(s).toContain('Today: not showing — Hidden from Today and planning (Off)')
    expect(s).toContain('Kiosk: shows')
  })
})
