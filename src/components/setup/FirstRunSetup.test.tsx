import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { User } from '@supabase/supabase-js'

const h = vi.hoisted(() => ({
  save: vi.fn().mockResolvedValue(undefined),
  skip: vi.fn().mockResolvedValue(undefined),
  geocode: vi.fn(),
}))
vi.mock('@/lib/firstRun', () => ({ saveFirstRunSetup: h.save, skipFirstRunSetup: h.skip }))
vi.mock('@/lib/geocode', () => ({ geocodePlace: h.geocode }))

import { FirstRunSetup } from './FirstRunSetup'

const user = { id: 'u1', email: 'jess.rivera@example.com', user_metadata: {} } as unknown as User

beforeEach(() => {
  h.save.mockClear(); h.skip.mockClear(); h.geocode.mockReset()
})

describe('FirstRunSetup', () => {
  it('prefills your name from the email and saves household, people, and home', async () => {
    h.geocode.mockResolvedValue({ lat: 39.29, lng: -76.61, label: 'Baltimore, Maryland' })
    const onDone = vi.fn()
    const { user: u } = render(<FirstRunSetup user={user} onDone={onDone} />)

    expect(screen.getByLabelText('Your name')).toHaveValue('Jess')

    await u.type(screen.getByLabelText('Household name'), 'The Riveras')
    await u.type(screen.getByLabelText('Person 1 name'), 'Sam')
    await u.click(screen.getByText('Add someone'))
    await u.type(screen.getByLabelText('Person 2 name'), 'Liam')
    expect(screen.getByLabelText('Person 2 role')).toHaveValue('child')

    await u.type(screen.getByLabelText('Where is home?'), '21211')
    await u.tab()
    await waitFor(() => expect(screen.getByLabelText('Where is home?')).toHaveValue('Baltimore, Maryland'))

    await u.click(screen.getByRole('button', { name: 'Set up my household' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.save).toHaveBeenCalledWith('u1', {
      householdName: 'The Riveras',
      yourName: 'Jess',
      others: [{ name: 'Sam', role: 'parent' }, { name: 'Liam', role: 'child' }],
      home: { lat: 39.29, lng: -76.61, label: 'Baltimore, Maryland' },
    })
  })

  it('drops blank people rows and saves without a home', async () => {
    const onDone = vi.fn()
    const { user: u } = render(<FirstRunSetup user={user} onDone={onDone} />)
    await u.click(screen.getByRole('button', { name: 'Set up my household' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.save.mock.calls[0][1]).toMatchObject({ others: [], home: null })
    expect(h.geocode).not.toHaveBeenCalled()
  })

  it('shows the error and stays put when saving fails', async () => {
    h.save.mockRejectedValueOnce(new Error('boom'))
    const onDone = vi.fn()
    const { user: u } = render(<FirstRunSetup user={user} onDone={onDone} />)
    await u.click(screen.getByRole('button', { name: 'Set up my household' }))
    expect(await screen.findByText('boom')).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('skip still ensures a household, then continues', async () => {
    const onDone = vi.fn()
    const { user: u } = render(<FirstRunSetup user={user} onDone={onDone} />)
    await u.click(screen.getByText('Skip for now'))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.skip).toHaveBeenCalledWith('u1')
    expect(h.save).not.toHaveBeenCalled()
  })
})
