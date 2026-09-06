import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlanRail } from './PlanRail'
import type { PlanRowModel } from './PlanRow'

const row = (over: Partial<PlanRowModel> = {}): PlanRowModel => ({
  id: 'r1', title: 'Fall trips', isGoal: false, fate: 'open', kind: 'task', ...over,
})

describe('PlanRail arrow', () => {
  beforeEach(() => localStorage.clear())

  it('is visible at reduced opacity, not hover-only (demo run 2026-09-06)', () => {
    render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k1"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /This Season/ }))
    const arrow = screen.getByRole('button', { name: 'Add to this month: Fall trips' })
    expect(arrow.className).toContain('opacity-60')
    expect(arrow.className).not.toContain('opacity-0')
  })

  it('carries a verb-phrase title derived from the pull label, without the trailing colon', () => {
    render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k2"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /This Season/ }))
    const arrow = screen.getByRole('button', { name: 'Add to this month: Fall trips' })
    expect(arrow.title).toBe('Add to this month')
  })

  it('shows a one-line hint under the heading the first time, then never again', () => {
    const { unmount } = render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k3"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /This Season/ }))
    expect(screen.getByText('Press → to bring one into this month.')).toBeInTheDocument()
    unmount()

    render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k4"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /This Season/ }))
    expect(screen.queryByText('Press → to bring one into this month.')).not.toBeInTheDocument()
  })

  it('no hint when the rail is look-only (no onPullDown)', () => {
    render(
      <PlanRail
        title="This Year" rows={[row()]} onOpen={vi.fn()}
        emptyCopy="Nothing." storageKey="k5"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /This Year/ }))
    expect(screen.queryByText(/Press →/)).not.toBeInTheDocument()
  })

  const HINT_KEY = 'symphony-plan-rail-hint-seen'

  // Fix round 1 finding 1: the flag used to be written on every PlanRail
  // mount regardless of open/onPullDown — so the first rail anywhere on the
  // page burned the "first time" for every other rail before the user ever
  // saw the hint.
  it('a rail that never opens does not write the hint-seen flag', () => {
    render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k6"
      />,
    )
    expect(localStorage.getItem(HINT_KEY)).toBeNull()
  })

  it('a look-only rail (no onPullDown), even opened, does not write the flag', () => {
    render(<PlanRail title="This Year" rows={[row()]} onOpen={vi.fn()} emptyCopy="Nothing." storageKey="k7" />)
    fireEvent.click(screen.getByRole('button', { name: /This Year/ }))
    expect(localStorage.getItem(HINT_KEY)).toBeNull()
  })

  it('opening a rail with onPullDown and rows shows the hint and THEN writes the flag', () => {
    render(
      <PlanRail
        title="This Season" rows={[row()]} onOpen={vi.fn()} onPullDown={vi.fn()}
        pullLabel="Add to this month:" emptyCopy="Nothing." storageKey="k8"
      />,
    )
    expect(localStorage.getItem(HINT_KEY)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /This Season/ }))
    expect(screen.getByText('Press → to bring one into this month.')).toBeInTheDocument()
    expect(localStorage.getItem(HINT_KEY)).toBe('1')
  })
})
