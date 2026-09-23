import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneCaptureBar, PhoneCaptureField } from './PhoneCaptureBar'

describe('PhoneCaptureBar', () => {
  it('reserves room in the page so the bar never covers the last card', () => {
    const { container } = render(<PhoneCaptureBar><span>field</span></PhoneCaptureBar>)
    expect(container.querySelector('.phone-capture-spacer')).not.toBeNull()
    expect(container.querySelector('.phone-capture-bar')).toHaveTextContent('field')
  })

  it('captures on return and clears for the next one; blank text is ignored', async () => {
    const onSubmit = vi.fn()
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, '   {Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.type(input, 'Buy stamps{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('Buy stamps')
    expect(input).toHaveValue('')
  })

  it('gives the words back when the save fails, so a retry is one tap', async () => {
    const onSubmit = vi.fn(async () => undefined)
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, 'Renew the permit{Enter}')
    expect(input).toHaveValue('Renew the permit')
  })

  it('stays clear once the save succeeds', async () => {
    const onSubmit = vi.fn(async () => 'new-id')
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, 'Renew the permit{Enter}')
    expect(input).toHaveValue('')
  })
})
