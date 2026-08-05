import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { daysUntil, EXPIRY_WARNING_DAYS, useDocuments } from '@/hooks/useDocuments'

const rows = [
  {
    id: 'a1', entity_type: 'task', entity_id: 't1',
    file_name: 'license.jpg', file_type: 'image/jpeg', file_size: 1024,
    storage_path: 'u1/task/t1/license.jpg',
    document_status: 'kept', document_kind: 'drivers_license',
    document_label: "Scott's driver's license", document_owner: 'Scott',
    document_expires_on: '2029-03-14', document_scope: 'private',
    created_at: '2026-08-05T10:00:00Z',
  },
  {
    id: 'a2', entity_type: 'task', entity_id: 't2',
    file_name: 'passport.pdf', file_type: 'application/pdf', file_size: 2048,
    storage_path: 'u1/task/t2/passport.pdf',
    document_status: 'proposed', document_kind: 'passport',
    document_label: 'Passport', document_owner: null,
    document_expires_on: null, document_scope: 'private',
    created_at: '2026-08-05T11:00:00Z',
  },
]

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: rows, error: null }),
          })),
        })),
      })),
      update,
    })),
  },
}))

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }))

beforeEach(() => {
  update.mockClear()
  updateEq.mockClear()
})

describe('daysUntil', () => {
  const today = new Date('2026-08-05T12:00:00Z')

  it('counts forward to a future date', () => {
    expect(daysUntil('2026-08-15', today)).toBe(10)
  })

  it('returns 0 on the day itself', () => {
    expect(daysUntil('2026-08-05', today)).toBe(0)
  })

  it('goes negative once expired', () => {
    expect(daysUntil('2026-08-01', today)).toBe(-4)
  })

  it('returns null when there is no expiry', () => {
    expect(daysUntil(null, today)).toBeNull()
  })

  it('returns null for an unparseable date', () => {
    expect(daysUntil('not-a-date', today)).toBeNull()
  })
})

describe('useDocuments', () => {
  it('splits kept documents from proposals', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.documents.map((d) => d.id)).toEqual(['a1'])
    expect(result.current.proposals.map((d) => d.id)).toEqual(['a2'])
    expect(result.current.documents[0].label).toBe("Scott's driver's license")
    expect(result.current.documents[0].sourceEntityType).toBe('task')
  })

  it('keepDocument promotes to kept', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.keepDocument('a2') })
    expect(update).toHaveBeenCalledWith({ document_status: 'kept' })
    expect(updateEq).toHaveBeenCalledWith('id', 'a2')
  })

  it('dismissDocument marks dismissed', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.dismissDocument('a2') })
    expect(update).toHaveBeenCalledWith({ document_status: 'dismissed' })
  })

  it('setScope writes the requested scope', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.setScope('a1', 'household') })
    expect(update).toHaveBeenCalledWith({ document_scope: 'household' })
  })

  it('updateDocument sends only the fields given', async () => {
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => { await result.current.updateDocument('a1', { label: 'MD license' }) })
    expect(update).toHaveBeenCalledWith({ document_label: 'MD license' })
  })

  it('treats a shelf upload as having no source entity', async () => {
    rows.push({
      id: 'a3', entity_type: 'document', entity_id: 'u1',
      file_name: 'passport2.pdf', file_type: 'application/pdf', file_size: 10,
      storage_path: 'u1/document/u1/passport2.pdf',
      document_status: 'kept', document_kind: 'passport',
      document_label: 'Passport', document_owner: 'Scott',
      document_expires_on: null, document_scope: 'private',
      created_at: '2026-08-05T12:00:00Z',
    })
    const { result } = renderHook(() => useDocuments())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const shelfDoc = result.current.documents.find((d) => d.id === 'a3')
    expect(shelfDoc?.sourceEntityType).toBeNull()
    expect(shelfDoc?.sourceEntityId).toBeNull()
    rows.pop()
  })

  it('exposes a 60-day warning threshold', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(60)
  })
})
