import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePacking } from './usePacking'
import type { PackingTemplate } from './usePacking'
import type { PackingNode } from '@/types/trip'

// Mock Supabase data
const mockSupabaseData: PackingTemplate[] = []

// Create mock functions
const mockOrder = vi.fn()
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockSingle = vi.fn()
const mockGetUser = vi.fn()
const mockSubscribe = vi.fn()

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-id', email: 'test@example.com' },
    loading: false,
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => mockGetUser(),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: () => ({
      select: () => ({
        order: () => mockOrder(),
      }),
      insert: (data: unknown) => {
        mockInsert(data)
        return { select: () => ({ single: () => mockSingle() }) }
      },
      update: (data: unknown) => {
        mockUpdate(data)
        return { eq: () => ({ select: () => ({ single: () => mockSingle() }) }) }
      },
      delete: () => ({ eq: () => mockDelete() }),
    }),
    channel: () => ({
      on: () => ({
        subscribe: () => mockSubscribe(),
      }),
    }),
    removeChannel: vi.fn(),
  },
}))

function createMockPackingNodes(): PackingNode[] {
  return [
    { type: 'heading', level: 2, text: 'Toiletries' },
    { type: 'item', text: 'Toothbrush', checked: false },
    { type: 'item', text: 'Toothpaste', checked: false },
    { type: 'heading', level: 2, text: 'Clothing' },
    { type: 'item', text: 'Shirts (3)', checked: false },
    { type: 'item', text: 'Pants (2)', checked: false },
  ]
}

function createMockTemplate(overrides: Partial<PackingTemplate> = {}): PackingTemplate {
  return {
    id: 'template-1',
    userId: 'test-user-id',
    name: 'Weekend Trip',
    description: 'Basic items for a weekend getaway',
    nodes: createMockPackingNodes(),
    isDefault: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('usePacking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabaseData.length = 0

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    })

    mockOrder.mockResolvedValue({
      data: mockSupabaseData,
      error: null,
    })

    mockSubscribe.mockReturnValue({})
  })

  describe('Template Loading', () => {
    it('should load templates on mount', async () => {
      const template1 = createMockTemplate()
      const template2 = createMockTemplate({
        id: 'template-2',
        name: 'Business Trip',
        isDefault: true,
      })

      mockSupabaseData.push(
        {
          ...template1,
          user_id: template1.userId,
          created_at: template1.createdAt.toISOString(),
          updated_at: template1.updatedAt.toISOString(),
          is_default: template1.isDefault,
        } as any,
        {
          ...template2,
          user_id: template2.userId,
          created_at: template2.createdAt.toISOString(),
          updated_at: template2.updatedAt.toISOString(),
          is_default: template2.isDefault,
        } as any
      )

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.templates).toHaveLength(2)
      expect(result.current.templates[0].name).toBe('Weekend Trip')
      expect(result.current.templates[1].name).toBe('Business Trip')
      expect(result.current.templates[1].isDefault).toBe(true)
      expect(result.current.error).toBeNull()
    })

    it('should handle empty templates list', async () => {
      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.templates).toHaveLength(0)
      expect(result.current.error).toBeNull()
    })

    it('should handle fetch errors', async () => {
      mockOrder.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.templates).toHaveLength(0)
      expect(result.current.error).toBe('Database connection failed')
    })
  })

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      const newTemplate = createMockTemplate()
      const nodes: PackingNode[] = createMockPackingNodes()

      mockSingle.mockResolvedValue({
        data: {
          id: newTemplate.id,
          user_id: newTemplate.userId,
          name: newTemplate.name,
          description: newTemplate.description,
          nodes: newTemplate.nodes,
          is_default: newTemplate.isDefault,
          created_at: newTemplate.createdAt.toISOString(),
          updated_at: newTemplate.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let createdTemplate: PackingTemplate | undefined

      await act(async () => {
        createdTemplate = await result.current.createTemplate(
          'Weekend Trip',
          nodes,
          'Basic items for a weekend getaway'
        )
      })

      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        name: 'Weekend Trip',
        description: 'Basic items for a weekend getaway',
        nodes,
        is_default: false,
      })

      expect(createdTemplate).toBeDefined()
      expect(createdTemplate?.name).toBe('Weekend Trip')
      expect(createdTemplate?.nodes).toHaveLength(6)
    })

    it('should create a template without description', async () => {
      const newTemplate = createMockTemplate({ description: undefined })
      const nodes: PackingNode[] = [
        { type: 'heading', level: 2, text: 'Essentials' },
        { type: 'item', text: 'Phone charger', checked: false },
      ]

      mockSingle.mockResolvedValue({
        data: {
          id: newTemplate.id,
          user_id: newTemplate.userId,
          name: newTemplate.name,
          description: null,
          nodes: nodes,
          is_default: newTemplate.isDefault,
          created_at: newTemplate.createdAt.toISOString(),
          updated_at: newTemplate.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createTemplate('Weekend Trip', nodes)
      })

      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        name: 'Weekend Trip',
        description: null,
        nodes,
        is_default: false,
      })
    })

    it('should throw error when user is not authenticated', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        result.current.createTemplate('Test', [{ type: 'item', text: 'Test item', checked: false }])
      ).rejects.toThrow('User not authenticated')
    })
  })

  describe('updateTemplate', () => {
    it('should update template name', async () => {
      const template = createMockTemplate()

      mockSingle.mockResolvedValue({
        data: {
          ...template,
          name: 'Updated Weekend Trip',
          user_id: template.userId,
          is_default: template.isDefault,
          created_at: template.createdAt.toISOString(),
          updated_at: template.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateTemplate('template-1', {
          name: 'Updated Weekend Trip',
        })
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Updated Weekend Trip',
      })
    })

    it('should update template nodes', async () => {
      const template = createMockTemplate()
      const newNodes: PackingNode[] = [
        { type: 'heading', level: 2, text: 'Beach Gear' },
        { type: 'item', text: 'Sunscreen', checked: false },
        { type: 'item', text: 'Towel', checked: false },
      ]

      mockSingle.mockResolvedValue({
        data: {
          ...template,
          nodes: newNodes,
          user_id: template.userId,
          is_default: template.isDefault,
          created_at: template.createdAt.toISOString(),
          updated_at: template.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateTemplate('template-1', { nodes: newNodes })
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        nodes: newNodes,
      })
    })

    it('should update multiple fields at once', async () => {
      const template = createMockTemplate()
      const newNodes: PackingNode[] = [
        { type: 'item', text: 'Passport', checked: false },
      ]

      mockSingle.mockResolvedValue({
        data: {
          ...template,
          name: 'New Name',
          description: 'New Description',
          nodes: newNodes,
          user_id: template.userId,
          is_default: template.isDefault,
          created_at: template.createdAt.toISOString(),
          updated_at: template.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateTemplate('template-1', {
          name: 'New Name',
          description: 'New Description',
          nodes: newNodes,
        })
      })

      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'New Name',
        description: 'New Description',
        nodes: newNodes,
      })
    })
  })

  describe('deleteTemplate', () => {
    it('should delete a template', async () => {
      mockDelete.mockResolvedValue({
        data: null,
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteTemplate('template-1')
      })

      expect(mockDelete).toHaveBeenCalled()
    })

    it('should handle delete errors', async () => {
      mockDelete.mockResolvedValue({
        data: null,
        error: { message: 'Cannot delete template' },
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(result.current.deleteTemplate('template-1')).rejects.toThrow()
    })
  })

  describe('duplicateTemplate', () => {
    it('should duplicate a template with new name', async () => {
      const originalTemplate = createMockTemplate()
      const duplicatedTemplate = createMockTemplate({
        id: 'template-2',
        name: 'Weekend Trip (Copy)',
      })

      mockSupabaseData.push({
        ...originalTemplate,
        user_id: originalTemplate.userId,
        is_default: originalTemplate.isDefault,
        created_at: originalTemplate.createdAt.toISOString(),
        updated_at: originalTemplate.updatedAt.toISOString(),
      } as any)

      mockSingle.mockResolvedValue({
        data: {
          ...duplicatedTemplate,
          user_id: duplicatedTemplate.userId,
          is_default: duplicatedTemplate.isDefault,
          created_at: duplicatedTemplate.createdAt.toISOString(),
          updated_at: duplicatedTemplate.updatedAt.toISOString(),
        },
        error: null,
      })

      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      let duplicated: PackingTemplate | undefined

      await act(async () => {
        duplicated = await result.current.duplicateTemplate(
          'template-1',
          'Weekend Trip (Copy)'
        )
      })

      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        name: 'Weekend Trip (Copy)',
        description: originalTemplate.description,
        nodes: originalTemplate.nodes,
        is_default: false,
      })

      expect(duplicated).toBeDefined()
      expect(duplicated?.name).toBe('Weekend Trip (Copy)')
      expect(duplicated?.nodes).toEqual(originalTemplate.nodes)
    })

    it('should throw error if template not found', async () => {
      const { result } = renderHook(() => usePacking())

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await expect(
        result.current.duplicateTemplate('nonexistent-id', 'Copy')
      ).rejects.toThrow('Template not found')
    })
  })
})
