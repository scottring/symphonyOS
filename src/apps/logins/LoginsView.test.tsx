import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginsView } from './LoginsView'
import type { Login } from '@/hooks/useLogins'

vi.mock('@/hooks/useToast', () => ({ showToast: vi.fn() }))

function login(over: Partial<Login> = {}): Login {
  return {
    id: 'l1', site: 'Comcast', url: 'xfinity.com', username: 'scott@example.com',
    passwordHint: 'T*********01', notes: 'Internet', updatedAt: new Date('2026-11-17'), ...over,
  }
}

function setup(logins: Login[] = []) {
  const props = {
    logins, loading: false, error: null,
    onAdd: vi.fn().mockResolvedValue(true),
    onUpdate: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(undefined),
  }
  render(<LoginsView {...props} />)
  return props
}

describe('LoginsView', () => {
  it('invites the first login when there are none', () => {
    setup()
    expect(screen.getByText(/no logins yet/i)).toBeInTheDocument()
  })

  it('shows the site, username, hint and an open link', () => {
    setup([login()])
    expect(screen.getByRole('button', { name: 'Comcast' })).toBeInTheDocument()
    expect(screen.getByText('scott@example.com')).toBeInTheDocument()
    expect(screen.getByText('T*********01')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Comcast' })).toHaveAttribute('href', 'https://xfinity.com')
  })

  it('finds a login by any word', () => {
    setup([login(), login({ id: 'l2', site: 'BGE', url: 'bge.com', username: 'skaufman', notes: 'Gas and electric' })])
    fireEvent.change(screen.getByLabelText('Find a login'), { target: { value: 'electric' } })
    expect(screen.getByRole('button', { name: 'BGE' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comcast' })).not.toBeInTheDocument()
  })

  it('says when nothing matches', () => {
    setup([login()])
    fireEvent.change(screen.getByLabelText('Find a login'), { target: { value: 'netflix' } })
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument()
  })

  it('saves only a masked hint, never the typed password', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add a login' }))
    fireEvent.change(screen.getByLabelText('Site or account'), { target: { value: 'Netflix' } })
    fireEvent.click(screen.getByRole('button', { name: /make a hint from the password/i }))
    fireEvent.change(screen.getByLabelText('Password (not saved)'), { target: { value: 'TomSmith2001' } })
    expect(screen.getByLabelText('Password hint')).toHaveValue('T*********01')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onAdd).toHaveBeenCalled())
    const saved = props.onAdd.mock.calls[0][0]
    expect(saved).toMatchObject({ site: 'Netflix', passwordHint: 'T*********01' })
    expect(JSON.stringify(saved)).not.toContain('TomSmith2001')
  })

  it('edits a login in place', async () => {
    const props = setup([login()])
    fireEvent.click(screen.getByRole('button', { name: 'Comcast' }))
    fireEvent.change(screen.getByLabelText('Username or email'), { target: { value: 'iris@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith('l1', expect.objectContaining({ username: 'iris@example.com' })))
  })

  it('asks before deleting', () => {
    const props = setup([login()])
    fireEvent.click(screen.getByRole('button', { name: 'Delete Comcast' }))
    expect(props.onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onDelete).toHaveBeenCalledWith('l1')
  })
})
