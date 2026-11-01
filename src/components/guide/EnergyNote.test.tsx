import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EnergyNote } from './EnergyNote'

describe('EnergyNote', () => {
  it('calls onChange with the level', () => {
    const onChange = vi.fn()
    render(<EnergyNote onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Low' }))
    expect(onChange).toHaveBeenCalledWith({ level: 'low' })
  })

  it('marks the current value and keeps words when changing level', () => {
    const onChange = vi.fn()
    render(<EnergyNote value={{ level: 'medium', words: 'tired' }} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: 'Medium' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'High' }))
    expect(onChange).toHaveBeenCalledWith({ level: 'high', words: 'tired' })
  })

  it('saves words on blur once a level is set', () => {
    const onChange = vi.fn()
    render(<EnergyNote value={{ level: 'low' }} onChange={onChange} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'slept badly' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith({ level: 'low', words: 'slept badly' })
  })
})
