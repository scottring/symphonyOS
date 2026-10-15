import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ claim: vi.fn() }))
vi.mock('@/lib/display/pairing', () => ({ claimPairingCode: mocks.claim }))

import { PairDisplayScreen } from './PairDisplayScreen'

beforeEach(() => { mocks.claim.mockReset() })

describe('PairDisplayScreen', () => {
  it('pairs with the typed code and shows the server’s refusal', async () => {
    mocks.claim.mockResolvedValue({ ok: false, error: 'That code is not valid or has expired' })
    render(<PairDisplayScreen onSignInInstead={() => {}} />)
    const button = screen.getByRole('button', { name: /pair this display/i })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/pairing code/i), { target: { value: 'abc234' } })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('That code is not valid or has expired'))
    expect(mocks.claim).toHaveBeenCalledWith('ABC234')
  })
  it('offers a person’s sign-in one tap away', () => {
    const onSignInInstead = vi.fn()
    render(<PairDisplayScreen onSignInInstead={onSignInInstead} />)
    fireEvent.click(screen.getByRole('button', { name: /sign in instead/i }))
    expect(onSignInInstead).toHaveBeenCalled()
  })
})
