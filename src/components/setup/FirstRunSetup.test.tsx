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
      others: [{ id: expect.any(String), name: 'Sam', role: 'parent' }, { id: expect.any(String), name: 'Liam', role: 'child' }],
      removedIds: [],
      home: { lat: 39.29, lng: -76.61, label: 'Baltimore, Maryland' },
    })
  })

  // Independent review of #160: a retry must update the same people the
  // failed attempt saved, so each row keeps its id between attempts.
  it('retries with the same person ids, the edited role, and removed rows listed', async () => {
    h.save.mockRejectedValueOnce(new Error("We couldn't save your setup."))
    const { user: u } = render(<FirstRunSetup user={user} onDone={vi.fn()} />)
    await u.type(screen.getByLabelText('Person 1 name'), 'Jordan')
    await u.click(screen.getByText('Add someone'))
    await u.type(screen.getByLabelText('Person 2 name'), 'Liam')
    await u.click(screen.getByText('Add someone'))
    await u.type(screen.getByLabelText('Person 3 name'), 'Mia')
    await u.selectOptions(screen.getByLabelText('Person 1 role'), 'child')
    await u.click(screen.getByRole('button', { name: 'Set up my household' }))
    await screen.findByText("We couldn't save your setup.")
    const first = h.save.mock.calls[0][1]
    const [jordan, liam, mia] = first.others.map((o: { id: string }) => o.id)
    expect(new Set([jordan, liam, mia]).size).toBe(3)

    // Edit after the failure: Jordan becomes a partner, Liam is removed, Mia is blanked.
    await u.selectOptions(screen.getByLabelText('Person 1 role'), 'parent')
    await u.click(screen.getByLabelText('Remove person 2'))
    await u.clear(screen.getByLabelText('Person 2 name'))
    await u.click(screen.getByRole('button', { name: 'Set up my household' }))
    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(2))
    const retry = h.save.mock.calls[1][1]
    expect(retry.others).toEqual([{ id: jordan, name: 'Jordan', role: 'parent' }])
    expect(retry.removedIds).toEqual(expect.arrayContaining([liam, mia]))
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

  it('stays on setup with a retry message when skip cannot create the household', async () => {
    h.skip.mockRejectedValueOnce(new Error("We couldn't save your household. Check your connection and try again."))
    const onDone = vi.fn()
    const { user: u } = render(<FirstRunSetup user={user} onDone={onDone} />)
    await u.click(screen.getByText('Skip for now'))
    expect(await screen.findByText(/couldn't save your household/)).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('Skip for now')).not.toBeDisabled()
  })
})
