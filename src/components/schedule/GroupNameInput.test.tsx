import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroupNameInput } from './GroupNameInput'

const setup = (initialName = 'New Group') => {
  const onCommit = vi.fn()
  const onCancel = vi.fn()
  render(<GroupNameInput initialName={initialName} onCommit={onCommit} onCancel={onCancel} />)
  return { input: screen.getByLabelText('Group name') as HTMLInputElement, onCommit, onCancel }
}

describe('GroupNameInput', () => {
  it('mounts focused with the whole placeholder selected', () => {
    // The point of the placeholder is that the first character you type
    // replaces it — that only works if it arrives selected.
    const { input } = setup()
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('New Group'.length)
  })

  it('commits the typed name on Enter', () => {
    const { input, onCommit } = setup()
    fireEvent.change(input, { target: { value: 'Errands' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('Errands')
  })

  it('trims, and commits only once even though Enter is followed by a blur', () => {
    const { input, onCommit } = setup()
    fireEvent.change(input, { target: { value: '  Errands  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('Errands')
  })

  it('commits on blur — clicking away is a commit, not a loss', () => {
    const { input, onCommit } = setup()
    fireEvent.change(input, { target: { value: 'Errands' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('Errands')
  })

  it('Escape keeps the placeholder and writes nothing', () => {
    const { input, onCommit, onCancel } = setup()
    fireEvent.change(input, { target: { value: 'Errands' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('an emptied field cancels rather than committing a nameless group', () => {
    const { input, onCommit, onCancel } = setup()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
