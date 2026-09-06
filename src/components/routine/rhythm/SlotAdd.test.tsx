import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SlotAdd, SlotAddInput, resolveSlotRoutineFields } from './SlotAdd'

describe('SlotAdd', () => {
  it('stays out of the way until asked, then opens an input in place', () => {
    render(<SlotAdd label="Add a routine on Tuesday" onCreate={vi.fn()} />)

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a routine on Tuesday' }))
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('creates on Enter and closes', () => {
    const onCreate = vi.fn()
    render(<SlotAdd label="Add a routine on Tuesday" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add a routine on Tuesday' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Trash out  ' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(onCreate).toHaveBeenCalledWith('Trash out')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('will not create a nameless routine', () => {
    const onCreate = vi.fn()
    render(<SlotAdd label="Add a routine on Tuesday" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add a routine on Tuesday' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('abandons on Escape', () => {
    const onCreate = vi.fn()
    render(<SlotAdd label="Add a routine on Tuesday" onCreate={onCreate} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add a routine on Tuesday' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Trash out' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('SlotAddInput', () => {
  it('can be driven by its host, for slots whose position carries meaning', () => {
    // The arc's axis is one of these: WHERE you click along it is the time, so
    // the host opens the input rather than a fixed button.
    const onCreate = vi.fn()
    const onCancel = vi.fn()
    render(<SlotAddInput placeholder="Routine at 7:15 AM" onCreate={onCreate} onCancel={onCancel} />)

    const box = screen.getByPlaceholderText('Routine at 7:15 AM')
    expect(box).toHaveFocus()
    fireEvent.change(box, { target: { value: 'Pack lunches' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onCreate).toHaveBeenCalledWith('Pack lunches')
  })

  it('cancels on blur, so clicking away never leaves a stray box open', () => {
    const onCancel = vi.fn()
    render(<SlotAddInput placeholder="Routine at 7:15 AM" onCreate={vi.fn()} onCancel={onCancel} />)

    fireEvent.blur(screen.getByPlaceholderText('Routine at 7:15 AM'))
    expect(onCancel).toHaveBeenCalled()
  })
})

// A slot-created routine either shares by the active domain lens, or — under
// no domain lens — assigns to whoever the Routines page's member lens has
// locked in; only when NEITHER lens is active does it go to the whole family.
describe('resolveSlotRoutineFields', () => {
  it('shares with the family when no domain lens and no member lens is active (Everyone)', () => {
    expect(resolveSlotRoutineFields(null, undefined)).toMatchObject({ context: 'family' })
  })

  it('assigns to the locked-in member when a member lens is active and no domain lens is set', () => {
    const fields = resolveSlotRoutineFields(null, 'e')
    expect(fields).toMatchObject({ assigned_to: 'e' })
    expect(fields.context).toBeUndefined()
  })

  it('a domain lens wins over the family default', () => {
    expect(resolveSlotRoutineFields('work', undefined)).toMatchObject({ context: 'work' })
  })
})
