import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PageReviewSheet } from './PageReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { FamilyMember } from '@/types/family'

// The review sheet's item type is a control, and what it says is what saves.

const WINDOW = ['2026-10-05', '2026-10-06', '2026-10-07']
const MEMBERS = [{ id: 'm-iris', name: 'Iris' } as FamilyMember]
const line = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({
  title, placement: { kind: 'week' }, time: null, assigneeId: null, note: null, dateHint: null,
  kind: 'task', recurring: null, phone: null, contactMemberId: null, ...over,
})

function renderSheet(items: PlanItem[], over: Partial<Parameters<typeof PageReviewSheet>[0]> = {}) {
  const onCommit = vi.fn()
  render(
    <PageReviewSheet items={items} notes={[]} unclear={[]} windowDates={WINDOW} members={MEMBERS}
      committing={false} onCommit={onCommit} onClose={vi.fn()} {...over} />,
  )
  return { onCommit }
}
const typeOf = (title: string) => screen.getByRole('combobox', { name: `What is "${title}"?` })
/** Above the week: the optional kind, and where the line goes. */
const kindOf = (title: string) => screen.getByRole('combobox', { name: `Kind of "${title}" (optional)` })
const whereOf = (title: string) => screen.getByRole('combobox', { name: `Where "${title}" goes` })

describe('PageReviewSheet — item types', () => {
  it('shows the guessed type as a selector, and saves that guess — not a plain task', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Dentist appointment', { placement: { kind: 'date', date: '2026-10-06' }, time: '14:00' }), line('Fix gate')])
    expect(typeOf('Dentist appointment')).toHaveValue('appointment')
    expect(typeOf('Fix gate')).toHaveValue('task')
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    const items = onCommit.mock.calls[0][0].items as PlanItem[]
    expect(items.map((i) => i.category)).toEqual(['event', 'task'])
  })

  it('converts a row to each type from the keyboard, keeping title, note, assignee and time', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Swim', { placement: { kind: 'date', date: '2026-10-07' }, time: '16:30', note: 'Goggles', assigneeId: 'm-iris' })])
    const select = typeOf('Swim')
    // Reachable by Tab from the row's checkbox.
    await user.click(screen.getByRole('checkbox', { name: 'Include "Swim"' }))
    await user.click(screen.getByRole('checkbox', { name: 'Include "Swim"' }))
    await user.tab()
    expect(select).toHaveFocus()

    for (const type of ['appointment', 'activity', 'task', 'routine', 'goal'] as const) {
      await user.selectOptions(select, type)
      expect(select).toHaveValue(type)
    }
    await user.selectOptions(select, 'activity')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({
      title: 'Swim', note: 'Goggles', assigneeId: 'm-iris', kind: 'task', category: 'activity',
      placement: { kind: 'date', date: '2026-10-07' }, time: '16:30',
    })
  })

  it('a routine needs its days: save is blocked and says why until one is picked', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Water plants', { time: '08:00' })])
    await user.selectOptions(typeOf('Water plants'), 'routine')
    // The When select goes — a routine's when is its days.
    expect(screen.queryByRole('combobox', { name: 'When' })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/1 routine needs its days/i)
    const add = screen.getByRole('button', { name: /add 1 item/i })
    expect(add).toBeDisabled()

    const days = screen.getByRole('group', { name: 'Days "Water plants" repeats' })
    await user.click(within(days).getByRole('button', { name: 'Tuesday' }))
    await user.click(within(days).getByRole('button', { name: 'Thursday' }))
    expect(within(days).getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
    await user.click(add)
    const saved = onCommit.mock.calls[0][0].items[0] as PlanItem
    expect(saved).toMatchObject({ kind: 'recurring', recurring: { days: ['tue', 'thu'], until: null }, time: '08:00' })
    expect(saved).not.toHaveProperty('category')
  })

  it('a routine switched back to a task returns to its list, with no routine pattern saved', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Trash out', { kind: 'recurring', recurring: { days: ['sat'], until: null } })])
    await user.selectOptions(typeOf('Trash out'), 'task')
    expect(screen.getByRole('combobox', { name: 'When' })).toHaveValue('week')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ kind: 'task', category: 'task', recurring: null, placement: { kind: 'week' } })
  })

  it('says appointments stay in Symphony — nothing goes to Google Calendar', async () => {
    const user = userEvent.setup()
    renderSheet([line('Fix gate')])
    expect(screen.queryByText(/google calendar/i)).toBeNull()
    await user.selectOptions(typeOf('Fix gate'), 'appointment')
    expect(screen.getByText(/nothing is added to google calendar/i)).toBeInTheDocument()
  })

  it('the draft offer says which types are saved directly', async () => {
    const user = userEvent.setup()
    renderSheet([line('Fix gate')], { draftLabelFor: () => 'this week', onAddToDraft: vi.fn() })
    expect(screen.queryByText(/saved directly/i)).toBeNull()
    await user.selectOptions(typeOf('Fix gate'), 'activity')
    expect(screen.getByText(/saved directly/i)).toBeInTheDocument()
  })


  it('a week page offers exactly the five answers, and no separate goal toggle anywhere', () => {
    renderSheet([line('Paint the shed', { placement: { kind: 'month' }, goal: true }), line('Buy paint', { placement: { kind: 'month' } })], { today: new Date(2026, 9, 2) })
    expect(Array.from(typeOf('Paint the shed').querySelectorAll('option')).map((o) => o.textContent))
      .toEqual(['Goal or project', 'Action / task', 'Appointment', 'Activity', 'Routine'])
    expect(typeOf('Paint the shed')).toHaveValue('goal')
    expect(typeOf('Buy paint')).toHaveValue('task')
    expect(screen.queryByRole('button', { name: /a goal$/i })).toBeNull()
    expect(screen.queryByText('Make it a goal')).toBeNull()
  })

  it('switching back and forth keeps every other edit, and each type its own details', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Swim', { placement: { kind: 'date', date: '2026-10-07' }, time: '16:30', note: 'Goggles', assigneeId: 'm-iris' }), line('Other')], { today: new Date(2026, 9, 2) })
    // Edits that are not the type's: title, person, inclusion of another row.
    const title = screen.getByDisplayValue('Swim')
    await user.clear(title); await user.type(title, 'Swim lesson')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Assignee for "Swim lesson"' }), '__unassigned__')
    await user.click(screen.getByRole('checkbox', { name: 'Include "Other"' }))
    // Routine: pick days. Goal: no day. Back to routine: days kept. Back to action: day and time kept.
    await user.selectOptions(typeOf('Swim lesson'), 'routine')
    const days = screen.getByRole('group', { name: 'Days "Swim lesson" repeats' })
    await user.click(within(days).getByRole('button', { name: 'Friday' }))
    await user.selectOptions(typeOf('Swim lesson'), 'goal')
    expect(screen.queryByRole('textbox', { name: /time/i })).toBeNull()
    expect(screen.queryByLabelText('Time for "Swim lesson"')).toBeNull()
    await user.selectOptions(typeOf('Swim lesson'), 'routine')
    expect(within(screen.getByRole('group', { name: 'Days "Swim lesson" repeats' })).getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(typeOf('Swim lesson'), 'task')
    expect(screen.getAllByRole('combobox', { name: 'When' })[0]).toHaveValue('2026-10-07')
    expect(screen.getByLabelText('Time for "Swim lesson"')).toHaveValue('16:30')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    const items = onCommit.mock.calls[0][0].items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ title: 'Swim lesson', note: 'Goggles', assigneeId: null, kind: 'task', category: 'task', goal: false, recurring: null, placement: { kind: 'date', date: '2026-10-07' }, time: '16:30' })
    expect(items[0]).not.toHaveProperty('typeDrafts')
  })

  it('an appointment needs a day: its day input shows, save is blocked until set, and any day may be chosen', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Vet', { placement: { kind: 'month' } })], { altitude: 'month', today: new Date(2026, 9, 2) })
    await user.selectOptions(kindOf('Vet'), 'appointment')
    expect(screen.queryByRole('combobox', { name: 'Where "Vet" goes' })).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent(/1 appointment needs its day/i)
    expect(screen.getByRole('button', { name: /add 1 item/i })).toBeDisabled()
    const day = screen.getByLabelText('Day of "Vet"')
    await user.type(day, '2026-12-03')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('An appointment on Thu, Dec 3.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Time for "Vet"'), '09:15')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ category: 'event', placement: { kind: 'date', date: '2026-12-03' }, time: '09:15', goal: false })
  })

  it('a goal is placed on a list, named by its period; on a week page it is the month’s', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Finish the patio', { placement: { kind: 'date', date: '2026-10-06' }, time: '10:00' })], { today: new Date(2026, 9, 2) })
    expect(typeOf('Finish the patio')).toHaveValue('task') // a week page defaults to actions
    await user.selectOptions(typeOf('Finish the patio'), 'goal')
    const where = screen.getByRole('combobox', { name: 'Goal for "Finish the patio"' })
    expect(Array.from(where.querySelectorAll('option')).map((o) => o.textContent)).toEqual(['Goal for Fall 2026', 'Goal for October'])
    expect(where).toHaveValue('month')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ kind: 'task', goal: true, placement: { kind: 'month' }, time: null, recurring: null })
  })

  it('a year page’s lines are on the year’s list; one can become an activity and back', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Run a half', { placement: { kind: 'goal' } }), line('No school', { kind: 'dayfact', placement: { kind: 'date', date: '2026-10-06' } })], { altitude: 'year', windowDates: [], today: new Date(2026, 9, 2) })
    expect(kindOf('Run a half')).toHaveValue('task')
    expect(whereOf('Run a half')).toHaveValue('goal')
    expect(screen.getByText('Day')).toBeInTheDocument()
    await user.selectOptions(kindOf('Run a half'), 'activity')
    expect(whereOf('Run a half')).toHaveValue('someday')
    await user.selectOptions(kindOf('Run a half'), 'task')
    expect(whereOf('Run a half')).toHaveValue('goal')
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    const saved = onCommit.mock.calls[0][0].items[0]
    expect(saved.placement).toEqual({ kind: 'goal' })
    expect(saved).not.toHaveProperty('goal')
  })

  it('above the week, the ready-to-add summary says where the lines go, and linked lines apart', async () => {
    const user = userEvent.setup()
    renderSheet([
      line('Finish the patio', { placement: { kind: 'season' }, goal: true }),
      line('Buy stain', { placement: { kind: 'season' } }),
      line('Change the furnace filter', { placement: { kind: 'season' } }),
    ], { altitude: 'season', today: new Date(2026, 8, 2), existingTasks: [{ id: 't-1', title: 'Change the furnace filters' }] })
    const summary = () => screen.getByText(/Ready to add:/).parentElement!
    expect(summary()).toHaveTextContent(/Ready to add: 3 on \w+’s list$/)
    await user.click(screen.getByRole('button', { name: 'Use existing item' }))
    expect(summary()).toHaveTextContent(/Ready to add: 2 on \w+’s list \/ 1 already on your plan/)
    await user.selectOptions(kindOf('Buy stain'), 'activity')
    expect(summary()).toHaveTextContent(/Ready to add: 2 on \w+’s list \/ 1 already on your plan/)
    await user.selectOptions(whereOf('Buy stain'), 'week')
    expect(summary()).toHaveTextContent(/Ready to add: 1 on \w+’s list \/ 1 on this week’s list \/ 1 already on your plan/)
  })

  it('a week page’s summary still counts each selected type', () => {
    renderSheet([line('Fix gate'), line('Swim', { category: 'activity' })])
    expect(screen.getByText(/Ready to add:/).parentElement).toHaveTextContent('1 action / 1 activity')
  })

  it('a linked line has no type to change: it says Linked, saves nothing new, and unlinking returns its own type', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Change the furnace filter', { placement: { kind: 'month' }, goal: true })], { altitude: 'month', today: new Date(2026, 9, 2), existingTasks: [{ id: 't-1', title: 'Change the furnace filter' }] })
    // A word-for-word repeat starts linked (2026-09-29).
    expect(screen.queryByRole('combobox', { name: /What is/ })).toBeNull()
    expect(screen.getByText('Existing item')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Goal for/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ sourceId: 't-1' })
    await user.click(screen.getByRole('button', { name: 'Don’t use it' }))
    // Its own kind back: a plain list item (a month line is never a goal).
    expect(kindOf('Change the furnace filter')).toHaveValue('task')
  })

  it('on a month draft, list items join it; an activity or routine is saved directly', async () => {
    const user = userEvent.setup()
    renderSheet([line('Read more', { placement: { kind: 'month' }, goal: true })], { altitude: 'month', today: new Date(2026, 9, 2), draftLabelFor: () => 'October', onAddToDraft: vi.fn() })
    expect(screen.queryByText(/saved directly/i)).toBeNull()
    await user.selectOptions(kindOf('Read more'), 'activity')
    expect(screen.getByText('Appointments, activities and routines are saved directly. List items join the plan you’re writing.')).toBeInTheDocument()
  })
})

describe('PageReviewSheet — times', () => {
  it('a day-fact (saved as a note) has no time input; a dated action and a routine do', () => {
    renderSheet([
      line('No school', { kind: 'dayfact', placement: { kind: 'date', date: '2026-10-06' } }),
      line('Dentist', { placement: { kind: 'date', date: '2026-10-06' }, time: '14:00' }),
      line('Water plants', { kind: 'recurring', recurring: { days: ['tue'], until: null }, time: '08:00' }),
      line('Finish the patio', { placement: { kind: 'month' }, goal: true }),
    ], { altitude: 'month', today: new Date(2026, 9, 2) })
    expect(screen.queryByLabelText('Time for "No school"')).toBeNull()
    expect(screen.queryByLabelText('Time for "Finish the patio"')).toBeNull()
    expect(screen.getByLabelText('Time for "Dentist"')).toHaveValue('14:00')
    expect(screen.getByLabelText('Time for "Water plants"')).toHaveValue('08:00')
  })

  it('the time input sizes to its content, so AM/PM is never clipped on a phone', () => {
    renderSheet([line('Dentist', { placement: { kind: 'date', date: '2026-10-06' }, time: '14:00' })])
    const time = screen.getByLabelText('Time for "Dentist"')
    expect(time).toHaveClass('w-auto')
    expect(time.className).not.toMatch(/(^|\s)w-\[/)
  })
})

describe('PageReviewSheet — changing several lines at once (2026-09-28)', () => {
  it('selects lines and makes them all goals; the include checkbox is untouched', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Buy a bench'), line('Hang porch plants'), line('Weed')])
    await user.click(screen.getByRole('button', { name: 'Select several' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select "Buy a bench"' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select "Weed"' }))
    const bar = screen.getByRole('toolbar', { name: 'Change selected lines' })
    expect(within(bar).getByText('2 selected')).toBeInTheDocument()
    await user.click(within(bar).getByRole('button', { name: 'Goal or project' }))
    expect(typeOf('Buy a bench')).toHaveValue('goal')
    expect(typeOf('Hang porch plants')).toHaveValue('task')
    expect(typeOf('Weed')).toHaveValue('goal')
    expect(screen.getByRole('checkbox', { name: 'Include "Hang porch plants"' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    const items = onCommit.mock.calls[0][0].items as PlanItem[]
    expect(items.map((i) => i.title)).toEqual(['Buy a bench', 'Hang porch plants', 'Weed'])
  })

  it("'Don't add' leaves the selected lines out", async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Buy a bench'), line('Weed')])
    await user.click(screen.getByRole('button', { name: 'Select several' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select "Weed"' }))
    await user.click(within(screen.getByRole('toolbar', { name: 'Change selected lines' })).getByRole('button', { name: /Don.t add/ }))
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect((onCommit.mock.calls[0][0].items as PlanItem[]).map((i) => i.title)).toEqual(['Buy a bench'])
  })
})
