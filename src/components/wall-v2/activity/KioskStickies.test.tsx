import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StickySheet, StickyStrip } from './KioskStickies'
import type { FamilyMember } from '@/types/family'

const members = [{ id: 'sk', name: 'Scott', initials: 'S' }, { id: 'ir', name: 'Iris', initials: 'I' }] as unknown as FamilyMember[]

// Scott, 2026-10-18: "add stickies straight to the home page of kiosk".
describe('StickyStrip', () => {
  it('pins the house’s notes, who wrote each, and a tap opens Notes', () => {
    const onOpen = vi.fn()
    render(<StickyStrip notes={[{ id: 'n1', text: 'Plumber Thursday', by: 'Iris' }, { id: 'n2', text: 'Dog fed', by: null }]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Note: Plumber Thursday, from Iris' }))
    expect(onOpen).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Note: Dog fed' })).toBeInTheDocument()
  })

  it('is nothing when there are no notes', () => {
    const { container } = render(<StickyStrip notes={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('StickySheet', () => {
  it('saves the words and who it’s from, then closes', async () => {
    const onSave = vi.fn().mockResolvedValue(true), onClose = vi.fn()
    render(<StickySheet members={members} onSave={onSave} onClose={onClose} />)
    expect(screen.getByRole('button', { name: 'Stick it up' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox', { name: 'What the sticky says' }), { target: { value: '  Dog has been fed ' } })
    fireEvent.click(screen.getByRole('button', { name: /Iris/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stick it up' })) })
    expect(onSave).toHaveBeenCalledWith('Dog has been fed', 'ir')
    expect(onClose).toHaveBeenCalled()
  })

  it('stays open and says so when the note didn’t save', async () => {
    const onClose = vi.fn()
    render(<StickySheet members={members} onSave={vi.fn().mockResolvedValue(false)} onClose={onClose} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'What the sticky says' }), { target: { value: 'Dog fed' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stick it up' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('That didn’t save')
    expect(onClose).not.toHaveBeenCalled()
  })
})
