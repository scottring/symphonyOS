import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAttachments } from './useAttachments'
import { createMockUser, resetIdCounter } from '@/test/mocks/factories'
import type { DbAttachment } from '@/types/attachment'

// Module-level state for mocking
const mockUser = createMockUser()
let mockUserState: ReturnType<typeof createMockUser> | null = mockUser
let mockError: { message: string } | null = null
let mockFetchResult: unknown = null
let mockInsertResult: unknown = null
let mockUploadResult: { error: { message: string } | null } = { error: null }
let mockSignedUrlResult: { data: { signedUrl: string } | null; error: { message: string } | null } = {
  data: { signedUrl: 'https://example.com/signed-url' },
  error: null,
}

const mockSelect = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockUpload = vi.fn()
const mockRemove = vi.fn()
const mockCreateSignedUrl = vi.fn()

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUserState }),
}))

// Create chainable mock for select operations
const createSelectChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return {
          eq: (field3: string, value3: string) => {
            mockEq(field3, value3)
            return {
              order: (col: string, opts: { ascending: boolean }) => {
                mockOrder(col, opts)
                return Promise.resolve({ data: mockFetchResult, error: mockError })
              },
            }
          },
        }
      },
    }
  },
})

// Create chainable mock for insert operations
const createInsertChain = () => ({
  select: () => {
    mockSelect()
    return {
      single: () => {
        mockSingle()
        return Promise.resolve({ data: mockInsertResult, error: mockError })
      },
    }
  },
})

// Create chainable mock for delete operations
const createDeleteChain = () => ({
  eq: (field: string, value: string) => {
    mockEq(field, value)
    return {
      eq: (field2: string, value2: string) => {
        mockEq(field2, value2)
        return Promise.resolve({ error: mockError })
      },
    }
  },
})

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => createSelectChain(),
      insert: (data: unknown) => {
        mockInsert(data)
        return createInsertChain()
      },
      delete: () => {
        mockDelete()
        return createDeleteChain()
      },
    }),
    storage: {
      from: () => ({
        upload: (path: string, file: File, options: unknown) => {
          mockUpload(path, file, options)
          return Promise.resolve(mockUploadResult)
        },
        remove: (paths: string[]) => {
          mockRemove(paths)
          return Promise.resolve({ error: mockError })
        },
        createSignedUrl: (path: string, expiresIn: number) => {
          mockCreateSignedUrl(path, expiresIn)
          return Promise.resolve(mockSignedUrlResult)
        },
      }),
    },
  },
}))

// Helper to create a mock File
function createMockFile(
  name: string,
  type: string,
  size: number = 1024
): File {
  const blob = new Blob(['x'.repeat(size)], { type })
  return new File([blob], name, { type })
}

// Helper to create a mock DbAttachment
function createMockDbAttachment(overrides: Partial<DbAttachment> = {}): DbAttachment {
  return {
    id: 'attachment-1',
    user_id: mockUser.id,
    entity_type: 'task',
    entity_id: 'task-1',
    file_name: 'test.pdf',
    file_type: 'application/pdf',
    file_size: 1024,
    storage_path: 'test-user-id/task/task-1/test.pdf',
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useAttachments', () => {
  beforeEach(() => {
    resetIdCounter()
    mockError = null
    mockFetchResult = null
    mockInsertResult = null
    mockUploadResult = { error: null }
    mockSignedUrlResult = {
      data: { signedUrl: 'https://example.com/signed-url' },
      error: null,
    }
    mockUserState = mockUser
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('starts with empty attachments map', () => {
      const { result } = renderHook(() => useAttachments())
      expect(result.current.attachments.size).toBe(0)
    })

    it('starts with isLoading=false', () => {
      const { result } = renderHook(() => useAttachments())
      expect(result.current.isLoading).toBe(false)
    })

    it('starts with no error', () => {
      const { result } = renderHook(() => useAttachments())
      expect(result.current.error).toBeNull()
    })
  })

  describe('fetchAttachments', () => {
    it('fetches attachments for an entity', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      let fetched: unknown[] = []
      await act(async () => {
        fetched = await result.current.fetchAttachments('task', 'task-1')
      })

      expect(fetched).toHaveLength(1)
      expect(fetched[0]).toMatchObject({
        id: 'attachment-1',
        entityType: 'task',
        entityId: 'task-1',
        fileName: 'test.pdf',
      })
    })

    it('returns empty array when no attachments exist', async () => {
      mockFetchResult = []

      const { result } = renderHook(() => useAttachments())

      let fetched: unknown[] = []
      await act(async () => {
        fetched = await result.current.fetchAttachments('task', 'task-1')
      })

      expect(fetched).toHaveLength(0)
    })

    it('handles fetch errors gracefully', async () => {
      mockError = { message: 'Database error' }

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      expect(result.current.error).toBe('Database error')
    })

    it('returns empty array when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useAttachments())

      let fetched: unknown[] = []
      await act(async () => {
        fetched = await result.current.fetchAttachments('task', 'task-1')
      })

      expect(fetched).toHaveLength(0)
    })

    it('caches attachments by entity', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      // First fetch
      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      expect(mockOrder).toHaveBeenCalledTimes(1)

      // Second fetch should use cache
      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      // Should not call the DB again
      expect(mockOrder).toHaveBeenCalledTimes(1)
    })
  })

  describe('getAttachments', () => {
    it('returns cached data synchronously', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      // Fetch first
      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      // Get synchronously
      const cached = result.current.getAttachments('task', 'task-1')
      expect(cached).toHaveLength(1)
      expect(cached[0].fileName).toBe('test.pdf')
    })

    it('returns empty array for unfetched entity', () => {
      const { result } = renderHook(() => useAttachments())
      const cached = result.current.getAttachments('task', 'task-1')
      expect(cached).toHaveLength(0)
    })
  })

  describe('uploadAttachment', () => {
    it('uploads a file and creates attachment record', async () => {
      const file = createMockFile('test.pdf', 'application/pdf')
      mockInsertResult = createMockDbAttachment()

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', file)
      })

      expect(mockUpload).toHaveBeenCalled()
      expect(mockInsert).toHaveBeenCalled()
      expect(uploaded).not.toBeNull()
    })

    it('validates file type before upload', async () => {
      const file = createMockFile('test.exe', 'application/x-msdownload')

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', file)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toContain('File type not allowed')
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('rejects files with disallowed MIME types', async () => {
      const file = createMockFile('test.zip', 'application/zip')

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', file)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toContain('File type not allowed')
    })

    it('validates file size before upload', async () => {
      // Create a file larger than MAX_FILE_SIZE (50MB)
      const largeFile = createMockFile('large.pdf', 'application/pdf', 60 * 1024 * 1024)

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', largeFile)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toContain('File size exceeds')
      expect(mockUpload).not.toHaveBeenCalled()
    })

    it('rejects files exceeding MAX_FILE_SIZE', async () => {
      const largeFile = createMockFile('big.pdf', 'application/pdf', 51 * 1024 * 1024)

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', largeFile)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toBe('File size exceeds 50MB limit')
    })

    it('handles upload errors gracefully', async () => {
      mockUploadResult = { error: { message: 'Storage error' } }
      const file = createMockFile('test.pdf', 'application/pdf')

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', file)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toBe('Storage error')
    })

    it('uses optimistic updates for upload', async () => {
      const file = createMockFile('test.pdf', 'application/pdf')
      mockInsertResult = createMockDbAttachment()

      const { result } = renderHook(() => useAttachments())

      // Start upload but don't await
      act(() => {
        result.current.uploadAttachment('task', 'task-1', file)
      })

      // Optimistic attachment should appear immediately
      await waitFor(() => {
        const attachments = result.current.getAttachments('task', 'task-1')
        expect(attachments.length).toBe(1)
      })
    })

    it('rolls back optimistic update on upload failure', async () => {
      mockUploadResult = { error: { message: 'Upload failed' } }
      const file = createMockFile('test.pdf', 'application/pdf')

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.uploadAttachment('task', 'task-1', file)
      })

      // Should have rolled back
      const attachments = result.current.getAttachments('task', 'task-1')
      expect(attachments).toHaveLength(0)
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null
      const file = createMockFile('test.pdf', 'application/pdf')

      const { result } = renderHook(() => useAttachments())

      let uploaded
      await act(async () => {
        uploaded = await result.current.uploadAttachment('task', 'task-1', file)
      })

      expect(uploaded).toBeNull()
      expect(result.current.error).toBe('Must be logged in to upload files')
    })
  })

  describe('deleteAttachment', () => {
    it('deletes attachment and removes from storage', async () => {
      // First populate cache
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      // Now delete
      let deleted
      await act(async () => {
        const attachment = result.current.getAttachments('task', 'task-1')[0]
        deleted = await result.current.deleteAttachment(attachment)
      })

      expect(deleted).toBe(true)
      expect(mockRemove).toHaveBeenCalled()
      expect(mockDelete).toHaveBeenCalled()
    })

    it('uses optimistic updates for delete', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      expect(result.current.getAttachments('task', 'task-1')).toHaveLength(1)

      // Delete should remove optimistically
      act(() => {
        const attachment = result.current.getAttachments('task', 'task-1')[0]
        result.current.deleteAttachment(attachment)
      })

      // Should be removed immediately
      await waitFor(() => {
        expect(result.current.getAttachments('task', 'task-1')).toHaveLength(0)
      })
    })

    it('handles delete errors gracefully', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      // Make storage delete fail
      mockError = { message: 'Delete failed' }

      let deleted
      await act(async () => {
        const attachment = result.current.getAttachments('task', 'task-1')[0]
        deleted = await result.current.deleteAttachment(attachment)
      })

      expect(deleted).toBe(false)
      expect(result.current.error).toBe('Delete failed')
    })

    it('rolls back optimistic update on delete failure', async () => {
      const mockAttachment = createMockDbAttachment()
      mockFetchResult = [mockAttachment]

      const { result } = renderHook(() => useAttachments())

      await act(async () => {
        await result.current.fetchAttachments('task', 'task-1')
      })

      // Make storage delete fail
      mockError = { message: 'Delete failed' }

      await act(async () => {
        const attachment = result.current.getAttachments('task', 'task-1')[0]
        await result.current.deleteAttachment(attachment)
      })

      // Should have rolled back - attachment should still be there
      expect(result.current.getAttachments('task', 'task-1')).toHaveLength(1)
    })

    it('returns false when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useAttachments())

      const fakeAttachment = {
        id: 'fake',
        entityType: 'task' as const,
        entityId: 'task-1',
        fileName: 'test.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        storagePath: 'path/to/file',
        createdAt: new Date(),
      }

      let deleted
      await act(async () => {
        deleted = await result.current.deleteAttachment(fakeAttachment)
      })

      expect(deleted).toBe(false)
      expect(result.current.error).toBe('Must be logged in to delete files')
    })
  })

  describe('getSignedUrl', () => {
    it('generates signed URL for file access', async () => {
      const { result } = renderHook(() => useAttachments())

      let url
      await act(async () => {
        url = await result.current.getSignedUrl('path/to/file.pdf')
      })

      expect(url).toBe('https://example.com/signed-url')
      expect(mockCreateSignedUrl).toHaveBeenCalledWith('path/to/file.pdf', 3600)
    })

    it('handles signed URL generation errors', async () => {
      mockSignedUrlResult = {
        data: null,
        error: { message: 'Failed to generate URL' },
      }

      const { result } = renderHook(() => useAttachments())

      let url
      await act(async () => {
        url = await result.current.getSignedUrl('path/to/file.pdf')
      })

      expect(url).toBeNull()
      expect(result.current.error).toBe('Failed to generate URL')
    })

    it('returns null when user is not authenticated', async () => {
      mockUserState = null

      const { result } = renderHook(() => useAttachments())

      let url
      await act(async () => {
        url = await result.current.getSignedUrl('path/to/file.pdf')
      })

      expect(url).toBeNull()
    })
  })
})
