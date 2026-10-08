import { describe, it, expect } from 'vitest'
import {
  FREE, MAX_TODAY, goalColumns, isToday, newDraft, progress, questionFor, readDraft, reconcileDraft, reduce, resumeSummary, rowState, sourceCandidates, stalePeriods, stepsFor, weekEntries, writeDraft,
  draftPeriods, limitNote, type ExistingPlan, type FlowAction, type ReduceEnv, type Step, type VoicePlanDraft,
} from './flow'

const labels = { year: '2026', season: 'Fall', month: 'October', week: 'Oct 3 – 9', today: 'Thursday' }

// Two goals already on the plan, a little on each list.
const EXISTING: ExistingPlan = {
  goals: [{ id: 'g-garden', title: 'Grow food in the garden', context: 'family' }, { id: 'g-office', title: 'Finish the home office' }],
  items: [
    { id: 's-beds', title: 'Two raised beds built', horizon: 'season', goalId: 'g-garden' },
    { id: 'm-paint', title: 'Paint the walls', horizon: 'month', goalId: 'g-office' },
    { id: 'w-samples', title: 'Buy paint samples', horizon: 'week', goalId: 'g-office' },
  ],
}

function envWith(existing: ExistingPlan = EXISTING): ReduceEnv {
  let n = 0
  return { existing, newId: () => `id-${++n}` }
}
const run = (env: ReduceEnv, d: VoicePlanDraft, ...actions: FlowAction[]) => actions.reduce((x, a) => reduce(x, a, env), d)
const idOf = (d: VoicePlanDraft, title: string) => d.goals.find((g) => g.title === title)!.id

/** A full session from the year with four goals: two kept, two new. */
function toSeason(env = envWith()) {
  return run(env, newDraft('year', env.existing),
    { type: 'addGoal', text: 'Speak simple Spanish' },
    { type: 'addGoal', text: 'Launch the newsletter' },
    { type: 'continue' },
    { type: 'continue' },
  )
}

describe('a full session goes breadth-first across every goal', () => {
  it('starts from the goals already on the plan and adds new ones, then shows the whole year at a checkpoint', () => {
    const env = envWith()
    const d = run(env, newDraft('year', EXISTING), { type: 'addGoal', text: 'Speak simple Spanish' }, { type: 'addGoal', text: 'Launch the newsletter' })
    expect(d.goals.map((g) => [g.title, g.existing])).toEqual([
      ['Grow food in the garden', true], ['Finish the home office', true], ['Speak simple Spanish', false], ['Launch the newsletter', false],
    ])
    expect(d.step).toBe('year') // adding goals never moves on by itself
    expect(run(env, d, { type: 'continue' }).step).toBe('year:check')
    expect(run(env, d, { type: 'continue' }, { type: 'continue' }).step).toBe('season')
  })

  it('walks every horizon in order with a checkpoint after each, ending in review', () => {
    const env = envWith()
    let d = newDraft('year', EXISTING)
    const seen: Step[] = [d.step]
    for (let i = 0; i < 12 && d.step !== 'review'; i++) { d = reduce(d, { type: 'continue' }, env); seen.push(d.step) }
    expect(seen).toEqual(['year', 'year:check', 'season', 'season:check', 'month', 'month:check', 'week', 'week:check', 'today', 'review'])
  })

  it('asks the season for each goal on one screen; an answer stays on its goal (for another), Next goal moves on, and the horizon never changes by itself', () => {
    const env = envWith()
    const d = toSeason(env)
    // The garden already has a season line, so the question opens on the office.
    expect(d.focus).toBe('g-office')
    expect(rowState(d, 'season', 'g-garden', EXISTING)).toBe('existing')
    const a = run(env, d, { type: 'answer', text: 'Desk and shelves in place' })
    expect(a.step).toBe('season')
    expect(a.focus).toBe('g-office') // another line for it is one more Enter away
    const b = run(env, a, { type: 'nextGoal' }, { type: 'answer', text: 'Finish the beginner course' })
    expect(b.focus).toBe(idOf(b, 'Speak simple Spanish'))
    const c = run(env, b, { type: 'nextGoal' }, { type: 'answer', text: 'First issue out' })
    expect(c.step).toBe('season') // all answered — still waits for Continue
    expect(c.season.map((l) => l.text)).toEqual(['Desk and shelves in place', 'Finish the beginner course', 'First issue out'])
  })

  // 2026-10-08 review: one aim, several milestones and priorities.
  it('a goal keeps several season and month lines — a second answer adds, never overwrites', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'focus', goal: 'g-office' },
      { type: 'answer', text: 'Desk in place' }, { type: 'answer', text: 'Shelves up' }, { type: 'answer', text: 'desk in place' })
    expect(d.season.filter((l) => l.goalId === 'g-office').map((l) => l.text)).toEqual(['Desk in place', 'Shelves up'])
    const m = run(env, d, { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-office' },
      { type: 'answer', text: 'Order the desk' }, { type: 'answer', text: 'Buy shelf brackets' })
    expect(m.month.filter((l) => l.goalId === 'g-office').map((l) => l.text)).toEqual(['Order the desk', 'Buy shelf brackets'])
  })

  it('a month line is written for an ACTUAL Fall row: automatic only when there is one, chosen when there are several', () => {
    const env = envWith()
    // The garden has one Fall line (already on the plan): it is chosen.
    let d = run(env, toSeason(env), { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-garden' }, { type: 'answer', text: 'Order bulbs' })
    expect(d.month[0]).toMatchObject({ text: 'Order bulbs', sourceId: 's-beds' })
    // The office gets two new Fall lines: its month line waits for a choice.
    d = run(env, toSeason(env), { type: 'focus', goal: 'g-office' }, { type: 'answer', text: 'Desk in place' }, { type: 'answer', text: 'Shelves up' },
      { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-office' }, { type: 'answer', text: 'Order the desk' }, { type: 'answer', text: 'Buy brackets' })
    const [desk, shelves] = d.season.filter((l) => l.goalId === 'g-office')
    const [order, brackets] = d.month
    expect(order.sourceId ?? null).toBeNull()
    expect(sourceCandidates(d, EXISTING, 'month', 'g-office').map((c) => c.title)).toEqual(['Desk in place', 'Shelves up'])
    d = run(env, d, { type: 'setLineSource', id: order.id, sourceId: desk.id }, { type: 'setLineSource', id: brackets.id, sourceId: shelves.id })
    expect(d.month.map((l) => [l.text, l.sourceId])).toEqual([['Order the desk', desk.id], ['Buy brackets', shelves.id]])
    expect(run(env, d, { type: 'setLineSource', id: order.id, sourceId: 's-beds' }).month[0].sourceId).toBe(desk.id) // another goal's line is refused
  })

  it('week tasks choose distinct month parents for the same goal', () => {
    const env = envWith()
    let d = run(env, toSeason(env), { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-office' },
      { type: 'answer', text: 'Order the desk' }, { type: 'continue' }, { type: 'continue' })
    expect(d.step).toBe('week')
    const order = d.month[0]
    // Two month lines for the office: its own new one and the kept "Paint the walls".
    expect(sourceCandidates(d, EXISTING, 'week', 'g-office').map((c) => c.id)).toEqual([order.id, 'm-paint'])
    d = run(env, d, { type: 'addWeek', text: 'Measure the corner', goal: 'g-office', sourceId: order.id },
      { type: 'addWeek', text: 'Buy rollers', goal: 'g-office' })
    const [measure, rollers] = d.week
    expect(measure.sourceId).toBe(order.id)
    expect(rollers.sourceId ?? null).toBeNull() // two candidates: never "the first"
    d = run(env, d, { type: 'setWeekSource', id: rollers.id, sourceId: 'm-paint' })
    expect(d.week.map((w) => w.sourceId)).toEqual([order.id, 'm-paint'])
  })

  it('an answer that is already doable goes to this week for THAT goal only — the other goals are still asked', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Call the carpenter about shelves' })
    const office = 'g-office'
    const e = run(env, d, { type: 'toWeek', id: d.season[0].id })
    expect(e.step).toBe('season') // no bypass to today or review
    expect(e.season).toEqual([])
    expect(e.week).toEqual([expect.objectContaining({ text: 'Call the carpenter about shelves', goalId: office, from: 'season' })])
    expect(rowState(e, 'season', office, EXISTING)).toBe('week')
    // At the month the office reads as already handled by the week.
    const m = run(env, e, { type: 'continue' }, { type: 'continue' })
    expect(m.step).toBe('month')
    expect(rowState(m, 'month', office, EXISTING)).toBe('week')
  })

  it('a spoken today action during the season does not jump past the remaining goals', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', level: 'today', text: 'Measure the wall' })
    expect(d.step).toBe('season')
    expect(weekEntries(d, EXISTING).find((w) => w.text === 'Measure the wall')).toBeTruthy()
    expect(d.today).toHaveLength(1)
  })

  it('no goal has to produce work every period: "not this season" is a deliberate state', () => {
    const env = envWith()
    const start = toSeason(env)
    const spanish = idOf(start, 'Speak simple Spanish')
    const d = run(env, start, { type: 'answer', text: 'Desk in place' }, { type: 'defer', goal: spanish })
    expect(rowState(d, 'season', spanish, EXISTING)).toBe('deferred')
    expect(d.focus).toBe(idOf(d, 'Launch the newsletter'))
    expect(progress(d, EXISTING).find((p) => p.h === 'season')?.detail).toBe('3 of 4 goals')
    // Changing one's mind: an answer clears the deferral.
    const back = run(env, d, { type: 'answer', text: 'Lessons twice a week', goal: spanish })
    expect(rowState(back, 'season', spanish, EXISTING)).toBe('new')
  })

  it('skips a whole horizon only when nothing new was written there, past its checkpoint', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'skip' })
    expect(d.step).toBe('month')
    expect(d.skipped).toEqual(['season'])
    const written = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' }, { type: 'skip' })
    expect(written.step).toBe('season') // keeps what was written; Continue is the way on
  })

  it('builds one collective week across goals, linked to each goal, reusing what is already on it', () => {
    const env = envWith()
    let d = run(env, toSeason(env), { type: 'continue' }, { type: 'continue' }, { type: 'continue' }, { type: 'continue' })
    expect(d.step).toBe('week')
    expect(d.focus).toBe(FREE) // a new task serves no goal until one is picked
    const spanish = idOf(d, 'Speak simple Spanish')
    d = run(env, d, { type: 'addWeek', text: 'Two Spanish lessons', goal: spanish }, { type: 'addWeek', text: 'Return library books', goal: FREE })
    // Already on the week: not added twice.
    d = run(env, d, { type: 'addWeek', text: 'buy paint samples', goal: 'g-office' })
    const week = weekEntries(d, EXISTING)
    expect(week.map((w) => [w.text, w.existing, w.goalId])).toEqual([
      ['Buy paint samples', true, 'g-office'], ['Two Spanish lessons', false, spanish], ['Return library books', false, null],
    ])
  })

  it('chooses today from the week — an existing task by its own id, never a copy — past a few gently, with a stated bound', () => {
    const env = envWith()
    let d = run(env, toSeason(env), { type: 'edit', level: 'week' }, { type: 'addWeek', text: 'Two lessons' }, { type: 'continue' }, { type: 'continue' })
    expect(d.step).toBe('today')
    d = run(env, d, { type: 'toggleToday', id: 'w-samples' }, { type: 'answer', text: 'two lessons' })
    expect(d.today).toEqual(['w-samples', d.week[0].id])
    expect(d.week).toHaveLength(1) // the spoken match picked the task; no copy
    expect(d.step).toBe('today')
    // A fourth is taken (guidance, not a rule)…
    d = run(env, d, { type: 'answer', text: 'Measure the wall' }, { type: 'answer', text: 'Order a lamp' })
    expect(d.today).toHaveLength(4)
    expect(limitNote(d, 'today')).toBeNull()
    // …up to the session bound, which is then said, not silent.
    for (let i = 0; d.today.length < MAX_TODAY; i++) d = run(env, d, { type: 'answer', text: `Small thing ${i}` })
    expect(run(env, d, { type: 'answer', text: 'One too many' }).today).toHaveLength(MAX_TODAY)
    expect(limitNote(d, 'today')).toMatch(/most one session chooses for a day/)
    expect(isToday(d, EXISTING, 'w-samples')).toBe(true)
  })
})

describe('cross-horizon linkage stays visible', () => {
  it('each goal column carries its lines across the horizons, existing and new side by side', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' }, { type: 'continue' }, { type: 'continue' },
      { type: 'answer', text: 'Order the desk', goal: 'g-office' })
    const office = goalColumns(d, EXISTING).find((c) => c.key === 'g-office')!
    expect(office.season).toEqual([{ text: 'Desk in place', existing: false }])
    expect(office.month).toEqual([{ text: 'Paint the walls', existing: true }, { text: 'Order the desk', existing: false }])
    expect(office.week).toEqual([{ id: 'w-samples', text: 'Buy paint samples', existing: true, today: false }])
  })

  it('the month question names the goal, and the season line above it is in view', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-garden' })
    expect(questionFor(d, 'month', labels).prompt).toBe('What is October’s part of “Grow food in the garden”?')
    expect(goalColumns(d, EXISTING)[0].season).toEqual([{ text: 'Two raised beds built', existing: true }])
  })
})

describe('corrections', () => {
  it('back returns to the previous screen, keeping its answers', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' }, { type: 'continue' }, { type: 'back' })
    expect(d.step).toBe('season')
    expect(d.season[0].text).toBe('Desk in place')
  })

  it('edit jumps to any horizon and goal; changing a line is explicit, by its id — answering again adds', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' }, { type: 'continue' }, { type: 'continue' },
      { type: 'edit', level: 'season', goal: 'g-office' })
    expect(d.step).toBe('season')
    const fixed = run(env, d, { type: 'editLine', level: 'season', id: d.season[0].id, text: 'Desk, shelves and lamp' })
    expect(fixed.season).toEqual([expect.objectContaining({ id: d.season[0].id, text: 'Desk, shelves and lamp', goalId: 'g-office' })])
    expect(run(env, d, { type: 'answer', text: 'Lamp chosen' }).season.map((l) => l.text)).toEqual(['Desk in place', 'Lamp chosen'])
    expect(run(env, d, { type: 'removeLine', level: 'season', id: d.season[0].id }).season).toEqual([])
  })

  it('a row already written cannot be changed or removed here — its edit would never be saved', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' })
    const id = d.season[0].id
    const saved = run(env, d, { type: 'markSaved', ids: [id] })
    expect(run(env, saved, { type: 'editLine', level: 'season', id, text: 'Changed' }).season[0].text).toBe('Desk in place')
    expect(run(env, saved, { type: 'removeLine', level: 'season', id }).season).toHaveLength(1)
    expect(run(env, saved, { type: 'defer', goal: 'g-office' }).season).toHaveLength(1)
  })

  it('editing above where the session started widens it', () => {
    const env = envWith()
    const d = run(env, newDraft('month', EXISTING), { type: 'edit', level: 'year' })
    expect(d.startAt).toBe('year')
    expect(d.step).toBe('year')
  })

  it('a new goal can be renamed or removed (with its lines); an existing one is only left out of the session', () => {
    const env = envWith()
    let d = run(env, toSeason(env))
    const spanish = idOf(d, 'Speak simple Spanish')
    d = run(env, d, { type: 'answer', text: 'Course done', goal: spanish }, { type: 'renameGoal', id: spanish, text: 'Speak everyday Spanish' })
    expect(d.goals.find((g) => g.id === spanish)?.title).toBe('Speak everyday Spanish')
    const removed = run(env, d, { type: 'removeGoal', id: spanish })
    expect(removed.goals.some((g) => g.id === spanish)).toBe(false)
    expect(removed.season).toEqual([])
    expect(run(env, d, { type: 'removeGoal', id: 'g-garden' }).goals).toHaveLength(4) // existing goals aren't removed
    const out = run(env, d, { type: 'leaveOut', id: 'g-garden', out: true })
    expect(goalColumns(out, EXISTING).map((c) => c.title)).not.toContain('Grow food in the garden')
    expect(out.goals.find((g) => g.id === 'g-garden')?.leftOut).toBe(true) // still there, not deleted
  })

  it('a voice answer names its goal by title, else lands on the goal on screen', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Beds planted with garlic', goal: 'grow food in the garden' })
    expect(d.season).toEqual([expect.objectContaining({ goalId: 'g-garden' })])
  })

  it('keeps answers to one tidy line, and ignores empty ones', () => {
    const env = envWith()
    const d = run(env, newDraft('year', EXISTING), { type: 'addGoal', text: '  lots   of\nspace  ' }, { type: 'addGoal', text: '   ' })
    expect(d.goals.map((g) => g.title)).toContain('lots of space')
    expect(d.goals).toHaveLength(3)
  })
})

describe('the five starts', () => {
  it('each start covers only its horizon and below', () => {
    expect(stepsFor('week')).toEqual(['week', 'today'])
    const env = envWith()
    const d = run(env, newDraft('month', EXISTING), { type: 'continue' })
    expect(d.step).toBe('month:check')
    expect(progress(d, EXISTING).slice(0, 2).map((p) => p.state)).toEqual(['before', 'before'])
  })
  it('starting at today goes straight to the review', () => {
    const env = envWith()
    expect(run(env, newDraft('today', EXISTING), { type: 'toggleToday', id: 'w-samples' }, { type: 'continue' }).step).toBe('review')
  })
})

describe('save and resume', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } }
  }
  it('a session keeps the periods it began with, and says which have moved', () => {
    const oct = draftPeriods({ year: 2026, seasonStart: new Date(2026, 8, 1), monthStart: new Date(2026, 9, 1), weekStart: new Date(2026, 9, 3), today: new Date(2026, 9, 8) })
    const nov = draftPeriods({ year: 2026, seasonStart: new Date(2026, 8, 1), monthStart: new Date(2026, 10, 1), weekStart: new Date(2026, 10, 7), today: new Date(2026, 10, 9) })
    const d = newDraft('year', EXISTING, oct)
    expect(d.periods).toEqual(oct)
    expect(stalePeriods(d, oct)).toEqual([])
    expect(stalePeriods(d, nov)).toEqual(['monthStart', 'weekStart', 'today'])
  })

  it('a resumed session is checked against what the person may see now', () => {
    const env = envWith()
    let d = run(env, toSeason(env), { type: 'focus', goal: 'g-garden' }, { type: 'answer', text: 'Garlic planted' },
      { type: 'continue' }, { type: 'continue' }, { type: 'focus', goal: 'g-garden' }, { type: 'answer', text: 'Order bulbs' },
      { type: 'continue' }, { type: 'continue' }, { type: 'toggleToday', id: 'w-samples' })
    const bulbs = d.month[0]
    d = run(env, d, { type: 'setLineSource', id: bulbs.id, sourceId: 's-beds' })
    // Now: the garden goal is no longer visible (a filter, another account), the
    // samples task is gone, and the office's title changed.
    const now: ExistingPlan = { goals: [{ id: 'g-office', title: 'Home office, finished', context: 'work' }], items: [] }
    const r = reconcileDraft(d, now)
    expect(r.goals.map((g) => g.title)).toEqual(['Home office, finished', 'Speak simple Spanish', 'Launch the newsletter'])
    expect(r.goals.find((g) => g.id === 'g-office')?.context).toBe('work')
    expect(r.season.some((l) => l.goalId === 'g-garden')).toBe(false)
    expect(r.month.some((l) => l.goalId === 'g-garden')).toBe(false)
    expect(r.today).toEqual([])
  })

  it('round-trips a multi-goal session mid-horizon, per account, and clears', () => {
    const s = mem()
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' })
    expect(writeDraft('u1', d, s)).toBe(true)
    const back = readDraft('u1', s)!
    expect(back.step).toBe('season')
    expect(back.focus).toBe(d.focus)
    expect(back.goals).toHaveLength(4)
    expect(readDraft('u2', s)).toBeNull()
    writeDraft('u1', null, s)
    expect(readDraft('u1', s)).toBeNull()
  })
  it('names where the unfinished session stopped', () => {
    const env = envWith()
    const d = run(env, toSeason(env), { type: 'answer', text: 'Desk in place' })
    expect(resumeSummary(d, labels)).toBe('Started from the year · stopped on Fall · 4 goals, 3 new lines not saved yet')
  })
  it('ignores the old single-goal draft and anything malformed', () => {
    const s = mem()
    s.setItem('symphony.voicePlan.draft.u1', JSON.stringify({ version: 1, startAt: 'year', step: 'year', week: [], ids: {} }))
    expect(readDraft('u1', s)).toBeNull()
    s.setItem('symphony.voicePlan.draft.u1', JSON.stringify({ ...newDraft('year', EXISTING), version: 2, periods: undefined }))
    expect(readDraft('u1', s)).toBeNull()
    s.setItem('symphony.voicePlan.draft.u1', '{nope')
    expect(readDraft('u1', s)).toBeNull()
  })
  it('reports a storage failure instead of pretending', () => {
    expect(writeDraft('u1', newDraft('year'), { setItem: () => { throw new Error('quota') }, removeItem: () => {} })).toBe(false)
  })
})
