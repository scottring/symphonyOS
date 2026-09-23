import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskCheckbox } from './TaskCheckbox'

// The circle completed only on mouse/touch release: a keyboard click did
// nothing but bubble to the row, which opened Details — so on desktop every
// tick also opened the panel, and Enter/Space could not complete at all.
function renderIn(onRowClick = vi.fn()) {
  const onToggleComplete = vi.fn()
  render(
    <div onClick={onRowClick}>
      <TaskCheckbox completed={false} onToggleComplete={onToggleComplete} onToggleWaiting={vi.fn()} shape="circle" />
    </div>,
  )
  return { onToggleComplete, onRowClick, button: screen.getByRole('button', { name: /Mark complete/ }) }
}

describe('TaskCheckbox', () => {
  it('completes on a pointer press without opening the row', () => {
    const { onToggleComplete, onRowClick, button } = renderIn()
    fireEvent.mouseDown(button)
    fireEvent.mouseUp(button)
    fireEvent.click(button, { detail: 1 })
    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('completes from the keyboard (a click with no pointer press)', () => {
    const { onToggleComplete, onRowClick, button } = renderIn()
    fireEvent.click(button, { detail: 0 })
    expect(onToggleComplete).toHaveBeenCalledTimes(1)
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
