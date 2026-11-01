import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { WildCards } from './WildCards'

describe('WildCards — the season’s four checks', () => {
  it('offers exactly four toggles, none chosen until tapped', () => {
    render(<WildCards value={[]} onChange={vi.fn()} />)
    const group = within(screen.getByRole('group', { name: 'Wild cards' }))
    expect(group.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).toEqual(['Money', 'Childcare and camps', 'Travel', 'The house'])
    expect(group.getAllByRole('checkbox').every((c) => !(c as HTMLInputElement).checked)).toBe(true)
  })

  it('a tap adds or removes that card, in the cards’ own order', () => {
    const onChange = vi.fn()
    const { rerender } = render(<WildCards value={['travel']} onChange={onChange} />)
    expect(screen.getByRole('checkbox', { name: 'Travel' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Money' }))
    expect(onChange).toHaveBeenLastCalledWith(['money', 'travel'])
    rerender(<WildCards value={['money', 'travel']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Travel' }))
    expect(onChange).toHaveBeenLastCalledWith(['money'])
  })

  it('writes no lines of its own: what each card needs is said in the conversation', () => {
    render(<WildCards value={['money', 'house']} onChange={vi.fn()} />)
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.getByText(/Say what each one needs in the conversation/)).toBeInTheDocument()
  })
})
