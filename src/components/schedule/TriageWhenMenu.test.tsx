import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { TriageWhenMenu } from './TriageWhenMenu'

describe('TriageWhenMenu', () => {
  it('renders the four horizon groups + delete', () => {
    render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Week' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Month' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Someday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('Someday applies directly (single option, no fan-out)', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Someday' }))
    expect(onPick).toHaveBeenCalledWith('someday')
    // No menu opened for a single-option group
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Today fans out to Tonight and Tomorrow on click', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tonight' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Tomorrow' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Tomorrow' }))
    expect(onPick).toHaveBeenCalledWith('tomorrow')
  })

  it('Week fans out to this/next week + this/next weekend', async () => {
    const onPick = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={onPick} onDelete={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Week' }))
    expect(screen.getByRole('menuitem', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Next week' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'This weekend' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Next weekend' })).toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Next weekend' }))
    expect(onPick).toHaveBeenCalledWith('next-weekend')
  })

  it('Pick date opens a date form and submits a specific slot', async () => {
    const onPickDate = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} onPickDate={onPickDate} />)
    await user.click(screen.getByRole('button', { name: 'Pick date' }))
    fireEvent.change(document.querySelector('input[type="date"]')!, { target: { value: '2026-06-20' } })
    await user.click(screen.getByRole('button', { name: /Set date/ }))
    expect(onPickDate).toHaveBeenCalledWith(expect.any(Date), true)
  })

  it('no Pick date chip when onPickDate is omitted', () => {
    render(<TriageWhenMenu onPick={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Pick date' })).not.toBeInTheDocument()
  })

  it('delete fires onDelete', async () => {
    const onDelete = vi.fn()
    const { user } = render(<TriageWhenMenu onPick={vi.fn()} onDelete={onDelete} />)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalled()
  })
})
