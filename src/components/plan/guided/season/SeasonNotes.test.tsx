import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SeasonWildCards } from './SeasonNotes'

describe('the season’s notes, each saved on an explicit change', () => {
  it('a save that failed says so and can be sent again; once it lands the warning goes', async () => {
    const patch = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<SeasonWildCards value={[]} patch={patch} />)
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Travel' })) })
    expect(screen.getByRole('alert')).toHaveTextContent('Didn’t save.')
    // What was sent still shows: nothing is lost while it is retried.
    expect(screen.getByRole('checkbox', { name: 'Travel' })).toBeChecked()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Try again' })) })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch.mock.calls[1][0]).toEqual({ wildCards: ['travel'] })
    expect(screen.queryByRole('alert')).toBeNull()
    // Inside the step's body, with the cards.
    expect(screen.getByRole('group', { name: 'Wild cards' }).closest('.gw-body')).not.toBeNull()
  })

  it('a later change that saves clears an earlier failure', async () => {
    const patch = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true)
    render(<SeasonWildCards value={[]} patch={patch} />)
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Money' })) })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: 'Travel' })) })
    expect(patch.mock.calls[1][0]).toEqual({ wildCards: ['money', 'travel'] })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
