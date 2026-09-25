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
const typeOf = (title: string) => screen.getByRole('combobox', { name: `Type of "${title}"` })

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

    for (const type of ['appointment', 'activity', 'task', 'routine'] as const) {
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

  it('Make a goal stays separate from type: offered on a Task only, and an appointment stops being a goal out loud', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Paint the shed', { placement: { kind: 'month' }, goal: true })], { altitude: 'month', today: new Date(2026, 9, 2) })
    expect(screen.getByRole('button', { name: 'Make "Paint the shed" a goal' })).toHaveAttribute('aria-pressed', 'true')
    await user.selectOptions(typeOf('Paint the shed'), 'appointment')
    expect(screen.queryByRole('button', { name: 'Make "Paint the shed" a goal' })).toBeNull()
    expect(screen.getByText(/no longer a goal/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ goal: false, category: 'event' })
  })

  it('says appointments stay in Symphony — nothing goes to Google Calendar', async () => {
    const user = userEvent.setup()
    renderSheet([line('Fix gate')])
    expect(screen.queryByText(/google calendar/i)).toBeNull()
    await user.selectOptions(typeOf('Fix gate'), 'appointment')
    expect(screen.getByText(/nothing is added to google calendar/i)).toBeInTheDocument()
  })

  it('day-facts and year goals keep their fixed labels — they are not one of the four types', () => {
    renderSheet([
      line('No school', { kind: 'dayfact', placement: { kind: 'date', date: '2026-10-06' } }),
      line('Run a half', { placement: { kind: 'goal' } }),
    ], { altitude: 'year' })
    expect(screen.queryByRole('combobox', { name: /Type of/ })).toBeNull()
    expect(screen.getByText('Day')).toBeInTheDocument()
    expect(screen.getByText('Goal')).toBeInTheDocument()
  })

  it('the draft offer says which types are saved directly', async () => {
    const user = userEvent.setup()
    renderSheet([line('Fix gate')], { draftLabelFor: () => 'this week', onAddToDraft: vi.fn() })
    expect(screen.queryByText(/saved directly/i)).toBeNull()
    await user.selectOptions(typeOf('Fix gate'), 'activity')
    expect(screen.getByText(/saved directly/i)).toBeInTheDocument()
  })
})
