import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LookingBack } from './LookingBack'

describe('LookingBack', () => {
  it('shows the count and two places; moving on saves them, and a failed save says so', async () => {
    const onContinue = vi.fn(async () => false)
    render(<LookingBack kicker="Review September · then plan October" periodWord="September" done={11} outOf={16} notDone={3} alsoDone={[{ id: 'a', title: 'Dentist' }, { id: 'b', title: 'Car wash' }, { id: 'c', title: 'Gym' }, { id: 'd', title: 'Taxes' }]}
      nextLabel="On to Fall goals → October" onContinue={onContinue} onLeave={vi.fn()} />)
    expect(screen.getByText(/of 16 done · 3 not done/)).toBeTruthy()
    expect(screen.getByRole('img', { name: '11 of 16 done' }).querySelector('span')?.style.width).toBe('68.75%')
    expect(screen.getByRole('button', { name: /Also done, not on the list: 4 · Dentist · Car wash · Gym · …/ })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: /Also done, not on the list: 4/ }))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Dentist', 'Car wash', 'Gym', 'Taxes'])
    expect(screen.getByText(/The 3 not done come next/)).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'What went well' }), { target: { value: 'Rooms finished' } })
    fireEvent.click(screen.getByRole('button', { name: 'On to Fall goals → October' }))
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith({ wentWell: 'Rooms finished', didnt: '' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Didn’t save')
  })
})
