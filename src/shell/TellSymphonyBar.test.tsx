import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TellSymphonyBar } from './TellSymphonyBar'

describe('TellSymphonyBar', () => {
  it('sends what was typed to Symphony and clears; an empty bar sends nothing', () => {
    const onSend = vi.fn()
    render(<TellSymphonyBar onSend={onSend} onAdd={vi.fn()} onTalk={vi.fn()} />)
    const field = screen.getByLabelText('Tell Symphony what changed')
    const send = screen.getByRole('button', { name: 'Send to Symphony' })
    expect(send).toBeDisabled()
    fireEvent.change(field, { target: { value: '  Move the dentist call after lunch  ' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Tell Symphony' }))
    expect(onSend).toHaveBeenCalledWith('Move the dentist call after lunch')
    expect(field).toHaveValue('')
  })

  it('+ opens the add box and the mic starts talking', () => {
    const onAdd = vi.fn()
    const onTalk = vi.fn()
    render(<TellSymphonyBar onSend={vi.fn()} onAdd={onAdd} onTalk={onTalk} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add something' }))
    fireEvent.click(screen.getByRole('button', { name: 'Talk with Symphony' }))
    expect(onAdd).toHaveBeenCalledOnce()
    expect(onTalk).toHaveBeenCalledOnce()
  })

  it('does not send while Symphony is still answering', () => {
    const onSend = vi.fn()
    render(<TellSymphonyBar onSend={onSend} onAdd={vi.fn()} onTalk={vi.fn()} busy />)
    fireEvent.change(screen.getByLabelText('Tell Symphony what changed'), { target: { value: 'Add milk' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Tell Symphony' }))
    expect(onSend).not.toHaveBeenCalled()
  })
})
