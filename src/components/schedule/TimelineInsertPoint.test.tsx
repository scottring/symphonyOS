import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { TimelineInsertPoint } from './TimelineInsertPoint'

const defaultQuickInput = {
  anchorTime: null,
  parserContext: { projects: [], contacts: [], familyMembers: [] },
  currentDomain: 'universal' as const,
}

describe('TimelineInsertPoint', () => {
  it('renders a + trigger and no segments until opened', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} onCreate={vi.fn()} quickInput={defaultQuickInput} />)
    expect(screen.getByRole('button', { name: /add between items/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
  })
  it('opens the radial wheel on click, showing 4 segments', () => {
    render(<TimelineInsertPoint onPick={vi.fn()} onCreate={vi.fn()} quickInput={defaultQuickInput} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    for (const label of ['Note', 'Task', 'Event', 'Routine'])
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeInTheDocument()
  })
  it('closes on Escape without firing onPick', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} onCreate={vi.fn()} quickInput={defaultQuickInput} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: /^task$/i })).not.toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })
  it('note pick still bubbles via onPick and closes', () => {
    const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} onCreate={vi.fn()} quickInput={{ anchorTime: null, parserContext: { projects: [], contacts: [], familyMembers: [] }, currentDomain: 'universal' }} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.click(screen.getByRole('button', { name: /^note$/i }))
    expect(onPick).toHaveBeenCalledWith('note')
    expect(screen.queryByRole('button', { name: /^note$/i })).not.toBeInTheDocument()
  })
  it('task pick opens the inline input (no immediate create); submit fires onCreate', () => {
    const onCreate = vi.fn(); const onPick = vi.fn()
    render(<TimelineInsertPoint onPick={onPick} onCreate={onCreate} quickInput={{ anchorTime: new Date(2026,4,19,18,15), parserContext: { projects: [], contacts: [], familyMembers: [] }, currentDomain: 'universal' }} />)
    fireEvent.click(screen.getByRole('button', { name: /add between items/i }))
    fireEvent.click(screen.getByRole('button', { name: /^task$/i }))
    expect(onPick).not.toHaveBeenCalled()
    const inp = screen.getByPlaceholderText(/new task ·/i)
    fireEvent.change(inp, { target: { value: 'Walk dog' } })
    fireEvent.keyDown(inp, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('task', expect.objectContaining({ title: 'Walk dog' }))
  })
})
