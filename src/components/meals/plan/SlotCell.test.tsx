import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlotCell } from './SlotCell'
import type { MealPlanEntry } from '@/types/meal-planner'

const entry: MealPlanEntry = {
  id: 'e1', mealPlanId: 'p1', dayOfWeek: 3, slot: 'dinner',
  recipeId: 'r1', adHocTitle: undefined, notes: undefined, leftoverFrom: undefined,
}

function baseProps() {
  return {
    dayOfWeek: 3, slot: 'dinner' as const, entry, title: 'Trout',
    canLeftoverTomorrow: true, canLeftoverFromLastNight: false,
    canMoveUp: true, canMoveDown: true,
    onChangeRecipe: vi.fn(), onClear: vi.fn(), onLeftoverTomorrow: vi.fn(),
    onPickRecipe: vi.fn(), onTypeName: vi.fn(), onLeftoverFromLastNight: vi.fn(),
    onMoveUp: vi.fn(), onMoveDown: vi.fn(), onAddForMember: vi.fn(),
  }
}

describe('SlotCell', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('dismisses the action menu on an outside mousedown', () => {
    render(<SlotCell {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /dinner actions/i }))
    expect(screen.getByText('Change recipe')).toBeInTheDocument()

    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Change recipe')).toBeNull()
  })

  it('dismisses the action menu on Escape', () => {
    render(<SlotCell {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /dinner actions/i }))
    expect(screen.getByText('Change recipe')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('Change recipe')).toBeNull()
  })

  it('keeps the menu open when clicking inside it', () => {
    render(<SlotCell {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: /dinner actions/i }))
    fireEvent.mouseDown(screen.getByText('Change recipe'))
    expect(screen.getByText('Change recipe')).toBeInTheDocument()
  })

  it('fires move handlers and disables arrows at the ends', () => {
    const props = baseProps()
    const { rerender } = render(<SlotCell {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /move dinner for wed up/i }))
    expect(props.onMoveUp).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /move dinner for wed down/i }))
    expect(props.onMoveDown).toHaveBeenCalledTimes(1)

    rerender(<SlotCell {...props} canMoveUp={false} canMoveDown />)
    expect(screen.getByRole('button', { name: /move dinner for wed up/i })).toBeDisabled()
  })

  // ── diverging (per-person) meals ────────────────────────────────────

  const member = (id: string, forMemberId: string): MealPlanEntry =>
    ({ ...entry, id, forMemberId })

  it('renders a name chip + title per person and clears each independently', () => {
    const onClear = vi.fn()
    render(
      <SlotCell
        {...baseProps()}
        onClear={onClear}
        memberEntries={[
          { entry: member('m1', 'scott'), memberName: 'Scott', title: 'Kale Caesar' },
          { entry: member('m2', 'iris'), memberName: 'Iris', title: 'Grain Bowl' },
        ]}
      />,
    )
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Kale Caesar')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /clear scott's dinner/i }))
    expect(onClear).toHaveBeenCalledWith('m1')
  })

  it('changing a person\'s meal passes that member entry', () => {
    const onChangeRecipe = vi.fn()
    render(
      <SlotCell
        {...baseProps()}
        onChangeRecipe={onChangeRecipe}
        memberEntries={[{ entry: member('m1', 'iris'), memberName: 'Iris', title: 'Grain Bowl' }]}
      />,
    )
    fireEvent.click(screen.getByText('Grain Bowl'))
    expect(onChangeRecipe).toHaveBeenCalledWith(member('m1', 'iris'))
  })

  it('renders per-person rows even with no shared meal (not the empty state)', () => {
    render(
      <SlotCell
        {...baseProps()}
        entry={undefined}
        title={undefined}
        memberEntries={[{ entry: member('m1', 'iris'), memberName: 'Iris', title: 'Grain Bowl' }]}
      />,
    )
    expect(screen.getByText('Iris')).toBeInTheDocument()
    expect(screen.getByText('Grain Bowl')).toBeInTheDocument()
    expect(screen.queryByText(/add dinner/i)).toBeNull()
  })
})
