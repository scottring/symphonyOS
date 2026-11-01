import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AreasEditor } from './AreasEditor'
import type { LifeArea } from '@/hooks/useLifeAreas'

const areas: LifeArea[] = [
  { id: 'a1', name: 'Health', context: 'personal', mine: true, sortOrder: 0 },
  { id: 'a2', name: 'Home', context: 'family', mine: false, sortOrder: 0 },
  { id: 'a3', name: 'Old', context: null, mine: true, sortOrder: 1 },
]

function setup() {
  const h = { onAdd: vi.fn(), onRename: vi.fn(), onSetContext: vi.fn(), onRemove: vi.fn() }
  render(<AreasEditor areas={areas} {...h} />)
  return h
}

describe('AreasEditor', () => {
  it('shows the count as a note, not a limit', () => {
    setup()
    expect(screen.getByText(/3 areas/)).toBeInTheDocument()
    expect(screen.getByText(/3 to 8 is typical/)).toBeInTheDocument()
  })

  it('lists a partner\'s Family area read-only, without controls', () => {
    setup()
    const shared = screen.getByRole('list', { name: 'Shared areas' })
    expect(within(shared).getByText('Home')).toBeInTheDocument()
    expect(within(shared).getByText('Family')).toBeInTheDocument()
    expect(within(shared).queryByRole('textbox')).toBeNull()
    expect(within(shared).queryByRole('button')).toBeNull()
  })

  it('shows a legacy area as Personal and lets the owner set a space', () => {
    const h = setup()
    const group = screen.getByRole('radiogroup', { name: 'Space for Old' })
    expect(within(group).getByRole('radio', { name: 'Personal' })).toBeChecked()
    fireEvent.click(within(group).getByRole('radio', { name: 'Work' }))
    expect(h.onSetContext).toHaveBeenCalledWith('a3', 'work')
  })

  it('renames on blur, and puts back an emptied name', () => {
    const h = setup()
    const input = screen.getByLabelText('Name of Health')
    fireEvent.change(input, { target: { value: ' Fitness ' } })
    fireEvent.blur(input)
    expect(h.onRename).toHaveBeenCalledWith('a1', 'Fitness')
    const old = screen.getByLabelText('Name of Old')
    fireEvent.change(old, { target: { value: '  ' } })
    fireEvent.blur(old)
    expect(h.onRename).toHaveBeenCalledTimes(1)
    expect(old).toHaveValue('Old')
  })

  it('removes only after a second tap, saying its goals stay', () => {
    const h = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Health' }))
    expect(h.onRemove).not.toHaveBeenCalled()
    expect(screen.getByText('Remove Health? Its goals stay, with no area.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(h.onRemove).toHaveBeenCalledWith('a1')
  })

  it('adds an area in the chosen space and clears the field', () => {
    const h = setup()
    const input = screen.getByLabelText('New area')
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(input, { target: { value: 'Money' } })
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Space for the new area' })).getByRole('radio', { name: 'Family' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(h.onAdd).toHaveBeenCalledWith('Money', 'family')
    expect(input).toHaveValue('')
  })
})
