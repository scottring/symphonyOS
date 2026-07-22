import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupNamePopover } from './GroupNamePopover'
import type { RhythmCard } from './rhythmModel'
import type { Routine } from '@/types/actionable'

const r = (id: string, name: string) => ({ id, name } as Routine)
const card: RhythmCard = {
  kind: 'cluster', id: 'c1', name: null, startTime: '19:01:00', endTime: '19:06:00',
  suggestedName: 'Bedtime', routines: [r('a', 'Hamper'), r('b', 'Reading')],
}
const base = { card, foldTargets: [] as { id: string; name: string }[], onName: vi.fn(), onFoldInto: vi.fn(), onClose: vi.fn() }

describe('GroupNamePopover', () => {
  it('names the group on Enter and closes', () => {
    const onName = vi.fn(); const onClose = vi.fn()
    render(<GroupNamePopover {...base} onName={onName} onClose={onClose} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'Evening reset' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onName).toHaveBeenCalledWith(card, 'Evening reset')
    expect(onClose).toHaveBeenCalled()
  })

  it('folds into an exact-name match instead of creating', () => {
    const onName = vi.fn(); const onFoldInto = vi.fn()
    render(<GroupNamePopover {...base} onName={onName} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.change(input, { target: { value: 'kids bedtime routine' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
    expect(onName).not.toHaveBeenCalled()
  })

  it('filters suggestions by typed text and folds on click', () => {
    const onFoldInto = vi.fn()
    render(<GroupNamePopover {...base} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }, { id: 'camp', name: 'Camp Mornings' }]} />)
    fireEvent.change(screen.getByPlaceholderText('Name this rhythm'), { target: { value: 'bedtime' } })
    expect(screen.queryByRole('button', { name: 'Camp Mornings' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
  })

  it('closes on Escape without acting', () => {
    const onClose = vi.fn(); const onName = vi.fn()
    render(<GroupNamePopover {...base} onClose={onClose} onName={onName} />)
    fireEvent.keyDown(screen.getByPlaceholderText('Name this rhythm'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(onName).not.toHaveBeenCalled()
  })

  it("excludes the group's own members from suggestions", () => {
    render(<GroupNamePopover {...base} foldTargets={[{ id: 'a', name: 'Hamper' }, { id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    expect(screen.queryByRole('button', { name: 'Hamper' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kids Bedtime Routine' })).toBeInTheDocument()
  })

  it('does not let a text-selection drag inside the input bubble to an ancestor drag handler', () => {
    const wrapperDragStart = vi.fn()
    render(
      <div onDragStart={wrapperDragStart}>
        <GroupNamePopover {...base} />
      </div>
    )
    const input = screen.getByPlaceholderText('Name this rhythm')
    fireEvent.dragStart(input)
    expect(wrapperDragStart).not.toHaveBeenCalled()
  })

  it('closes on an outside mousedown', () => {
    const onClose = vi.fn()
    render(<GroupNamePopover {...base} onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalled()
  })

  it('does not close on a mousedown inside the popover', () => {
    const onClose = vi.fn()
    render(<GroupNamePopover {...base} onClose={onClose} />)
    fireEvent.mouseDown(screen.getByPlaceholderText('Name this rhythm'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('still folds via a suggestion button click (regression guard for outside-click close)', () => {
    const onFoldInto = vi.fn()
    render(<GroupNamePopover {...base} onFoldInto={onFoldInto}
      foldTargets={[{ id: 'bed', name: 'Kids Bedtime Routine' }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kids Bedtime Routine' }))
    expect(onFoldInto).toHaveBeenCalledWith('bed', ['a', 'b'])
  })
})
