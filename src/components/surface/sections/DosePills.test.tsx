import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DosePills } from './DosePills'

describe('DosePills', () => {
  it('renders a chip per time', () => {
    render(<DosePills times={['09:00', '18:00']} onChange={vi.fn()} />)
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('18:00')).toBeInTheDocument()
  })

  it('removing a chip reports the remaining times', () => {
    const onChange = vi.fn()
    render(<DosePills times={['09:00', '18:00']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /remove 09:00/i }))
    expect(onChange).toHaveBeenCalledWith(['18:00'])
  })

  it('adding a time appends it sorted and de-duped', () => {
    const onChange = vi.fn()
    render(<DosePills times={['18:00']} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/add a dose time/i), { target: { value: '08:30' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).toHaveBeenCalledWith(['08:30', '18:00'])
  })

  it('ignores a duplicate add', () => {
    const onChange = vi.fn()
    render(<DosePills times={['08:30']} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText(/add a dose time/i), { target: { value: '08:30' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
