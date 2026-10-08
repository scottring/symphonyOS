import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VoicePlanner, type VoicePlannerProps } from './VoicePlanner'
import { DemoTransport } from '@/lib/voiceOnboarding/transport'
import type { VoicePlanWriters } from '@/lib/voiceOnboarding/savePlan'
import type { DraftPeriods, ExistingPlan, VoicePlanDraft } from '@/lib/voiceOnboarding/flow'

const labels = { year: '2026', season: 'Fall', month: 'October', week: 'Oct 3 – 9', today: 'Thursday' }
const periodsNow: DraftPeriods = { year: 2026, seasonStart: '2026-09-01', monthStart: '2026-10-01', weekStart: '2026-10-03', today: '2026-10-08' }
// Names a session's own fixed periods: October's, or November's after a month.
const labelsFor = (p: DraftPeriods) => (p.monthStart === '2026-11-01' ? { ...labels, month: 'November', week: 'Nov 7 – 13', today: 'Monday' } : labels)
const EXISTING: ExistingPlan = {
  goals: [{ id: 'g-garden', title: 'Grow food in the garden' }, { id: 'g-office', title: 'Finish the home office' }],
  items: [
    { id: 's-beds', title: 'Two raised beds built', horizon: 'season', goalId: 'g-garden' },
    { id: 'w-samples', title: 'Buy paint samples', horizon: 'week', goalId: 'g-office' },
  ],
  lookBack: { month: 3, season: 0 },
}

function setup(over: Partial<VoicePlannerProps> = {}, voice = false) {
  const writers: VoicePlanWriters = { addYearGoal: vi.fn(async () => true), addTask: vi.fn(async () => true), planForToday: vi.fn(async () => true) }
  const transport = new DemoTransport()
  const stop = vi.spyOn(transport, 'stop')
  const makeTransport = vi.fn(() => transport)
  let saved: VoicePlanDraft | null = null
  const persistDraft = vi.fn((d: VoicePlanDraft | null) => { saved = d; return true })
  let n = 0
  const utils = render(
    <VoicePlanner labels={labels} periodsNow={periodsNow} labelsFor={labelsFor} existing={EXISTING} initialDraft={null} persistDraft={persistDraft} writers={writers}
      makeTransport={voice ? makeTransport : undefined} newId={() => `n${++n}`} {...over} />,
  )
  return { ...utils, writers, transport, stop, makeTransport, persistDraft, saved: () => saved, user: userEvent.setup() }
}
type User = ReturnType<typeof userEvent.setup>

const plan = () => within(screen.getByRole('complementary', { name: 'Your plan' }))
const cont = (user: User, name: RegExp) => user.click(screen.getByRole('button', { name }))

/** Home → Build → Year, add two goals, through the year's checkpoint to the season. */
async function toSeason(user: User) {
  await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
  await user.click(screen.getByRole('button', { name: /^Year/ }))
  for (const g of ['Speak simple Spanish', 'Launch the newsletter']) {
    await user.type(screen.getByRole('textbox', { name: 'Add a goal' }), g)
    await user.click(screen.getByRole('button', { name: 'Add goal' }))
  }
  await cont(user, /Look at the whole year/)
  await cont(user, /Continue to Fall/)
}

describe('VoicePlanner', () => {
  it('separates the intent from the horizon, and offers no unfinished session when there is none', async () => {
    const { user } = setup()
    for (const name of [/^Build my plan/, /^Add to my plan/, /^Review my plan/]) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByText(/Continue your unfinished session/)).toBeNull()
    expect(screen.queryByText(/Pick up where you are|The bigger picture/)).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    for (const level of ['Year', 'Season', 'Month', 'Week', 'Today']) expect(screen.getByRole('button', { name: new RegExp(`^${level}`) })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Year/ })).toHaveTextContent('2 goals on your plan')
  })

  it('plans breadth-first: the whole year at a checkpoint, then every goal’s season on one screen', async () => {
    const { user, makeTransport } = setup()
    await toSeason(user)
    // The garden already has a Fall line, so the question opens on the office.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('By the end of Fall, what would show “Finish the home office” moving?')
    const rows = within(screen.getByRole('list', { name: 'Fall, goal by goal' }))
    expect(rows.getByText(/On Fall already: Two raised beds built/)).toBeInTheDocument()
    expect(rows.getAllByRole('listitem')).toHaveLength(5) // four goals and "Something else"
    await user.type(screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ }), 'Desk and shelves in place{Enter}')
    // Still the season, still this goal — another line is one more Enter away.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('“Finish the home office”')
    await user.click(screen.getByRole('button', { name: 'Next goal →' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('“Speak simple Spanish”')
    expect(plan().getByText('Desk and shelves in place')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Progress' })).toHaveTextContent('Fall2 of 4 goals')
    expect(makeTransport).not.toHaveBeenCalled()
  })

  // 2026-10-08 review: "nutrition, equipment, training under one health aim".
  it('a goal takes several lines — Add another adds, the pencil changes one, and nothing is overwritten', async () => {
    const { user } = setup()
    await toSeason(user)
    const field = () => screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ })
    await user.type(field(), 'Desk in place{Enter}')
    await user.type(field(), 'Shelves up{Enter}')
    const lines = within(screen.getByRole('list', { name: 'Fall for “Finish the home office”' }))
    expect(lines.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Desk in place', 'Shelves up'])
    await user.click(lines.getByRole('button', { name: 'Change “Shelves up”' }))
    const edit = screen.getByRole('textbox', { name: 'Change “Shelves up”' })
    await user.clear(edit)
    await user.type(edit, 'Shelves and lamp{Enter}')
    expect(lines.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Desk in place', 'Shelves and lamp'])
  })

  it('a month line is for the Fall line the person picks; week tasks pick their own month line', async () => {
    const { user, writers } = setup()
    await toSeason(user)
    const fall = () => screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ })
    await user.type(fall(), 'Desk in place{Enter}')
    await user.type(fall(), 'Shelves up{Enter}')
    await cont(user, /Look at Fall across your goals/)
    await cont(user, /Continue to October/)
    await user.click(screen.getByRole('button', { name: /^Finish the home office/ }))
    const oct = () => screen.getByRole('textbox', { name: /October for “Finish the home office”/ })
    await user.type(oct(), 'Order the desk{Enter}')
    await user.type(oct(), 'Buy brackets{Enter}')
    const pickFor = (line: string) => screen.getByRole('combobox', { name: `Which Fall line is “${line}” for?` })
    expect(pickFor('Order the desk')).toHaveValue('') // two Fall lines: nothing assumed
    await user.selectOptions(pickFor('Order the desk'), 'Desk in place (new)')
    await user.selectOptions(pickFor('Buy brackets'), 'Shelves up (new)')
    await cont(user, /Look at October across your goals/)
    await cont(user, /Continue to the week/)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Which goal it serves' }), 'Finish the home office')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Which October line it is for' }), 'Order the desk (new)')
    await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), 'Measure the corner{Enter}')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Which October line it is for' }), 'Buy brackets (new)')
    await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), 'Find the stud finder{Enter}')
    await user.click(screen.getByRole('button', { name: 'Review what’s new' }))
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    const sent = (writers.addTask as ReturnType<typeof vi.fn>).mock.calls.map(([title, o]) => [title, o.sourceId])
    const id = (t: string) => (writers.addTask as ReturnType<typeof vi.fn>).mock.calls.find(([title]) => title === t)![1].id
    expect(sent).toEqual([
      ['Desk in place', undefined], ['Shelves up', undefined],
      ['Order the desk', id('Desk in place')], ['Buy brackets', id('Shelves up')],
      ['Measure the corner', id('Order the desk')], ['Find the stud finder', id('Buy brackets')],
    ])
  })

  it('without live voice there are no voice controls — typing is the way', async () => {
    const { user } = setup()
    expect(screen.getByText('Guided planning')).toBeInTheDocument()
    await toSeason(user)
    expect(screen.queryByRole('button', { name: 'Talk it through' })).toBeNull()
    expect(screen.queryByText(/Simulation/)).toBeNull()
  })

  it('a doable answer goes onto this week for that goal, and the session stays on the season for the rest', async () => {
    const { user } = setup()
    await toSeason(user)
    await user.type(screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ }), 'Call the carpenter about shelves{Enter}')
    await user.click(screen.getByRole('button', { name: 'Put it on this week instead' }))
    expect(screen.getByText(/On this week: Call the carpenter about shelves/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next goal →' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('“Speak simple Spanish”')
    // Not this season, for one goal, is allowed.
    await user.click(screen.getByRole('button', { name: 'Not this season' }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('“Launch the newsletter”')
    await cont(user, /Look at Fall across your goals/)
    const check = within(screen.getByRole('list', { name: 'Fall, across your goals' }))
    expect(check.getByText('Not this season')).toBeInTheDocument()
    expect(check.getByText('Gone straight to this week')).toBeInTheDocument()
    expect(check.getByText(/Two raised beds built/)).toBeInTheDocument()
  })

  it('starts voice only on the explicit tap, labels the simulation, fills the goal on screen, and releases it on leaving', async () => {
    const { user, makeTransport, stop, unmount } = setup({}, true)
    await toSeason(user)
    await user.click(screen.getByRole('button', { name: 'Talk it through' }))
    expect(makeTransport).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Simulation — no microphone, nothing sent anywhere/)).toBeInTheDocument()
    expect(screen.getByText(/\(Finish the home office\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simulate saying the example' }))
    expect(plan().getByText('Desk and shelves in place')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mute' }))
    expect(screen.getByRole('button', { name: 'Unmute' })).toHaveAttribute('aria-pressed', 'true')
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('a dropped connection falls back to typing without losing the plan', async () => {
    const { user } = setup({}, true)
    await toSeason(user)
    await user.click(screen.getByRole('button', { name: 'Talk it through' }))
    await user.click(screen.getByRole('button', { name: 'Simulate a dropped connection' }))
    expect(screen.getByRole('alert')).toHaveTextContent('The voice connection dropped')
    expect(screen.getByRole('textbox', { name: /Fall for/ })).toBeEnabled()
    expect(plan().getByText('Launch the newsletter')).toBeInTheDocument()
  })

  it('writes nothing until Save, saves only what is new, and chooses an existing task for today on its own row', async () => {
    const { user, writers } = setup()
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Week/ }))
    await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), 'Paint a test patch{Enter}')
    expect(within(screen.getByRole('list', { name: 'This week' })).getByText('Buy paint samples').closest('li')).toHaveTextContent('On your week')
    await cont(user, /Look at the whole week/)
    await cont(user, /Continue to today/)
    await user.click(screen.getByRole('button', { name: /Buy paint samples/ }))
    await cont(user, /Review the plan/)
    expect(writers.addTask).not.toHaveBeenCalled()
    const review = within(screen.getByRole('list', { name: 'What will be saved' }))
    expect(review.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'This weekPaint a test patch',
      'Thursday — chosen for the dayBuy paint samples',
    ])
    expect(screen.getByText(/Kept as they are, not copied: 2 goals and 2 lines/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(writers.addTask).toHaveBeenCalledTimes(1)
    expect(writers.planForToday).toHaveBeenCalledWith('w-samples', periodsNow)
    expect(writers.addYearGoal).not.toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Your plan is in Symphony' })).toBeInTheDocument()
  })

  it('says exactly what did not save, and a retry adds nothing twice', async () => {
    const addTask = vi.fn(async (title: string) => title !== 'Second task')
    const { user } = setup({ writers: { addYearGoal: vi.fn(async () => true), addTask, planForToday: vi.fn(async () => true) } })
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Week/ }))
    for (const t of ['First task', 'Second task']) await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), `${t}{Enter}`)
    await user.click(screen.getByRole('button', { name: 'Review what’s new' }))
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 of 2 saved. These didn’t save:Second task')
    addTask.mockImplementation(async () => true)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(addTask.mock.calls.map((c) => c[0])).toEqual(['First task', 'Second task', 'Second task'])
    expect(await screen.findByRole('heading', { name: 'Your plan is in Symphony' })).toBeInTheDocument()
  })

  it('stops mid-horizon and offers the unfinished session back, with where it stopped', async () => {
    const { user, saved, rerender, persistDraft, writers } = setup()
    await toSeason(user)
    await user.type(screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ }), 'Desk in place{Enter}')
    await user.click(screen.getByRole('button', { name: 'Next goal →' }))
    await user.click(screen.getByRole('button', { name: 'Stop here and continue later' }))
    expect(screen.getByRole('status')).toHaveTextContent('Session kept on this device')
    const card = screen.getByRole('button', { name: /Continue your unfinished session/ })
    expect(card).toHaveTextContent('Started from the year · stopped on Fall · 4 goals, 3 new lines not saved yet')
    // A fresh page load offers the same session.
    rerender(<VoicePlanner key="reload" labels={labels} periodsNow={periodsNow} labelsFor={labelsFor} existing={EXISTING} initialDraft={saved()} persistDraft={persistDraft} writers={writers} />)
    await user.click(screen.getByRole('button', { name: /Continue your unfinished session/ }))
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('“Speak simple Spanish”')
    expect(plan().getByText('Desk in place')).toBeInTheDocument()
  })

  it('a session resumed a month later says it still plans the month it began with, and writes there', async () => {
    const { user, saved, rerender, persistDraft, writers } = setup()
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Week/ }))
    await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), 'Paint a test patch{Enter}')
    await user.click(screen.getByRole('button', { name: 'Stop here and continue later' }))
    const november = { ...periodsNow, monthStart: '2026-11-01', weekStart: '2026-11-07', today: '2026-11-09' }
    rerender(<VoicePlanner key="later" labels={labelsFor(november)} periodsNow={november} labelsFor={labelsFor} existing={EXISTING} initialDraft={saved()} persistDraft={persistDraft} writers={writers} />)
    expect(screen.getByRole('button', { name: /Continue your unfinished session/ })).toHaveTextContent('Planned for October, week of Oct 3 – 9, today Thursday — it still writes there.')
    await user.click(screen.getByRole('button', { name: /Continue your unfinished session/ }))
    expect(screen.getByRole('note')).toHaveTextContent('This session plans October and the week of Oct 3 – 9')
    await user.click(screen.getByRole('button', { name: 'Review what’s new' }))
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(writers.addTask).toHaveBeenCalledWith('Paint a test patch', expect.objectContaining({ periods: periodsNow }))
  })

  it('a resumed session drops a goal the person can no longer see, before anything is saved', async () => {
    const { user, saved, rerender, persistDraft, writers } = setup()
    await toSeason(user)
    await user.click(screen.getByRole('button', { name: /^Grow food in the garden/ }))
    await user.type(screen.getByRole('textbox', { name: /Fall for “Grow food in the garden”/ }), 'Garlic in{Enter}')
    await user.click(screen.getByRole('button', { name: 'Stop here and continue later' }))
    const officeOnly: ExistingPlan = { ...EXISTING, goals: [EXISTING.goals[1]], items: [] }
    rerender(<VoicePlanner key="filtered" labels={labels} periodsNow={periodsNow} labelsFor={labelsFor} existing={officeOnly} initialDraft={saved()} persistDraft={persistDraft} writers={writers} />)
    await user.click(screen.getByRole('button', { name: /Continue your unfinished session/ }))
    expect(plan().queryByText('Grow food in the garden')).toBeNull()
    expect(plan().queryByText('Garlic in')).toBeNull()
  })

  it('corrects any goal’s line from the plan panel, then returns', async () => {
    const { user } = setup()
    await toSeason(user)
    await user.type(screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ }), 'Desk in place{Enter}')
    await cont(user, /Look at Fall across your goals/)
    await user.click(screen.getByRole('button', { name: 'Change Fall for Finish the home office' }))
    await user.click(screen.getByRole('button', { name: 'Change “Desk in place”' }))
    const field = screen.getByRole('textbox', { name: 'Change “Desk in place”' })
    await user.clear(field)
    await user.type(field, 'Desk, shelves and lamp{Enter}')
    expect(plan().getByText('Desk, shelves and lamp')).toBeInTheDocument()
    expect(plan().queryByText('Desk in place')).toBeNull()
  })

  it('Add to my plan: what, what it serves, an optional next step — then the same save', async () => {
    const { user, writers } = setup()
    await user.click(screen.getByRole('button', { name: /^Add to my plan/ }))
    await user.click(screen.getByRole('radio', { name: 'A October line' }))
    await user.type(screen.getByRole('textbox', { name: 'A October line' }), 'Choose a desk lamp')
    await user.click(screen.getByRole('radio', { name: /Finish the home office/ }))
    await user.type(screen.getByRole('textbox', { name: /Its next step this week/ }), 'Measure the desk corner')
    expect(within(screen.getByRole('list', { name: 'What will be saved' })).getAllByRole('listitem')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(writers.addTask).toHaveBeenNthCalledWith(1, 'Choose a desk lamp', expect.objectContaining({ level: 'month', goalId: 'g-office' }))
    expect(writers.addTask).toHaveBeenNthCalledWith(2, 'Measure the desk corner', expect.objectContaining({ level: 'week', goalId: 'g-office' }))
    expect(await screen.findByRole('heading', { name: 'Added' })).toBeInTheDocument()
  })

  it('Review my plan hands off to the existing look-backs', async () => {
    const onReview = vi.fn()
    const { user } = setup({ onReview })
    expect(screen.getByRole('button', { name: /^Review my plan/ })).toHaveTextContent('3 lines still open from before')
    await user.click(screen.getByRole('button', { name: /^Review my plan/ }))
    await user.click(screen.getByRole('button', { name: /Look back at last month/ }))
    expect(onReview).toHaveBeenCalledWith('month-review')
  })
})

// 2026-10-08 signed-in review.
describe('VoicePlanner — kept context and a save in flight', () => {
  const WITH_FREE: ExistingPlan = {
    ...EXISTING,
    items: [
      ...EXISTING.items,
      { id: 's-picnic', title: 'A long picnic weekend', horizon: 'season', goalId: null },
      { id: 'm-picnic', title: 'Book the picnic spot', horizon: 'month', goalId: null },
      { id: 'm-basket', title: 'Find the picnic basket', horizon: 'month', goalId: null },
    ],
  }

  it('the year checkpoint lists goals only — no “Something else” posing as a goal', async () => {
    const { user } = setup({ existing: WITH_FREE })
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Year/ }))
    await cont(user, /Look at the whole year/)
    const check = within(screen.getByRole('list', { name: 'Your 2026, as a whole' }))
    expect(check.queryByText('Something else')).toBeNull()
    expect(check.getAllByRole('listitem')).toHaveLength(2)
  })

  it('lines already on the plan with no goal stay in view as kept, in the plan and at checkpoints', async () => {
    const { user } = setup({ existing: WITH_FREE })
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Season/ }))
    expect(plan().getByText('A long picnic weekend')).toBeInTheDocument()
    expect(plan().getByText('Book the picnic spot')).toBeInTheDocument()
    expect(plan().getByText('Find the picnic basket')).toBeInTheDocument()
    await cont(user, /Look at Fall across your goals/)
    const check = within(screen.getByRole('list', { name: 'Fall, across your goals' }))
    expect(check.getByText('A long picnic weekend').closest('span')).toHaveTextContent('A long picnic weekend · kept')
  })

  it('while Save is in flight nothing on the session can be changed or left', async () => {
    let finish: (v: boolean) => void = () => {}
    const addTask = vi.fn(() => new Promise<boolean>((r) => { finish = r }))
    const { user } = setup({ writers: { addYearGoal: vi.fn(async () => true), addTask, planForToday: vi.fn(async () => true) } })
    await user.click(screen.getByRole('button', { name: /^Build my plan/ }))
    await user.click(screen.getByRole('button', { name: /^Week/ }))
    await user.type(screen.getByRole('textbox', { name: 'Add a task for this week' }), 'Paint a test patch{Enter}')
    await user.click(screen.getByRole('button', { name: 'Review what’s new' }))
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(screen.getByRole('button', { name: 'Stop here and continue later' })).toBeDisabled()
    for (const b of within(screen.getByRole('navigation', { name: 'Progress' })).getAllByRole('button')) expect(b).toBeDisabled()
    finish(true)
    expect(await screen.findByRole('heading', { name: 'Your plan is in Symphony' })).toBeInTheDocument()
    expect(addTask).toHaveBeenCalledTimes(1)
  })
})

describe('VoicePlanner — the typed guide', () => {
  it('says what asking sends before anything is sent; a proposal joins the draft only on Add', async () => {
    const askGuide = vi.fn(async (r: { horizon: string; focus: string | null }) => ({
      reply: 'Two priorities there.', proposals: [{ level: r.horizon, goal: r.focus, text: 'Order the desk' }, { level: r.horizon, goal: r.focus, text: 'Buy brackets' }],
    }))
    const { user, writers } = setup({ askGuide: askGuide as never })
    await toSeason(user)
    await cont(user, /Look at Fall across your goals/)
    await cont(user, /Continue to October/)
    expect(screen.getByText(/Asking sends your message and this session’s goals and lines/)).toBeInTheDocument()
    expect(askGuide).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Message to the guide' }), 'Desk and shelves{Enter}')
    const sent = askGuide.mock.calls[0][0] as unknown as { goals: { ref: string; title: string }[]; lines: { text: string }[] }
    expect(sent.goals.map((g) => g.ref)).toEqual(['g1', 'g2', 'g3', 'g4']) // refs, never row ids
    expect(JSON.stringify(sent)).not.toContain('g-office')
    expect(sent.lines.map((l) => l.text)).toContain('Two raised beds built')
    const suggested = within(screen.getByRole('list', { name: 'Suggested lines' }))
    expect(plan().queryByText('Order the desk')).toBeNull()
    await user.click(suggested.getAllByRole('button', { name: /Add/ })[0])
    expect(plan().getByText('Order the desk')).toBeInTheDocument()
    expect(plan().queryByText('Buy brackets')).toBeNull()
    expect(writers.addTask).not.toHaveBeenCalled()
  })

  it('suggestions asked on one step are not offered after moving on', async () => {
    const askGuide = vi.fn(async (r: { horizon: string; focus: string | null }) => ({ reply: 'Ok.', proposals: [{ level: r.horizon, goal: r.focus, text: 'Desk in place' }] }))
    const { user } = setup({ askGuide: askGuide as never })
    await toSeason(user)
    await user.type(screen.getByRole('textbox', { name: 'Message to the guide' }), 'Desk{Enter}')
    expect(screen.getByRole('list', { name: 'Suggested lines' })).toBeInTheDocument()
    await cont(user, /Look at Fall across your goals/)
    expect(screen.queryByRole('list', { name: 'Suggested lines' })).toBeNull()
  })

  it('a guide that fails leaves the plan and typing as they were', async () => {
    const { user } = setup({ askGuide: vi.fn(async () => { throw new Error('The guide could not answer just now.') }) })
    await toSeason(user)
    await user.type(screen.getByRole('textbox', { name: 'Message to the guide' }), 'Hello{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('Your plan is unchanged')
    expect(screen.getByRole('textbox', { name: 'Message to the guide' })).toHaveValue('Hello')
    expect(screen.getByRole('textbox', { name: /Fall for “Finish the home office”/ })).toBeEnabled()
  })
})

describe('Add to my plan save consistency', () => {
  it('locks entry while saving and preserves partially saved content for retry', async () => {
    let finish: (value: boolean) => void = () => {}
    const addTask = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const planForToday = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const { user } = setup({ writers: { addYearGoal: vi.fn(async () => true), addTask, planForToday } })
    await user.click(screen.getByRole('button', { name: /^Add to my plan/ }))
    await user.click(screen.getByRole('radio', { name: 'Something for today' }))
    await user.type(screen.getByRole('textbox', { name: 'Something for today' }), 'Measure the wall')
    await user.click(screen.getByRole('button', { name: 'Save to Symphony' }))
    expect(screen.getByRole('textbox', { name: 'Something for today' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'All choices' })).toBeDisabled()
    for (const option of screen.getAllByRole('radio')) expect(option).toBeDisabled()
    finish(true)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(screen.getByRole('textbox', { name: 'Something for today' })).toBeDisabled()
    await user.click(retry)
    expect(await screen.findByRole('heading', { name: 'Added', exact: true })).toBeInTheDocument()
    expect(addTask).toHaveBeenCalledTimes(1)
    expect(planForToday).toHaveBeenCalledTimes(2)
  })
})
