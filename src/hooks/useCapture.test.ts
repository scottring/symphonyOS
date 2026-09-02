import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCapture } from './useCapture'

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockEq = vi.fn()
let mockRow: Record<string, unknown> | null = null

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockFrom(table)
      return {
        select: (cols: string) => {
          mockSelect(cols)
          return {
            eq: (field: string, value: string) => {
              mockEq(field, value)
              return {
                maybeSingle: () => Promise.resolve({ data: mockRow, error: null }),
              }
            },
          }
        },
      }
    },
  },
}))

describe('useCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRow = null
  })

  it('does not query when the id is undefined', async () => {
    const { result } = renderHook(() => useCapture(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.current.capture).toBeNull()
  })

  it('reads named columns only — never SELECT *', async () => {
    mockRow = {
      id: 'c1',
      subject: 'Field trip Friday',
      sender: 'office@school.org',
      source_label: 'Lower School',
      raw_text: 'Please send a bag lunch.',
      created_at: '2026-09-02T14:00:00Z',
    }
    renderHook(() => useCapture('c1'))
    await waitFor(() => expect(mockSelect).toHaveBeenCalled())
    expect(mockFrom).toHaveBeenCalledWith('captures')
    expect(mockSelect).toHaveBeenCalledWith('id, subject, sender, source_label, raw_text, created_at')
    expect(mockSelect.mock.calls[0][0]).not.toContain('*')
    expect(mockEq).toHaveBeenCalledWith('id', 'c1')
  })

  it('maps the row to camelCase', async () => {
    mockRow = {
      id: 'c1',
      subject: 'Field trip Friday',
      sender: 'office@school.org',
      source_label: 'Lower School',
      raw_text: 'Please send a bag lunch.',
      created_at: '2026-09-02T14:00:00Z',
    }
    const { result } = renderHook(() => useCapture('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.capture).toEqual({
      id: 'c1',
      subject: 'Field trip Friday',
      sender: 'office@school.org',
      sourceLabel: 'Lower School',
      rawText: 'Please send a bag lunch.',
      createdAt: '2026-09-02T14:00:00Z',
    })
  })

  it('returns null when the capture is not readable', async () => {
    mockRow = null
    const { result } = renderHook(() => useCapture('gone'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.capture).toBeNull()
  })
})
