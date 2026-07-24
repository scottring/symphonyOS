import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { OverflowTray } from './OverflowTray'
import type { Task } from '@/types/task'

const item = (over: Record<string, unknown>) => ({
  id: 'x', title: 'Item', completed: false, bucket: 'quarter',
  createdAt: new Date(), updatedAt: new Date(), ...over,
}) as unknown as Task

// Only the handlers the tray requires; the File-under path is what we exercise.
const baseProps = {
  picks: [] as Task[],
  onPick: vi.fn(), onSwap: vi.fn(), onMakeMove: vi.fn(),
  onShelf: vi.fn(), onLetGo: vi.fn(),
}

describe('OverflowTray — file an existing shelf item under a goal', () => {
  it('shows "File under" only when goals are provided, and threads+picks in one tap', () => {
    const onFileUnder = vi.fn()
    render(
      <OverflowTray
        {...baseProps}
        items={[item({ id: 's1', title: 'Chore system running for the kids' })]}
        goals={[{ id: 'g1', name: 'The kids have real responsibilities' }]}
        onFileUnder={onFileUnder}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'File "Chore system running for the kids" under a goal' }))
    fireEvent.click(screen.getByRole('button', { name: 'The kids have real responsibilities' }))
    expect(onFileUnder).toHaveBeenCalledWith('s1', 'g1')
  })

  it('hides "File under" when no goals are passed (back-compat)', () => {
    render(
      <OverflowTray {...baseProps} items={[item({ id: 's1', title: 'Wills signed' })]} />,
    )
    expect(screen.queryByRole('button', { name: /File .* under a goal/ })).not.toBeInTheDocument()
  })
})
