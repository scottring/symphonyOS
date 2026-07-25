// The compact form of the ONE fate vocabulary: a ⋯ trigger opening the same
// TriageWhenMenu the review rows render inline, plus the standing-place verbs
// (Open, extras, File under a pick).
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskFateMenu } from './TaskFateMenu'

function open() {
  fireEvent.click(screen.getByLabelText('Task actions'))
}

describe('TaskFateMenu', () => {
  it('opens the full vocabulary: when chips, Done, Delete', () => {
    render(<TaskFateMenu onPickWhen={vi.fn()} onComplete={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    open()
    for (const label of ['Today', 'Week', 'Month', 'Someday']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Mark done')).toBeInTheDocument()
    expect(screen.getByLabelText('Delete')).toBeInTheDocument()
  })

  it('routes a when pick and closes', () => {
    const onPickWhen = vi.fn()
    render(<TaskFateMenu onPickWhen={onPickWhen} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onPickWhen).toHaveBeenCalledWith('someday')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('routes a fanned-out when (Month → This month)', () => {
    const onPickWhen = vi.fn()
    render(<TaskFateMenu onPickWhen={onPickWhen} />)
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Month' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'This month' }))
    expect(onPickWhen).toHaveBeenCalledWith('this-month')
  })

  it('Done and Delete fire their handlers', () => {
    const onComplete = vi.fn()
    const onDelete = vi.fn()
    render(<TaskFateMenu onPickWhen={vi.fn()} onComplete={onComplete} onDelete={onDelete} />)
    open()
    fireEvent.click(screen.getByLabelText('Mark done'))
    expect(onComplete).toHaveBeenCalled()
    open()
    fireEvent.click(screen.getByLabelText('Delete'))
    expect(onDelete).toHaveBeenCalled()
  })

  it('renders Open and extras above the chips', () => {
    const onOpen = vi.fn()
    const bringForward = vi.fn()
    render(<TaskFateMenu onPickWhen={vi.fn()} onOpen={onOpen}
      extras={[{ label: 'Bring to this week', onSelect: bringForward }]} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }))
    expect(onOpen).toHaveBeenCalled()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Bring to this week' }))
    expect(bringForward).toHaveBeenCalled()
  })

  it('File under a pick lists picks with their goal and fires onFile', () => {
    const onFile = vi.fn()
    render(<TaskFateMenu onPickWhen={vi.fn()}
      fileUnder={{ picks: [{ id: 'p1', title: 'Porch set up', goalName: 'A calmer home' }], onFile }} />)
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'File under a pick' }))
    expect(screen.getByText('serves A calmer home')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: /Porch set up/ }))
    expect(onFile).toHaveBeenCalledWith('p1')
  })

  it('closes on outside mousedown', () => {
    render(<TaskFateMenu onPickWhen={vi.fn()} onOpen={vi.fn()} />)
    open()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
