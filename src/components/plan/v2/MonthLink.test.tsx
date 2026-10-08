import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MonthLink } from './MonthLink'

const options = { month: 'October', lines: [{ id: 'm1', title: 'Plan the autumn trip' }, { id: 'm2', title: 'Clear out the shed' }] }

describe('MonthLink — keyboard and screen reader', () => {
  it('opens on the current line, moves with arrows, closes on Escape back to its button', () => {
    const onChange = vi.fn()
    render(<MonthLink title="Book the cabin" current={{ id: 'm1', title: 'Plan the autumn trip', month: 'October' }} options={options} onChange={onChange} />)
    const button = screen.getByRole('button', { name: 'For October: Plan the autumn trip. Change or remove the October line for Book the cabin' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(button)
    expect(screen.getByRole('menu', { name: 'Which October line is “Book the cabin” for?' })).toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Plan the autumn trip' }))
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitemradio', { name: 'Clear out the shed' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('choosing the line it already has writes nothing; an unlinked item offers the link', () => {
    const onChange = vi.fn()
    const { rerender } = render(<MonthLink title="Book the cabin" current={{ id: 'm1', title: 'Plan the autumn trip', month: 'October' }} options={options} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /^For October/ }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Plan the autumn trip' }))
    expect(onChange).not.toHaveBeenCalled()
    rerender(<MonthLink title="Water plants" current={null} options={options} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Link Water plants to an October line' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Clear out the shed' }))
    expect(onChange).toHaveBeenCalledWith('m2')
  })

  it('long lines are whole and wrap — never truncated — and the menu is placed from its measured size', () => {
    const long = 'Get the household paperwork, insurance renewals and the shared filing system sorted out properly before the end of the year'
    render(<MonthLink title="X" current={null} options={{ month: 'October', lines: [{ id: 'm5', title: long }] }} onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /to an October line/ }))
    const menu = screen.getByRole('menu')
    expect(menu).toHaveClass('wk-formenu')
    expect(menu.style.visibility).not.toBe('hidden') // placed, not left hidden
    const item = screen.getByRole('menuitemradio', { name: long })
    expect(item.querySelector('.wk-formenu-label')).toHaveTextContent(long)
    expect(menu.querySelector('.truncate')).toBeNull()
  })

  it('says “a” before a month that needs it', () => {
    render(<MonthLink title="X" current={null} options={{ month: 'September', lines: options.lines }} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Link X to a September line' })).toBeInTheDocument()
  })
})
