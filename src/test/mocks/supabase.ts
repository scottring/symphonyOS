import { vi } from 'vitest'

// Create chainable mock functions that support Supabase's fluent API
export function createSupabaseMock() {
  const mockData: Record<string, unknown[]> = {}
  let lastError: Error | null = null
  let singleResult: unknown = null

  const createChainableMock = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: Record<string, any> = {}

    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockImplementation((data) => {
      // Return a promise-like chain that can continue or resolve
      const insertChain = { ...chain }
      insertChain.then = (resolve: (value: unknown) => void) => {
        resolve({ data, error: lastError })
        return Promise.resolve()
      }
      return insertChain
    })
    chain.update = vi.fn().mockImplementation((data) => {
      // Return a promise-like chain that can continue or resolve
      const updateChain = { ...chain }
      updateChain.then = (resolve: (value: unknown) => void) => {
        resolve({ data, error: lastError })
        return Promise.resolve()
      }
      return updateChain
    })
    chain.delete = vi.fn().mockImplementation(() => {
      // Return a promise-like chain that can continue or resolve
      const deleteChain = { ...chain }
      deleteChain.then = (resolve: (value: unknown) => void) => {
        resolve({ data: null, error: lastError })
        return Promise.resolve()
      }
      return deleteChain
    })
    chain.upsert = vi.fn().mockImplementation((data) => {
      // Return a promise-like chain that can continue or resolve
      const upsertChain = { ...chain }
      upsertChain.then = (resolve: (value: unknown) => void) => {
        resolve({ data, error: lastError })
        return Promise.resolve()
      }
      return upsertChain
    })
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.neq = vi.fn().mockReturnValue(chain)
    chain.gt = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockReturnValue(chain)
    chain.lt = vi.fn().mockReturnValue(chain)
    chain.lte = vi.fn().mockReturnValue(chain)
    chain.in = vi.fn().mockReturnValue(chain)
    chain.is = vi.fn().mockReturnValue(chain)
    chain.or = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: mockData['default'] ?? [], error: lastError })
    )
    chain.single = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: singleResult, error: lastError })
    )
    chain.maybeSingle = vi.fn().mockImplementation(() =>
      Promise.resolve({ data: singleResult, error: lastError })
    )

    return chain
  }

  const mockFrom = vi.fn(() => createChainableMock())

  const mockAuth = {
    getSession: vi.fn().mockResolvedValue({
      data: { session: null },
      error: null,
    }),
    getUser: vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    signInWithOAuth: vi.fn().mockResolvedValue({
      data: { provider: 'google', url: 'https://example.com/oauth' },
      error: null,
    }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    }),
  }

  const mockChannel = vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  })

  return {
    supabase: {
      from: mockFrom,
      auth: mockAuth,
      channel: mockChannel,
    },
    // Helpers for setting up test data
    setMockData: (table: string, data: unknown[]) => {
      mockData[table] = data
      mockData['default'] = data
    },
    setMockError: (error: Error | null) => {
      lastError = error
    },
    setSingleResult: (result: unknown) => {
      singleResult = result
    },
    clearMocks: () => {
      Object.keys(mockData).forEach((key) => delete mockData[key])
      lastError = null
      singleResult = null
      vi.clearAllMocks()
    },
    getMockAuth: () => mockAuth,
    getMockFrom: () => mockFrom,
  }
}

// Default mock instance for simple tests
export const defaultSupabaseMock = createSupabaseMock()
