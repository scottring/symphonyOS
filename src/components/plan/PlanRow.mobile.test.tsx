import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PlanRow, type PlanRowModel } from './PlanRow'

vi.mock('@/hooks/useMobile', () => ({ useMobile: () => true }))

const goal: PlanRowModel = {
  id: 'g', title: 'Plan winter vacation', isGoal: true, kind: 'task', fate: 'open',
  steps: [{ id: 's', title: 'Price flights', isGoal: false, kind: 'task', fate: 'open' }],
}
const row = (expanded: boolean) => (
  <ul><PlanRow row={goal} expanded={expanded} actions={['complete', 'drop']} onAction={vi.fn()} onOpen={vi.fn()}
    onAddStep={vi.fn()} onToggleExpand={vi.fn()} assign={() => <button type="button">People</button>} /></ul>
)

// Codex review of the tightened rows (2026-09-27): on a phone each shut goal
// was tall — a separate people line and a Move menu under every one.
describe('a goal on a phone', () => {
  it('shut: one compact entry — people on the "· show" line, no Move menu', () => {
    render(row(false))
    const show = screen.getByRole('button', { name: /· show$/ })
    expect(within(show.parentElement!).getByRole('button', { name: 'People' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'People' })).toHaveLength(1)
    expect(screen.queryByRole('combobox', { name: 'Move Plan winter vacation' })).toBeNull()
  })

  it('opened: the Move menu is back', () => {
    render(row(true))
    expect(screen.getByRole('combobox', { name: 'Move Plan winter vacation' })).toBeInTheDocument()
  })
})
