import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const signOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ signOut }) }))

import { SignOutSection } from './SignOutSection'

// Walkthrough 2026-09-21, C-P1: Sign out was a one-tap unlabelled icon in the
// phone header. It lives in Settings now, and asks first.
describe('SignOutSection', () => {
  beforeEach(() => signOut.mockClear())

  it('asks before signing out, and Cancel signs nobody out', () => {
    render(<SignOutSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.getByText('Sign out of Symphony on this device?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(signOut).not.toHaveBeenCalled()
    expect(screen.queryByText('Sign out of Symphony on this device?')).not.toBeInTheDocument()
  })

  it('signs out on the confirming tap', () => {
    render(<SignOutSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(signOut).toHaveBeenCalledTimes(1)
  })
})
