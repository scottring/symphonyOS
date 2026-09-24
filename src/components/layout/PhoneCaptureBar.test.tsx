import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneCaptureBar, PhoneCaptureField } from './PhoneCaptureBar'
import { useTextEntryActive } from '@/hooks/useKeyboardInset'

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

  // Codex, 2026-09-24: offline, Enter failed and gave the words back as it
  // should; back online, CLICKING Add saved nothing, while Enter on the same
  // text saved fine. The only difference between the two is focus. Enter
  // never leaves the field; a press on a button takes focus, and this bar is
  // ANCHORED on whether a text field has focus — it sits on the keyboard
  // while typing and drops to just above the 67px dock the moment focus goes.
  // That drop lands between mousedown and mouseup of an ordinary press, so
  // the button moves out from under the finger and no click is ever fired.
  //
  // jsdom cannot measure the drop (the resting `bottom` is a calc() with
  // env(), which it refuses, leaving the previous inline value in place), so
  // these hold the two halves it CAN see: the anchor really does flip on
  // blur, and the button declines to take focus so the flip cannot happen
  // mid-press.
  it('the bar\'s anchor flips the moment a text field loses focus', async () => {
    const seen: boolean[] = []
    function Probe() {
      seen.push(useTextEntryActive())
      return <input aria-label="field" />
    }
    render(<Probe />)
    const input = screen.getByLabelText('field')
    input.focus()
    await waitFor(() => expect(seen.at(-1)).toBe(true))
    input.blur()
    await waitFor(() => expect(seen.at(-1)).toBe(false))
  })

  it('pressing Add does not take focus off the field, so the anchor cannot flip under the press', async () => {
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={vi.fn()} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, 'Renew the permit')
    // fireEvent returns false when a handler called preventDefault — which is
    // how a control declines focus while still firing its click.
    expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Add' }))).toBe(false)
    expect(input).toHaveFocus()
  })

  it('captures when Add is pressed, not only on return', async () => {
    const onSubmit = vi.fn(async () => 'new-id')
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, 'Renew the permit')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSubmit).toHaveBeenCalledWith('Renew the permit')
    expect(input).toHaveValue('')
  })

  it('stays clear once the save succeeds', async () => {
    const onSubmit = vi.fn(async () => 'new-id')
    render(<PhoneCaptureField placeholder="Add a task…" onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox', { name: 'Add a task' })
    await userEvent.type(input, 'Renew the permit{Enter}')
    expect(input).toHaveValue('')
  })
})
