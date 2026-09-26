import { describe, it, expect } from 'vitest'
import { planPlacement, planKeep, planDropCommitment, applyCommitmentOps, isPlacementWrite, commitmentsAfterCompletion } from './intentions'
import type { Task, TaskCommitment } from '@/types/task'
import { DEFAULT_SEASONS } from '@/lib/cadence/seasons'

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`, title: 'T', completed: false, createdAt: new Date(2026, 8, 1, 0, 0, n), updatedAt: new Date(), bucket: 'inbox', ...over,
} as Task)
const c = (level: TaskCommitment['level'], periodStart: Date, status: TaskCommitment['status'] = 'open'): TaskCommitment => ({ level, periodStart, status })

const NOW = new Date(2026, 8, 23, 10) // Wed Sep 23
const ctx = { now: NOW, userId: 'scott', seasons: DEFAULT_SEASONS }
const SEP = new Date(2026, 8, 1)
const OCT = new Date(2026, 9, 1)
const FALL = new Date(2026, 8, 1)
const WK20 = new Date(2026, 8, 20)
const WK27 = new Date(2026, 8, 27)

describe('descend — one enduring action, never a copy', () => {
  it('month → week ADDS a week commitment and keeps the month', () => {
    const t = task({ bucket: 'month', monthStart: SEP, commitments: [c('month', SEP)] })
    const p = planPlacement(t, { bucket: 'week', scheduledFor: undefined, weekStart: WK20, monthStart: undefined }, ctx)
    expect(p.commitmentOps).toEqual([{ op: 'ensure', level: 'week', periodStart: WK20 }])
    expect(p.local.commitments).toEqual([c('month', SEP), c('week', WK20)])
    expect(p.local.bucket).toBe('week')
    expect(p.local.monthStart).toEqual(SEP) // the higher commitment is still on the row
    expect(p.row.bucket).toBe('week')
  })
  it('season → month keeps the season; month → day keeps both', () => {
    const t = task({ bucket: 'quarter', commitments: [c('season', FALL)] })
    const p1 = planPlacement(t, { bucket: 'month', monthStart: SEP }, ctx)
    expect(p1.local.commitments).toEqual([c('season', FALL), c('month', SEP)])
    const p2 = planPlacement(p1.local, { bucket: 'timed', scheduledFor: new Date(2026, 8, 25), isAllDay: true }, ctx)
    expect(p2.commitmentOps).toEqual([])
    expect(p2.local.commitments).toEqual([c('season', FALL), c('month', SEP)])
    expect(p2.local.bucket).toBe('timed')
    expect(p2.local.scheduledFor).toEqual(new Date(2026, 8, 25))
  })
  it('the same intention through any control produces identical state', () => {
    const t = task({ bucket: 'month', commitments: [c('month', SEP)] })
    const day = new Date(2026, 8, 25)
    const drag = planPlacement(t, { isAllDay: true, scheduledFor: day, bucket: 'timed' }, ctx)
    const arrow = planPlacement(t, { bucket: 'timed', scheduledFor: day, isAllDay: true }, ctx)
    const verb = planPlacement(t, { scheduledFor: day, isAllDay: true }, ctx)
    expect(arrow.local).toEqual(drag.local)
    expect(verb.local).toEqual(drag.local)
  })
})

describe('ascend and replan', () => {
  it('week → month takes it off the week and puts it on the month', () => {
    const t = task({ bucket: 'week', commitments: [c('week', WK20)] })
    const p = planPlacement(t, { bucket: 'month', scheduledFor: undefined, weekStart: undefined, monthStart: SEP }, ctx)
    expect(p.commitmentOps).toEqual([
      { op: 'ensure', level: 'month', periodStart: SEP },
      { op: 'remove', level: 'week', periodStart: WK20 },
    ])
    expect(p.local.bucket).toBe('month')
    expect(p.local.weekStart).toBeUndefined()
  })
  it('"not this week" supersedes this week\'s placement with next week\'s', () => {
    const t = task({ bucket: 'week', commitments: [c('week', WK20)] })
    const p = planPlacement(t, { bucket: 'week', weekStart: WK27 }, ctx)
    expect(p.commitmentOps).toEqual([
      { op: 'remove', level: 'week', periodStart: WK20 },
      { op: 'ensure', level: 'week', periodStart: WK27 },
    ])
    expect(p.local.weekStart).toEqual(WK27)
  })
  it('a stamp alone (no bucket) plans for that period', () => {
    const t = task({ bucket: 'month', commitments: [c('month', SEP)] })
    const p = planPlacement(t, { weekStart: WK20 }, ctx)
    expect(p.commitmentOps).toEqual([{ op: 'ensure', level: 'week', periodStart: WK20 }])
  })
  it('with no stamp, the period is the one containing now', () => {
    const p = planPlacement(task(), { bucket: 'week' }, ctx)
    expect(p.commitmentOps[0]).toMatchObject({ op: 'ensure', level: 'week' })
    expect(p.commitmentOps[0].periodStart.getMonth()).toBe(8)
  })
})

describe('schedule / unschedule — commitments and focus untouched', () => {
  it('scheduling a dated task elsewhere changes only the day', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 23), commitments: [c('month', SEP), c('week', WK20)], focus: [{ userId: 'scott', date: new Date(2026, 8, 23) }] })
    const p = planPlacement(t, { scheduledFor: new Date(2026, 8, 25) }, ctx)
    expect(p.commitmentOps).toEqual([])
    expect(p.focusOps).toEqual([])
    expect(p.local.focus).toEqual(t.focus)
    expect(p.row.scheduledFor).toEqual(new Date(2026, 8, 25))
  })
  it('unschedule keeps the week and period commitments and the focus', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 23), commitments: [c('month', SEP), c('week', WK20)], focus: [{ userId: 'iris', date: new Date(2026, 8, 23) }] })
    const p = planPlacement(t, { scheduledFor: undefined }, ctx)
    expect(p.commitmentOps).toEqual([])
    expect(p.local.bucket).toBe('week') // back on "To schedule"
    expect(p.local.scheduledFor).toBeUndefined()
    expect(p.local.focus).toEqual(t.focus)
    expect(p.row.plannedOn).toBeUndefined()
  })
})

describe('focus — personal, never a shared column', () => {
  it('choosing writes only this person\'s focus row and never planned_on', () => {
    const t = task({ bucket: 'week', commitments: [c('week', WK20)] })
    const day = new Date(2026, 8, 23)
    const p = planPlacement(t, { plannedOn: day }, ctx)
    expect(p.focusOps).toEqual([{ op: 'set', userId: 'scott', date: day }])
    expect(p.commitmentOps).toEqual([])
    expect('plannedOn' in p.row).toBe(false)
    expect(p.local.focus).toEqual([{ userId: 'scott', date: day }])
    expect(p.local.scheduledFor).toBeUndefined() // choosing never reschedules
  })
  it('un-choosing clears only this person\'s rows, and the legacy shared value', () => {
    const day = new Date(2026, 8, 23)
    const t = task({ plannedOn: day, focus: [{ userId: 'scott', date: day }, { userId: 'iris', date: day }] })
    const p = planPlacement(t, { plannedOn: undefined }, ctx)
    expect(p.focusOps).toEqual([{ op: 'clear', userId: 'scott' }])
    expect(p.local.focus).toEqual([{ userId: 'iris', date: day }])
    expect('plannedOn' in p.row && p.row.plannedOn === undefined).toBe(true)
  })
})

describe('focus — a stated list (undo restore, one-day un-choose)', () => {
  const MON = new Date(2026, 8, 21)
  const WED = new Date(2026, 8, 23)
  it('a stated focus list clears only the day dropped from it; other days and other people untouched', () => {
    const t = task({ focus: [{ userId: 'scott', date: MON }, { userId: 'scott', date: WED }, { userId: 'iris', date: WED }] })
    const p = planPlacement(t, { focus: [{ userId: 'scott', date: MON }, { userId: 'iris', date: WED }] }, ctx)
    expect(p.focusOps).toEqual([{ op: 'clear', userId: 'scott', date: WED }])
    expect(p.local.focus).toEqual([{ userId: 'scott', date: MON }, { userId: 'iris', date: WED }])
  })
  it('restoring a snapshot sets back the rows that were lost', () => {
    const t = task({ focus: [] })
    const p = planPlacement(t, { focus: [{ userId: 'scott', date: MON }, { userId: 'iris', date: MON }] }, ctx)
    expect(p.focusOps).toEqual([{ op: 'set', userId: 'scott', date: MON }]) // never writes someone else's focus
  })
  it('a legacy shared choice counts as mine: dropping its day clears the legacy column', () => {
    const t = task({ plannedOn: WED, focus: [] })
    const p = planPlacement(t, { focus: [] }, ctx)
    expect(p.focusOps).toEqual([{ op: 'clear', userId: 'scott', date: WED }])
    expect('plannedOn' in p.row && p.row.plannedOn === undefined).toBe(true)
  })
  it('rescheduling to another day keeps focus (S13) and leaves the week commitment (S4)', () => {
    const t = task({ bucket: 'week', commitments: [c('week', WK20)], focus: [{ userId: 'scott', date: WED }] })
    const p = planPlacement(t, { bucket: 'timed', scheduledFor: new Date(2026, 8, 25), isAllDay: true }, ctx)
    expect(p.focusOps).toEqual([])
    expect(p.commitmentOps).toEqual([])
    expect(p.local.focus).toEqual([{ userId: 'scott', date: WED }])
    expect(p.local.commitments).toEqual([c('week', WK20)])
  })
})

describe('let go and complete', () => {
  it('inbox / someday release every open commitment and the day', () => {
    const t = task({ bucket: 'timed', scheduledFor: new Date(2026, 8, 23), commitments: [c('season', FALL), c('month', SEP)] })
    const p = planPlacement(t, { bucket: 'someday' }, ctx)
    expect(p.commitmentOps).toEqual([
      { op: 'remove', level: 'season', periodStart: FALL },
      { op: 'remove', level: 'month', periodStart: SEP },
    ])
    expect(p.local.bucket).toBe('someday')
    expect(p.local.scheduledFor).toBeUndefined()
  })
  it('completing marks the open commitments done; reopening restores them', () => {
    const t = task({ commitments: [c('season', FALL), c('month', SEP)] })
    const p = planPlacement(t, { completed: true }, ctx)
    expect(p.local.commitments.every((x) => x.status === 'done')).toBe(true)
    const back = planPlacement(p.local, { completed: false }, ctx)
    expect(back.local.commitments.every((x) => x.status === 'open')).toBe(true)
  })
  it('non-placement keys pass through untouched', () => {
    const p = planPlacement(task({ commitments: [c('month', SEP)] }), { title: 'New', notes: 'n' }, ctx)
    expect(p.row).toMatchObject({ title: 'New', notes: 'n' })
    expect('bucket' in p.row).toBe(false) // a title edit is not a move
    expect(p.commitmentOps).toEqual([])
    // Choosing a day writes focus, not the row's cache columns.
    const f = planPlacement(task({ commitments: [c('month', SEP)] }), { plannedOn: new Date(2026, 8, 23) }, ctx)
    expect('bucket' in f.row).toBe(false)
    expect(isPlacementWrite({ title: 'x' })).toBe(false)
    expect(isPlacementWrite({ weekStart: WK20 })).toBe(true)
  })
})

describe('keep — same task, next period', () => {
  it('carries September and opens October on the SAME row', () => {
    const t = task({ bucket: 'month', commitments: [c('season', FALL), c('month', SEP)] })
    const p = planKeep(t, 'month', OCT)
    expect(p.commitmentOps).toEqual([
      { op: 'carry', level: 'month', periodStart: SEP, to: OCT },
      { op: 'ensure', level: 'month', periodStart: OCT },
    ])
    expect(p.local.commitments).toEqual([c('season', FALL), { ...c('month', SEP, 'carried'), carriedTo: OCT }, c('month', OCT)])
    expect(p.local.monthStart).toEqual(OCT)
    expect(p.local.id).toBe(t.id)
  })
})

describe('applyCommitmentOps', () => {
  it('ensure reopens a removed commitment rather than duplicating it', () => {
    const out = applyCommitmentOps([c('week', WK20, 'removed')], [{ op: 'ensure', level: 'week', periodStart: WK20 }])
    expect(out).toEqual([c('week', WK20)])
  })

  // Found by the local Postgres harness (096_planning_commitments): Kept from
  // September into October, then put back on September. Postgres reopens the
  // carried row; the model left it carried and the task showed in the Inbox.
  it('putting a task back on a period it was carried out of reopens that period', () => {
    const SEP = new Date(2026, 8, 1), OCT = new Date(2026, 9, 1)
    const task = {
      id: 'k', title: 'Gutters', completed: false, createdAt: SEP, updatedAt: SEP, bucket: 'month', monthStart: OCT,
      commitments: [{ ...c('month', SEP, 'carried'), carriedTo: OCT }, c('month', OCT)],
    } as Task
    const plan = planPlacement(task, { bucket: 'month', monthStart: SEP }, { now: new Date(2026, 8, 25) } as Parameters<typeof planPlacement>[2])
    expect(plan.row.bucket).toBe('month')
    expect(plan.row.monthStart).toEqual(SEP)
    expect(plan.local.commitments).toContainEqual(c('month', SEP))
  })
})

describe('planDropCommitment', () => {
  const sep = new Date(2026, 8, 1)
  const oct = new Date(2026, 9, 1)
  const base = (commitments: Task['commitments']): Task => ({
    id: 't1', title: 'Sort photos', completed: false, createdAt: new Date(2026, 8, 2), updatedAt: new Date(2026, 8, 2),
    bucket: 'month', monthStart: sep, commitments,
  } as Task)

  it('removes only that period\'s open commitment and keeps the task', () => {
    const plan = planDropCommitment(base([
      { level: 'month', periodStart: sep, status: 'open' },
      { level: 'season', periodStart: new Date(2026, 8, 22), status: 'open' },
    ]), 'month', sep)
    expect(plan.commitmentOps).toEqual([{ op: 'remove', level: 'month', periodStart: sep }])
    expect(plan.local.commitments?.find((c) => c.level === 'month')?.status).toBe('removed')
    expect(plan.local.commitments?.find((c) => c.level === 'season')?.status).toBe('open')
    expect(plan.row).not.toHaveProperty('completed')
  })

  it('is a no-op when that period has no open commitment', () => {
    const plan = planDropCommitment(base([{ level: 'month', periodStart: sep, status: 'carried', carriedTo: oct }]), 'month', sep)
    expect(plan.commitmentOps).toEqual([])
  })
})

describe('planKeep without a source period', () => {
  it('never carries the destination into itself: an already-open destination is skipped', () => {
    // A half-failed Keep: the row write opened October (mirror trigger), the carry never landed.
    const t = task({ bucket: 'month', monthStart: OCT, commitments: [c('month', SEP), c('month', OCT)] })
    const plan = planKeep(t, 'month', OCT)
    expect(plan.commitmentOps).toEqual([
      { op: 'carry', level: 'month', periodStart: SEP, to: OCT },
      { op: 'ensure', level: 'month', periodStart: OCT },
    ])
  })
})

// A season commitment can start mid-season (a row committed to the season on
// Oct 15). The season list matches by RANGE (committedTo); Keep and Drop, given
// the season's start, must find the same commitment (final review I3).
describe('season Keep and Drop match the season by range', () => {
  const fall = new Date(2026, 8, 1), winter = new Date(2026, 11, 1), midFall = new Date(2026, 9, 15)
  const row = (): Task => ({
    id: 't1', title: 'Bids', completed: false, createdAt: fall, updatedAt: fall,
    bucket: 'quarter', seasonStart: midFall, commitments: [{ level: 'season', periodStart: midFall, status: 'open' }],
  } as Task)

  it('Keep from the season start carries the mid-season commitment', () => {
    const plan = planKeep(row(), 'season', winter, fall, DEFAULT_SEASONS)
    expect(plan.commitmentOps).toEqual([
      { op: 'carry', level: 'season', periodStart: midFall, to: winter },
      { op: 'ensure', level: 'season', periodStart: winter },
    ])
  })

  it('Drop from the season start removes the mid-season commitment', () => {
    const plan = planDropCommitment(row(), 'season', fall, DEFAULT_SEASONS)
    expect(plan.commitmentOps).toEqual([{ op: 'remove', level: 'season', periodStart: midFall }])
    expect(plan.local.commitments?.[0].status).toBe('removed')
  })

  it('a month still matches its exact start only', () => {
    const t = { ...row(), bucket: 'month', commitments: [{ level: 'month', periodStart: new Date(2026, 8, 15), status: 'open' }] } as Task
    expect(planDropCommitment(t, 'month', fall).commitmentOps).toEqual([])
  })
})


describe('flexible weekend placement', () => {
  const saturday = new Date(2026, 8, 26)
  it('keeps month and week commitments without creating a scheduled day', () => {
    const p = planPlacement(task({ bucket: 'month', commitments: [c('month', SEP)] }), { bucket: 'week', weekStart: WK20, weekendStart: saturday, scheduledFor: undefined, plannedOn: undefined }, ctx)
    expect(p.local.weekendStart).toEqual(saturday)
    expect(p.local.scheduledFor).toBeUndefined()
    expect(p.local.commitments).toEqual([c('month', SEP), c('week', WK20)])
  })
  it('keeps weekend context when choosing Sunday, and clears it when explicitly planning another day', () => {
    const t = task({ weekendStart: saturday, bucket: 'week', commitments: [c('week', WK20)] })
    expect(planPlacement(t, { scheduledFor: WK27 }, ctx).local.weekendStart).toEqual(saturday)
    expect(planPlacement(t, { scheduledFor: new Date(2026, 8, 28) }, ctx).local.weekendStart).toBeUndefined()
  })
  it('keeping a week does not silently carry its weekend window forward', () => {
    const t = task({ weekendStart: saturday, bucket: 'week', commitments: [c('week', WK20)] })
    expect(planKeep(t, 'week', WK27, WK20).local.weekendStart).toBeUndefined()
    expect(planDropCommitment(t, 'week', WK20).local.weekendStart).toBeUndefined()
  })
})

describe('"Keep it in October" pressed in September (2026-09-24 blocker)', () => {
  const WK_OCT4 = new Date(2026, 9, 4)
  // The reported sequence: an October step given the week of Oct 4, then a day,
  // then the day removed (week kept), then Plan ▾ → "Keep it in October".
  const octStep = () => task({
    title: 'Research games dates and tickets',
    bucket: 'week', monthStart: OCT, weekStart: WK_OCT4,
    goalTaskId: 'goal-1',
    commitments: [c('month', OCT), c('week', WK_OCT4)],
  })

  it('keeps October when the month is NAMED, dropping only the week', () => {
    const p = planPlacement(octStep(), {
      bucket: 'month', monthStart: OCT, weekStart: undefined, scheduledFor: undefined,
    }, ctx)
    // October stays open; only the week is given up.
    expect(p.commitmentOps).toContainEqual({ op: 'ensure', level: 'month', periodStart: OCT })
    expect(p.commitmentOps).not.toContainEqual(
      expect.objectContaining({ op: 'remove', level: 'month', periodStart: OCT }),
    )
    expect(p.commitmentOps).toContainEqual(
      expect.objectContaining({ op: 'remove', level: 'week', periodStart: WK_OCT4 }),
    )
    expect(p.row.monthStart).toEqual(OCT)
  })

  it('the goal link is never touched by a keep-period write', () => {
    const p = planPlacement(octStep(), {
      bucket: 'month', monthStart: OCT, weekStart: undefined, scheduledFor: undefined,
    }, ctx)
    expect('goalTaskId' in p.row).toBe(false)
  })

  it('documents the trap: an UNNAMED month is read as today’s month', () => {
    // This is what the Plan menu used to send. `stampFor` finds no monthStart,
    // so `planPlacement` falls back to ctx.now — September — and then
    // supersedes the open October commitment as a different period at the same
    // level. The task left October for a month the user never chose, and
    // October's count fell by one. Callers must name the period; this case is
    // pinned so the fallback cannot change meaning unnoticed.
    const p = planPlacement(octStep(), {
      bucket: 'month', weekStart: undefined, scheduledFor: undefined,
    }, ctx)
    expect(p.commitmentOps).toContainEqual({ op: 'ensure', level: 'month', periodStart: SEP })
    expect(p.commitmentOps).toContainEqual(
      expect.objectContaining({ op: 'remove', level: 'month', periodStart: OCT }),
    )
  })
})

describe('"Add to this month" on a season task, October viewed in September (S3-01)', () => {
  // A Fall goal's task, pulled down from the Shelves rail while the page shows
  // October. The clock says September 24.
  const fallTask = () => task({
    title: 'List recurring home-maintenance jobs and agree who handles each',
    bucket: 'quarter', seasonStart: FALL, goalTaskId: 'fall-goal',
    context: 'family',
    commitments: [c('season', FALL)],
  })

  it('lands on the month being VIEWED when that month is named', () => {
    const p = planPlacement(fallTask(), { bucket: 'month', monthStart: OCT }, ctx)
    expect(p.commitmentOps).toContainEqual({ op: 'ensure', level: 'month', periodStart: OCT })
    expect(p.row.monthStart).toEqual(OCT)
  })

  it('keeps the season commitment — descending never gives up what is above', () => {
    const p = planPlacement(fallTask(), { bucket: 'month', monthStart: OCT }, ctx)
    expect(p.commitmentOps).not.toContainEqual(
      expect.objectContaining({ op: 'remove', level: 'season' }),
    )
    const after = applyCommitmentOps(fallTask().commitments, p.commitmentOps)
    expect(after.find((x) => x.level === 'season')?.status).toBe('open')
  })

  it('never touches the goal link or the life area', () => {
    const p = planPlacement(fallTask(), { bucket: 'month', monthStart: OCT }, ctx)
    expect('goalTaskId' in p.row).toBe(false)
    expect('context' in p.row).toBe(false)
  })

  it('documents the trap: no month named puts it on the CLOCK’s month', () => {
    // What `pushTask(id, 'month')` sent. The task appeared under September
    // while October was on screen, and October's counts never moved.
    const p = planPlacement(fallTask(), { bucket: 'month' }, ctx)
    expect(p.commitmentOps).toContainEqual({ op: 'ensure', level: 'month', periodStart: SEP })
    expect(p.row.monthStart).toEqual(SEP)
  })
})

describe('commitmentsAfterCompletion — the tick mirrors the trigger', () => {
  const wk = (d: number) => new Date(2026, 8, d)
  const records = [
    { level: 'month' as const, periodStart: new Date(2026, 8, 1), status: 'open' as const },
    { level: 'week' as const, periodStart: wk(20), status: 'open' as const },
    { level: 'week' as const, periodStart: wk(13), status: 'removed' as const },
  ]
  it('completing marks the open records done and leaves history alone', () => {
    expect(commitmentsAfterCompletion(records, true)!.map((c) => c.status)).toEqual(['done', 'done', 'removed'])
  })
  it('reopening restores them, so a later move closes the old week (no action on two weeks)', () => {
    const reopened = commitmentsAfterCompletion(commitmentsAfterCompletion(records, true), false)!
    expect(reopened.map((c) => c.status)).toEqual(['open', 'open', 'removed'])
    const task = { id: 'x', title: 'Sweep the floor', completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: 'week', weekStart: wk(20), monthStart: new Date(2026, 8, 1), commitments: reopened } as Task
    const plan = planPlacement(task, { bucket: 'week', weekStart: wk(27), scheduledFor: undefined }, { now: wk(26), userId: 'u' })
    expect(plan.commitmentOps).toContainEqual({ op: 'remove', level: 'week', periodStart: wk(20) })
    expect(plan.local.commitments!.filter((c) => c.level === 'week' && c.status === 'open').map((c) => c.periodStart)).toEqual([wk(27)])
  })
})
