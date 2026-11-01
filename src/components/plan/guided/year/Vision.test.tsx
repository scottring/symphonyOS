import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Vision, YearVision } from './Vision'

describe('Vision — the long view, in Scott’s words', () => {
  it('two empty fields, nothing written for him', () => {
    render(<Vision yearWord="2027" value={{}} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'An ordinary day ten years from now' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'What would make 2027 a success' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'An ordinary day ten years from now' })).not.toHaveAttribute('placeholder')
  })

  it('saves a field when it is left, only if it changed, keeping the other', () => {
    const onChange = vi.fn()
    render(<Vision yearWord="2027" value={{ success: 'A calm house' }} onChange={onChange} />)
    const day = screen.getByRole('textbox', { name: 'An ordinary day ten years from now' })
    fireEvent.change(day, { target: { value: '  Coffee on the porch  ' } })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.blur(day)
    expect(onChange).toHaveBeenCalledWith({ tenYears: 'Coffee on the porch', success: 'A calm house' })
    fireEvent.blur(screen.getByRole('textbox', { name: 'What would make 2027 a success' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('YearVision — saved into the year’s notes', () => {
  it('patches the vision, and a failed save can be sent again', async () => {
    const patch = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<YearVision yearWord="2027" patch={patch} />)
    const success = screen.getByRole('textbox', { name: 'What would make 2027 a success' })
    fireEvent.change(success, { target: { value: 'Healthy and close' } })
    await act(async () => { fireEvent.blur(success) })
    expect(patch).toHaveBeenCalledWith({ vision: { success: 'Healthy and close' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save.')
    expect(success).toHaveValue('Healthy and close')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch.mock.calls[1][0]).toEqual({ vision: { success: 'Healthy and close' } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
