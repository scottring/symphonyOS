import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ReflectStep } from './ReflectStep'
import { renderStep } from './testHarness'

const step = {
  id: 'look-within', type: 'reflect' as const, title: 'Look within',
  narration: 'How are you, actually? Write it down before you plan anything.',
  props: { notesKey: 'energy', placeholder: 'Energy going into this season…' },
}

describe('ReflectStep', () => {
  it('shows the existing note text and patches on change', () => {
    const patchNotes = vi.fn()
    renderStep(<ReflectStep />, { step, notes: { energy: 'tired but hopeful' }, patchNotes })
    const box = screen.getByPlaceholderText('Energy going into this season…')
    expect(box).toHaveValue('tired but hopeful')
    fireEvent.change(box, { target: { value: 'rested' } })
    expect(patchNotes).toHaveBeenCalledWith({ energy: 'rested' })
  })

  it('renders nothing when notesKey is missing (misconfig)', () => {
    const { container } = renderStep(<ReflectStep />, { step: { ...step, props: {} } })
    expect(container.querySelector('textarea')).toBeNull()
  })
})
