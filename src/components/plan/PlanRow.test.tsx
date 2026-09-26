import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
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
    const button = screen.getByRole('button', { name: /Show next actions under Transform the porch/i })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(button)
    expect(onToggleExpand).toHaveBeenCalledWith(goalWithSteps)
  })

  it('a bare goal with no way to take steps offers no disclosure', () => {
    render(<ul><PlanRow row={row({ id: 'g2', title: 'Swim again', isGoal: true })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /next actions under Swim again/i })).not.toBeInTheDocument()
  })

  // Scott, 2026-09-24: a goal's title started further right than its own
  // children's, so the hierarchy read backwards. Which pixel each title lands
  // on is measured in a browser (outputs/plan-hierarchy); what belongs here is
  // the structure that makes the measurement come out right.
  it('a goal with no disclosure still holds the caret\'s place, so goals agree', () => {
    render(<ul><PlanRow row={row({ id: 'g2', title: 'Swim again', isGoal: true })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    const lane = screen.getByRole('listitem').querySelector('.period-row-caret')
    expect(lane).not.toBeNull()
    expect(lane!.tagName).toBe('SPAN')
    expect(lane).toHaveAttribute('aria-hidden', 'true')
  })

  it('a plain task reserves nothing — it is not in a list of goals', () => {
    render(<ul><PlanRow row={row({ title: 'Call the roofer' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.getByRole('listitem').querySelector('.period-row-caret')).toBeNull()
  })

  it('the real disclosure sits in the same lane as the placeholder', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    expect(screen.getByRole('button', { name: /Show next actions under Transform the porch/i }))
      .toHaveClass('period-row-caret')
  })

  // Codex live test, 2026-09-24: on a November row the hover shortcut sat over
  // "Choose when", and pressing it filed the task into the week containing NOW
  // — September. The control reaches every week the verb could, and says which.
  it('drops the week shortcut from a row whose timing control reaches the week', () => {
    render(
      <ul>
        <PlanRow row={row({ title: 'Fix the back door' })} actions={['complete', 'to-lower', 'today', 'drop']}
          onAction={vi.fn()} onOpen={vi.fn()} planWeek={() => <button type="button">Choose when</button>} timingReachesLower />
      </ul>,
    )
    expect(screen.queryByRole('button', { name: /Take it into/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose when' })).toBeInTheDocument()
    // The verbs it does NOT replace are untouched.
    expect(screen.getByRole('button', { name: /Do it today/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Drop/ })).toBeInTheDocument()
  })

  // The season page's rung below is the MONTH, which the control does not
  // offer. Suppressing there would take away the only way down.
  it('keeps the shortcut where the control reaches a different rung', () => {
    render(
      <ul>
        <PlanRow row={row({ title: 'Swap the closets' })} actions={['complete', 'to-lower', 'drop']}
          lowerLabel="this month"
          onAction={vi.fn()} onOpen={vi.fn()} planWeek={() => <button type="button">Choose when</button>} />
      </ul>,
    )
    expect(screen.getByRole('button', { name: /Take it into this month/ })).toBeInTheDocument()
  })

  it('a step inherits its page\'s answer about the shortcut', () => {
    render(
      <ul>
        <PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded
          stepActionsFor={() => ['to-lower', 'drop']}
          planWeek={() => <button type="button">Choose when</button>} timingReachesLower />
      </ul>,
    )
    expect(screen.queryByRole('button', { name: /Take it into/ })).not.toBeInTheDocument()
  })

  it('indents its steps through the one rule that knows the lanes', () => {
    const { container } = render(
      <ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={vi.fn()} /></ul>,
    )
    const steps = container.querySelector('.period-plan-steps')
    expect(steps).not.toBeNull()
    // Never a hardcoded indent beside the derived one — they drifted apart
    // once already, which is how the goal ended up to the right of its child.
    expect(steps!.className).not.toMatch(/\bpl-\d/)
    expect(container.querySelector('.period-plan-step-add')?.className).not.toMatch(/\bpl-\d/)
  })

  it('a plain task never offers a disclosure', () => {
    render(<ul><PlanRow row={row({ title: 'Call the roofer' })} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} onAddStep={vi.fn()} /></ul>)
    expect(screen.queryByRole('button', { name: /next actions under Call the roofer/i })).not.toBeInTheDocument()
  })

  it('adds a step from the inline form', async () => {
    const onAddStep = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={onAddStep} /></ul>)
    await userEvent.type(screen.getByLabelText(/New next action for Transform the porch/i), 'Repaint the railing{enter}')
    expect(onAddStep).toHaveBeenCalledWith(goalWithSteps, 'Repaint the railing')
  })

  it('ignores an empty step', async () => {
    const onAddStep = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded onAddStep={onAddStep} /></ul>)
    await userEvent.type(screen.getByLabelText(/New next action for Transform the porch/i), '   {enter}')
    expect(onAddStep).not.toHaveBeenCalled()
  })

  // A collapsed goal says how much is open and how much is done — but never
  // a fraction: three steps done is not a transformed porch.
  it('states open and completed counts, and claims no goal progress', () => {
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    const goal = screen.getByText('Transform the porch').closest('li')!
    expect(within(goal).getByRole('button', { name: '2 open · show' })).toBeInTheDocument()
    expect(within(goal).queryByText(/0\s*\/\s*2/)).not.toBeInTheDocument()
  })

  it('counts done steps separately once some are finished', () => {
    const mixed = { ...goalWithSteps, steps: [
      { ...goalWithSteps.steps![0] },
      { ...goalWithSteps.steps![1], fate: 'done' as const },
    ] }
    render(<ul><PlanRow row={mixed} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} /></ul>)
    const goal = screen.getByText('Transform the porch').closest('li')!
    expect(within(goal).getByRole('button', { name: '1 open · 1 done · show' })).toBeInTheDocument()
  })

  // Long lists: reachable without opening the goal first.
  it('offers "Add a step" on a COLLAPSED goal, and opens it to take one', () => {
    const onToggleExpand = vi.fn()
    render(<ul><PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} onAddStep={vi.fn()} onToggleExpand={onToggleExpand} /></ul>)
    const goal = screen.getByText('Transform the porch').closest('li')!
    fireEvent.click(within(goal).getByRole('button', { name: '+ Add a next action' }))
    expect(onToggleExpand).toHaveBeenCalledWith(goalWithSteps)
  })

  // A bound, not a cap: the true total is stated and one press gives it back.
  it('draws only the steps it was given, and offers the rest', () => {
    const onShowAllSteps = vi.fn()
    const many = { ...goalWithSteps, steps: Array.from({ length: 12 }, (_, i) => ({
      id: `s${i}`, title: `Step ${i}`, isGoal: false, kind: 'task' as const, fate: 'open' as const,
    })) }
    render(
      <ul>
        <PlanRow row={many} actions={[]} onAction={vi.fn()} onOpen={vi.fn()} expanded
          stepsToDraw={many.steps!.slice(0, 3)} hiddenByReveal={9} onShowAllSteps={onShowAllSteps} />
      </ul>,
    )
    expect(screen.getByText('Step 2')).toBeInTheDocument()
    expect(screen.queryByText('Step 5')).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'Show all 12 steps · 9 more' })
    fireEvent.click(more)
    expect(onShowAllSteps).toHaveBeenCalledWith(many)
  })

  it('says when the filter is hiding steps of a goal it kept', () => {
    render(
      <ul>
        <PlanRow row={goalWithSteps} actions={[]} onAction={vi.fn()} onOpen={vi.fn()}
          stepsToDraw={[goalWithSteps.steps![0]]} hiddenByFilter={1} />
      </ul>,
    )
    expect(screen.getByText('1 hidden by the filter')).toBeInTheDocument()
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
