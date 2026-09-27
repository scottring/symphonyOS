import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { PageReviewSheet } from './PageReviewSheet'
import type { PlanItem } from '@/lib/planParse'
import type { FamilyMember } from '@/types/family'

// The review sheet's person picker: you once, by id; a real Unassigned; and
// what is shown is what the save receives.

const WINDOW = ['2026-10-05', '2026-10-06', '2026-10-07']
const SCOTT = { id: 'm-scott', name: 'Scott' } as FamilyMember
const IRIS = { id: 'm-iris', name: 'Iris' } as FamilyMember
const MEMBERS = [SCOTT, IRIS]
const line = (title: string, over: Partial<PlanItem> = {}): PlanItem => ({
  title, placement: { kind: 'week' }, time: null, assigneeId: null, note: null, dateHint: null,
  kind: 'task', recurring: null, phone: null, contactMemberId: null, ...over,
})

type Props = Parameters<typeof PageReviewSheet>[0]
function renderSheet(items: PlanItem[], over: Partial<Props> = {}) {
  const onCommit = vi.fn()
  const props: Props = {
    items, notes: [], unclear: [], windowDates: WINDOW, members: MEMBERS, currentMemberId: 'm-scott',
    committing: false, onCommit, onClose: vi.fn(), ...over,
  }
  const view = render(<PageReviewSheet {...props} />)
  return { onCommit, rerender: (next: Partial<Props>) => view.rerender(<PageReviewSheet {...props} {...next} />) }
}
const who = (title: string) => screen.getByRole('combobox', { name: `Assignee for "${title}"` }) as HTMLSelectElement
const labels = (sel: HTMLSelectElement) => within(sel).getAllByRole('option').map((o) => o.textContent)
const saved = (onCommit: ReturnType<typeof vi.fn>) => (onCommit.mock.calls[0][0].items as PlanItem[]).map((i) => [i.title, i.assigneeId])

describe('PageReviewSheet — assignee', () => {
  it('lists the signed-in member exactly once, as "(you)" — no separate "Me" — and starts unnamed lines on them', () => {
    renderSheet([line('Fix gate')])
    expect(labels(who('Fix gate'))).toEqual(['Scott (you)', 'Iris', 'Unassigned'])
    expect(who('Fix gate')).toHaveValue('m-scott')
  })

  it('keeps a line the page assigned to another member', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Pick up dry cleaning', { assigneeId: 'm-iris' })])
    expect(who('Pick up dry cleaning')).toHaveValue('m-iris')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(saved(onCommit)).toEqual([['Pick up dry cleaning', 'm-iris']])
  })

  it('Unassigned saves as null, not as you', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Fix gate'), line('Mow')])
    await user.selectOptions(who('Fix gate'), 'Unassigned')
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(saved(onCommit)).toEqual([['Fix gate', null], ['Mow', 'm-scott']])
  })

  it('a routine gets the same default as a task, and can be set to someone else or Unassigned', async () => {
    const user = userEvent.setup()
    const routine = (title: string) => line(title, { kind: 'recurring', recurring: { days: ['sat'], until: null } })
    const { onCommit } = renderSheet([routine('Trash out'), routine('Water plants'), routine('Feed fish')])
    expect(who('Trash out')).toHaveValue('m-scott')
    await user.selectOptions(who('Water plants'), 'Iris')
    await user.selectOptions(who('Feed fish'), 'Unassigned')
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(saved(onCommit)).toEqual([['Trash out', 'm-scott'], ['Water plants', 'm-iris'], ['Feed fish', null]])
  })

  it('a task turned into a routine keeps its person', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Swim', { assigneeId: 'm-iris', placement: { kind: 'date', date: '2026-10-07' } })])
    await user.selectOptions(screen.getByRole('combobox', { name: 'What is "Swim"?' }), 'routine')
    await user.click(screen.getByRole('button', { name: /add 1 item/i }))
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ kind: 'recurring', assigneeId: 'm-iris' })
  })

  it('with no confirmed identity: no "(you)", unnamed lines start Unassigned and say why — named lines are kept', async () => {
    const user = userEvent.setup()
    const { onCommit } = renderSheet([line('Fix gate'), line('Dry cleaning', { assigneeId: 'm-iris' })], { currentMemberId: null })
    expect(labels(who('Fix gate'))).toEqual(['Scott', 'Iris', 'Unassigned'])
    expect(who('Fix gate')).toHaveValue('__unassigned__')
    expect(screen.getByText(/couldn.t confirm which household member you are/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add 2 items/i }))
    expect(saved(onCommit)).toEqual([['Fix gate', null], ['Dry cleaning', 'm-iris']])
  })

  it('a current member id that is not in the household counts as unknown', () => {
    renderSheet([line('Fix gate')], { currentMemberId: 'm-stranger' })
    expect(labels(who('Fix gate'))).toEqual(['Scott', 'Iris', 'Unassigned'])
    expect(who('Fix gate')).toHaveValue('__unassigned__')
  })

  it('identity arriving after the sheet opens fills only the lines nobody has picked', async () => {
    const user = userEvent.setup()
    const { onCommit, rerender } = renderSheet([line('Fix gate'), line('Mow'), line('Dry cleaning', { assigneeId: 'm-iris' })], { currentMemberId: null })
    // Mow is deliberately left Unassigned by a person — that choice stands.
    await user.selectOptions(who('Mow'), 'Iris')
    await user.selectOptions(who('Mow'), 'Unassigned')
    rerender({ currentMemberId: 'm-scott' })
    expect(who('Fix gate')).toHaveValue('m-scott')
    expect(who('Mow')).toHaveValue('__unassigned__')
    await user.click(screen.getByRole('button', { name: /add 3 items/i }))
    expect(saved(onCommit)).toEqual([['Fix gate', 'm-scott'], ['Mow', null], ['Dry cleaning', 'm-iris']])
  })

  it('the draft route receives the same choices', async () => {
    const user = userEvent.setup()
    const onAddToDraft = vi.fn()
    renderSheet([line('Fix gate'), line('Mow')], { draftLabelFor: () => 'this week', onAddToDraft })
    await user.selectOptions(who('Mow'), 'Unassigned')
    await user.click(screen.getByRole('button', { name: /add to the plan/i }))
    expect((onAddToDraft.mock.calls[0][0].items as PlanItem[]).map((i) => [i.title, i.assigneeId])).toEqual([['Fix gate', 'm-scott'], ['Mow', null]])
  })

  it('a day-fact is a note and has no assignee picker', () => {
    renderSheet([line('No school', { kind: 'dayfact', placement: { kind: 'date', date: '2026-10-06' } })])
    expect(screen.queryByRole('combobox', { name: /Assignee/ })).toBeNull()
  })
})
