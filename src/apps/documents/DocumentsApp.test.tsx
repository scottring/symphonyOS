import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DocumentsApp } from './DocumentsApp'
import type { SymphonyDocument } from '@/hooks/useDocuments'

function doc(over: Partial<SymphonyDocument> = {}): SymphonyDocument {
  return {
    id: 'a1', fileName: 'license.jpg', fileType: 'image/jpeg', fileSize: 1024,
    storagePath: 'u1/task/t1/license.jpg', kind: 'drivers_license',
    label: "Scott's driver's license", owner: 'Scott', expiresOn: null,
    scope: 'private', status: 'kept', sourceEntityType: 'task',
    sourceEntityId: 't1', createdAt: new Date('2026-08-05'), ...over,
  }
}

const state = {
  documents: [] as SymphonyDocument[],
  proposals: [] as SymphonyDocument[],
  isLoading: false,
  error: null as string | null,
  keepDocument: vi.fn(), dismissDocument: vi.fn(), updateDocument: vi.fn(),
  setScope: vi.fn(), deleteDocument: vi.fn(), reload: vi.fn(),
}

vi.mock('@/hooks/useDocuments', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useDocuments')>('@/hooks/useDocuments')
  return { ...actual, useDocuments: () => state }
})

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

describe('DocumentsApp', () => {
  it('shows an empty state when the shelf is bare', () => {
    state.documents = []
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByText(/no documents yet/i)).toBeInTheDocument()
  })

  it('lists a kept document with its kind', () => {
    state.documents = [doc()]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByText("Scott's driver's license")).toBeInTheDocument()
    expect(screen.getByText("Driver's license")).toBeInTheDocument()
  })

  it('groups by owner', () => {
    state.documents = [doc({ owner: 'Scott' }), doc({ id: 'a2', owner: 'Iris', label: 'Iris passport' })]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByText('Scott')).toBeInTheDocument()
    expect(screen.getByText('Iris')).toBeInTheDocument()
  })

  it('warns when an expiry is inside the threshold', () => {
    const soon = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10)
    state.documents = [doc({ expiresOn: soon })]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByText(/expires in 20 days/i)).toBeInTheDocument()
  })

  it('marks an already-expired document', () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    state.documents = [doc({ expiresOn: past })]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByText(/^expired$/i)).toBeInTheDocument()
  })

  it('shows a private document as private', () => {
    state.documents = [doc({ scope: 'private' })]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByLabelText(/private to you/i)).toBeInTheDocument()
  })

  it('shows a household document as shared', () => {
    state.documents = [doc({ scope: 'household' })]
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByLabelText(/shared with household/i)).toBeInTheDocument()
  })

  it('shows pending proposals above the shelf', () => {
    state.documents = []
    state.proposals = [doc({ id: 'p1', status: 'proposed', label: 'Passport', kind: 'passport' })]
    render(<DocumentsApp />)
    expect(screen.getByRole('button', { name: /keep in documents/i })).toBeInTheDocument()
  })

  it('offers a direct upload control', () => {
    state.documents = []
    state.proposals = []
    render(<DocumentsApp />)
    expect(screen.getByLabelText(/add a document/i)).toBeInTheDocument()
  })
})
