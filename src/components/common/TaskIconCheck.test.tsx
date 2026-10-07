import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskIconCheck } from './TaskIconCheck'

describe('TaskIconCheck', () => {
  it('is the task’s check: a tap finishes it, and the click stays off the row', () => {
    const onToggle = vi.fn(); const onRow = vi.fn()
    render(<div onClick={onRow}><TaskIconCheck task={{ title: 'Call Sleep Study' }} done={false} onToggle={onToggle} /></div>)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Call Sleep Study' }))
    expect(onToggle).toHaveBeenCalledOnce()
    expect(onRow).not.toHaveBeenCalled()
  })

  it('says it is done, and offers to undo', () => {
    render(<TaskIconCheck task={{ title: 'Tidy bedrooms' }} done onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Mark not done: Tidy bedrooms' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is a quiet mark, not a button, for an event', () => {
    render(<TaskIconCheck task={{ title: 'Boxing', type: 'event' }} done={false} onToggle={vi.fn()} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
