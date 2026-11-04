import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { EnergyChip } from './EnergyChip'

// The Energy step's home (planning as tooltips, Task 2): a chip in the page
// header that cycles — → low → medium → high → low and writes the note.
describe('EnergyChip', () => {
  it('cycles from — through low, medium and high, keeping the words already said', async () => {
    const save = vi.fn(async () => true)
    render(<EnergyChip value={{ level: 'high', words: 'New baby' }} save={save} />)
    const chip = screen.getByRole('button', { name: /^Energy/ })
    expect(chip.closest('[data-guide-anchor="energy"]')).not.toBeNull()
    expect(chip).toHaveTextContent('Energy: high')
    await act(async () => { fireEvent.click(chip) })
    expect(save).toHaveBeenLastCalledWith({ level: 'low', words: 'New baby' })
    expect(chip).toHaveTextContent('Energy: low')
  })

  it('unset reads “—”; a save that failed says so and can be sent again', async () => {
    const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<EnergyChip save={save} />)
    const chip = screen.getByRole('button', { name: /^Energy/ })
    expect(chip).toHaveTextContent('Energy: —')
    await act(async () => { fireEvent.click(chip) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save.')
    // What was sent still shows while it is retried.
    expect(chip).toHaveTextContent('Energy: low')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls[1][0]).toEqual({ level: 'low' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
