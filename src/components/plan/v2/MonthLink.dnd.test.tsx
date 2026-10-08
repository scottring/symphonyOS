// The month-line menu inside a draggable week row, under a real DndContext
// (2026-10-08 review: a pick in the portal menu bubbled through the React tree
// into the row's drag listeners — the row "dropped on the week's list" and the
// link was never written).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import { WeekListV2 } from './WeekListV2'
import type { Task } from '@/types/task'
import type { LineActions } from './PlanLine'

const actions = { done: vi.fn(), carry: vi.fn(), drop: vi.fn(), assign: vi.fn(), details: vi.fn(), rename: vi.fn(), openPartOf: vi.fn() } as unknown as LineActions
const item = { id: 'w2', title: 'Go through the onboarding checklist', completed: false, createdAt: new Date() } as Task
const options = { month: 'October', lines: [{ id: 'm1', title: 'Plan the autumn trip' }, { id: 'm3', title: 'Get the household paperwork in order' }] }
const press = (el: Element) => {
  fireEvent.pointerDown(el, { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.mouseDown(el, { button: 0 })
  fireEvent.pointerUp(el, { isPrimary: true, button: 0, pointerId: 1, clientX: 10, clientY: 10 })
  fireEvent.mouseUp(el, { button: 0 })
  fireEvent.click(el)
}

describe('MonthLink in a draggable row', () => {
  it('opening the menu and picking a line links it — no drag starts', () => {
    const onDragStart = vi.fn()
    const onForLine = vi.fn()
    render(
      <DndContext onDragStart={onDragStart}>
        <WeekListV2 title="This week" weekStart={new Date(2026, 9, 3)} members={[]} actions={actions} onContext={vi.fn()} onAdd={vi.fn()}
          lines={[{ task: item, fate: 'open', partOf: null, where: null }]} forOptions={options} forLine={() => null} onForLine={onForLine} />
      </DndContext>,
    )
    press(screen.getByRole('button', { name: 'Link Go through the onboarding checklist to an October line' }))
    press(screen.getByRole('menuitemradio', { name: 'Get the household paperwork in order' }))
    expect(onDragStart).not.toHaveBeenCalled()
    expect(onForLine).toHaveBeenCalledWith(item, 'm3')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('Enter and Escape in the menu stay in the menu', () => {
    const onDragStart = vi.fn()
    render(
      <DndContext onDragStart={onDragStart}>
        <WeekListV2 title="This week" weekStart={new Date(2026, 9, 3)} members={[]} actions={actions} onContext={vi.fn()} onAdd={vi.fn()}
          lines={[{ task: item, fate: 'open', partOf: null, where: null }]} forOptions={options} forLine={() => null} onForLine={vi.fn()} />
      </DndContext>,
    )
    const button = screen.getByRole('button', { name: /to an October line/ })
    fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' })
    fireEvent.click(button)
    const first = screen.getByRole('menuitemradio', { name: 'Plan the autumn trip' })
    fireEvent.keyDown(first, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', code: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(onDragStart).not.toHaveBeenCalled()
  })
})
