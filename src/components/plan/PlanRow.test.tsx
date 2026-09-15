import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlanRow, rowIsDone, rowOwnsCompletion, type PlanRowModel } from './PlanRow'

const row = (over: Partial<PlanRowModel> = {}): PlanRowModel => ({
  id: 'r1', title: 'Fix the back door', isGoal: false, fate: 'open', kind: 'task', ...over,
})

describe('PlanRow', () => {
  it('separates rows with a hairline, and the last one leaves it to the card', () => {
    render(
      <ul>
        <PlanRow row={row({ id: 'a', title: 'A' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />
        <PlanRow row={row({ id: 'b', title: 'B' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} />
      </ul>,
    )
    const items = screen.getAllByRole('listitem')
    for (const li of items) {
      expect(li.className).toContain('border-b')
      // The hover runs the full width rather than floating as an inset chip.
      expect(li.className).not.toContain('rounded-lg')
      expect(li.className).toContain('last:border-0')
    }
  })

  it('a goal reads as a promise, a task as a line', () => {
    render(<ul><PlanRow row={row({ isGoal: true, title: 'A home easier to care for' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.getByText('A home easier to care for').className).toContain('font-display')
  })
})

describe('the two questions a finished row answers', () => {
  it('reads as finished is not may be reopened here', () => {
    expect(rowIsDone('placed-done')).toBe(true)
    expect(rowOwnsCompletion('placed-done')).toBe(false)
  })
})


// "Transform the porch" is an outcome. "Hang plants" and "buy new chairs" are
// the work it takes. The goal holds them.
describe('a goal holds the steps that serve it', () => {
  const goalWithSteps = row({
    id: 'g1', title: 'Transform the porch', isGoal: true,
    steps: [
      row({ id: 's1', title: 'Hang plants' }),
      row({ id: 's2', title: 'Buy new chairs' }),
    ],
  })

  it('hides its steps until it is expanded', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.queryByText('Hang plants')).not.toBeInTheDocument()
  })

  it('shows its steps when expanded', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded /></ul>)
    expect(screen.getByText('Hang plants')).toBeInTheDocument()
    expect(screen.getByText('Buy new chairs')).toBeInTheDocument()
  })

  it('offers a disclosure that says what it will do', async () => {
    const onToggleExpand = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} onToggleExpand={onToggleExpand} /></ul>)
    const button = screen.getByRole('button', { name: /Show steps under Transform the porch/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(onToggleExpand).toHaveBeenCalledWith(goalWithSteps)
  })

  it('a bare goal with no way to take steps offers no disclosure', () => {
    render(<ul><PlanRow row={row({ id: 'g2', title: 'Swim again', isGoal: true })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /steps under Swim again/i })).not.toBeInTheDocument()
  })

  it('a plain task never offers a disclosure', () => {
    render(<ul><PlanRow row={row({ title: 'Call the roofer' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} onAddStep={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /steps under Call the roofer/i })).not.toBeInTheDocument()
  })

  it('adds a step from the inline form', async () => {
    const onAddStep = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={onAddStep} /></ul>)
    await userEvent.type(screen.getByLabelText(/New step for Transform the porch/i), 'Repaint the railing{enter}')
    expect(onAddStep).toHaveBeenCalledWith(goalWithSteps, 'Repaint the railing')
  })

  it('ignores an empty step', async () => {
    const onAddStep = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={onAddStep} /></ul>)
    await userEvent.type(screen.getByLabelText(/New step for Transform the porch/i), '   {enter}')
    expect(onAddStep).not.toHaveBeenCalled()
  })

  // Three steps done is not a transformed porch. No scoreboard on the goal.
  it('shows no count and no progress on the goal row', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    const goal = screen.getByText('Transform the porch').closest('li')!
    expect(within(goal).queryByText(/\b2\b/)).not.toBeInTheDocument()
    expect(within(goal).queryByText(/0\s*\/\s*2/)).not.toBeInTheDocument()
  })

  it('gives each step the verbs the caller allows, not the ones the goal has', () => {
    render(
      <ul>
        <PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded
          stepActionsFor={() => ['today']} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /Do it today Hang plants/i })).toBeInTheDocument()
  })
})
