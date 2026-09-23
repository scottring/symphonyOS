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
  it('makes supporting tasks discoverable without claiming goal progress', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    const goal = screen.getByText('Transform the porch').closest('li')!
    expect(within(goal).getByRole('button', { name: '2 supporting tasks · show' })).toBeInTheDocument()
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

// A JS comment sitting directly inside a fragment is not a comment — it is
// text, and it rendered on every planning row until someone looked at the
// page (2026-09-15). The row's own source comments must never reach the DOM.
describe('the row renders no source comments', () => {
  it('shows no // text on a plain row', () => {
    const { container } = render(<ul><PlanRow row={row({ title: 'Fix the back door' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(container.textContent).not.toContain('//')
  })

  it('shows no // text on an expanded goal with steps', () => {
    const goal = row({ id: 'g9', title: 'Transform the porch', isGoal: true, steps: [row({ id: 's9', title: 'Hang plants' })] })
    const { container } = render(<ul><PlanRow row={goal} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={vi.fn()} /></ul>)
    expect(container.textContent).not.toContain('//')
  })

  it('phone: every verb is reachable from one visible Move picker, never only by hover or swipe', async () => {
    const onAction = vi.fn()
    render(<ul><PlanRow row={row()} actions={['complete', 'to-lower', 'someday', 'drop']} onAction={onAction} onOpen={vi.fn()} lowerLabel="this week" /></ul>)
    const move = screen.getByRole('combobox', { name: 'Move Fix the back door' })
    const options = within(move).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Move to…', 'Take it into this week', 'Someday', 'Drop'])
    await userEvent.selectOptions(move, 'someday')
    expect(onAction).toHaveBeenCalledWith('someday', expect.objectContaining({ id: 'r1' }))
  })
})
