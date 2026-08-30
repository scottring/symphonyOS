import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { TargetSection } from './sections/TargetSection'

describe('TargetSection', () => {
  it('with no target set, renders a quiet affordance; entering an amount and choosing a unit reports it', () => {
    const onChange = vi.fn()
    render(<TargetSection amount={null} unit={null} onChange={onChange} />)

    expect(screen.getByRole('button', { name: /add a daily target/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/target amount/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add a daily target/i }))

    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /^minutes$/i }))

    expect(onChange).toHaveBeenCalledWith({ amount: 20, unit: 'minutes' })
  })

  it('with an existing target, renders the value and clears it', () => {
    const onChange = vi.fn()
    render(<TargetSection amount={20} unit="minutes" onChange={onChange} />)

    expect(screen.getByDisplayValue('20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^minutes$/i })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('never reports a non-positive amount', () => {
    const onChange = vi.fn()
    render(<TargetSection amount={null} unit={null} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add a daily target/i }))

    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '0' } })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/target amount/i), { target: { value: '' } })
    expect(onChange).not.toHaveBeenCalled()
  })
})
