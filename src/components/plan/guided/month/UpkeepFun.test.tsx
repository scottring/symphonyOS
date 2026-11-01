import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { UpkeepFun } from './UpkeepFun'

const ROUTINES = [
  { id: 'r1', title: 'Pay the credit card', when: 'Mon, Nov 2', onOpen: vi.fn() },
  { id: 'r2', title: 'Change the furnace filter', when: 'Sat, Nov 14' },
]

describe('UpkeepFun — maintenance and fun', () => {
  it('lists the month’s monthly routines and its fun lines', () => {
    render(<UpkeepFun monthWord="November" routines={ROUTINES} fun={[{ id: 'f', title: 'Ice skating downtown' }]} onAddFun={vi.fn()} />)
    const routines = within(screen.getByRole('list', { name: 'Monthly routines' }))
    expect(routines.getByText('Pay the credit card')).toBeInTheDocument()
    expect(routines.getByText('Sat, Nov 14')).toBeInTheDocument()
    fireEvent.click(routines.getByRole('button', { name: 'Pay the credit card' }))
    expect(ROUTINES[0].onOpen).toHaveBeenCalled()
    expect(within(screen.getByRole('list', { name: 'Fun in November' })).getByText('Ice skating downtown')).toBeInTheDocument()
  })

  it('nothing fun yet says so, and asks without naming anything', () => {
    render(<UpkeepFun monthWord="November" routines={[]} fun={[]} onAddFun={vi.fn()} />)
    expect(screen.getByText('No monthly routines.')).toBeInTheDocument()
    expect(screen.getByText('Nothing just for fun on November yet.')).toBeInTheDocument()
  })

  it('a fun line is added only from what is typed', async () => {
    const onAddFun = vi.fn(async () => true)
    render(<UpkeepFun monthWord="November" routines={null} fun={[]} onAddFun={onAddFun} />)
    expect(screen.queryByRole('list', { name: 'Monthly routines' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Add something fun' }))
    const field = screen.getByRole('textbox', { name: 'Something fun in November' })
    fireEvent.change(field, { target: { value: 'Ice skating downtown' } })
    await act(async () => { fireEvent.submit(field.closest('form')!) })
    expect(onAddFun).toHaveBeenCalledWith('Ice skating downtown')
  })
})
