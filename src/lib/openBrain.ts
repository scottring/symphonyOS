/**
 * Open Brain API client for Symphony OS.
 *
 * Calls Open Brain (Mac Mini via Cloudflare Tunnel) for knowledge operations.
 * Falls back to Supabase edge functions if Open Brain is unreachable.
 */

const OPEN_BRAIN_URL = import.meta.env.VITE_OPEN_BRAIN_URL || ''
const OPEN_BRAIN_API_KEY = import.meta.env.VITE_OPEN_BRAIN_API_KEY || ''

/** Whether Open Brain is configured (has a URL set) */
export const isOpenBrainConfigured = Boolean(OPEN_BRAIN_URL)

interface OpenBrainRequestOptions extends Omit<RequestInit, 'signal'> {
  /** Timeout in milliseconds (default: 5000) */
  timeout?: number
}

/**
 * Call an Open Brain API endpoint.
 * Returns null if Open Brain is unreachable (caller should fallback).
 */
export async function callOpenBrain<T = unknown>(
  path: string,
  options: OpenBrainRequestOptions = {},
): Promise<T | null> {
  if (!OPEN_BRAIN_URL) return null

  const { timeout = 5000, ...fetchOptions } = options
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(`${OPEN_BRAIN_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': OPEN_BRAIN_API_KEY,
        ...fetchOptions.headers,
      },
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn(`Open Brain ${path} returned ${res.status}`)
      return null
    }

    return await res.json() as T
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn(`Open Brain ${path} timed out after ${timeout}ms`)
    } else {
      console.warn(`Open Brain ${path} unreachable:`, err)
    }
    return null
  }
}

// ============================================================================
// Vault Notes
// ============================================================================

export interface VaultNoteMeta {
  slug: string
  path: string
  title: string
  type: string
  status?: string
  domain?: string
  due?: string
  created?: string
  tags: string[]
  linked: string[]
  content?: string
  attachmentCount: number
}

export interface VaultSearchResult {
  path: string
  title: string
  type: string
  status?: string
  domain?: string
  relevance: number
  snippet: string
}

/** Fetch vault notes by type (tasks, projects, people, ideas) */
export async function fetchVaultNotes(
  type: 'tasks' | 'projects' | 'people' | 'ideas',
  filters?: Record<string, string>,
): Promise<VaultNoteMeta[] | null> {
  const params = filters ? '?' + new URLSearchParams(filters).toString() : ''
  const result = await callOpenBrain<{ notes: VaultNoteMeta[] }>(`/api/notes/${type}${params}`)
  return result?.notes ?? null
}

/** Fetch a single vault note with full content */
export async function fetchVaultNote(
  type: string,
  slug: string,
): Promise<VaultNoteMeta | null> {
  return callOpenBrain<VaultNoteMeta>(`/api/notes/${type}/${slug}`)
}

/** Capture text to vault inbox */
export async function captureToVault(text: string): Promise<boolean> {
  const result = await callOpenBrain('/api/capture', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
  return result !== null
}

/** Semantic search across vault */
export async function semanticSearch(
  query: string,
  k = 10,
): Promise<VaultSearchResult[] | null> {
  const result = await callOpenBrain<{ results: VaultSearchResult[] }>(
    `/api/search?q=${encodeURIComponent(query)}&k=${k}`,
  )
  return result?.results ?? null
}

// ============================================================================
// iMessage
// ============================================================================

export interface IMessage {
  id: number
  text: string | null
  date: string         // ISO date string
  isFromMe: boolean
  service: string      // 'iMessage' | 'SMS'
  hasAttachments: boolean
}

export interface IMessageConversation {
  chatId: number
  identifier: string   // phone or email
  displayName: string | null
  service: string
  isGroup: boolean
  lastMessage: {
    text: string
    date: string
    isFromMe: boolean
  } | null
  messageCount: number
}

export interface IMessageStatus {
  available: boolean
  messageCount?: number
  contactCount?: number
  error?: string
}

/** Check if iMessage integration is available */
export async function checkMessagesStatus(): Promise<IMessageStatus> {
  const result = await callOpenBrain<IMessageStatus>('/api/messages/status', { timeout: 3000 })
  return result ?? { available: false }
}

/** Fetch recent conversations */
export async function fetchConversations(limit = 20): Promise<IMessageConversation[] | null> {
  const result = await callOpenBrain<{ conversations: IMessageConversation[] }>(
    `/api/messages/conversations?limit=${limit}`,
  )
  return result?.conversations ?? null
}

/** Fetch messages for a specific contact (phone number or email) */
export async function fetchContactMessages(
  identifier: string,
  options: { limit?: number; before?: string } = {},
): Promise<{ messages: IMessage[]; found: boolean } | null> {
  const params = new URLSearchParams()
  if (options.limit) params.set('limit', String(options.limit))
  if (options.before) params.set('before', options.before)
  const qs = params.toString() ? `?${params.toString()}` : ''

  return callOpenBrain<{ messages: IMessage[]; found: boolean }>(
    `/api/messages/contact/${encodeURIComponent(identifier)}${qs}`,
    { timeout: 8000 },
  )
}

/** Search messages by text */
export async function searchMessages(
  query: string,
  options: { limit?: number; contact?: string } = {},
): Promise<IMessage[] | null> {
  const params = new URLSearchParams({ q: query })
  if (options.limit) params.set('limit', String(options.limit))
  if (options.contact) params.set('contact', options.contact)

  const result = await callOpenBrain<{ messages: IMessage[] }>(
    `/api/messages/search?${params.toString()}`,
    { timeout: 8000 },
  )
  return result?.messages ?? null
}

/** Send an iMessage/SMS via Open Brain */
export async function sendMessage(
  to: string,
  message: string,
  service?: 'iMessage' | 'SMS',
): Promise<{ sent: boolean; service: string } | null> {
  return callOpenBrain<{ sent: boolean; service: string }>('/api/messages/send', {
    method: 'POST',
    body: JSON.stringify({ to, message, service }),
    timeout: 15000,
  })
}

// ============================================================================
// Health
// ============================================================================

/**
 * Check if Open Brain is healthy.
 */
export async function checkOpenBrainHealth(): Promise<{
  available: boolean
  status?: string
  uptime?: number
}> {
  if (!OPEN_BRAIN_URL) return { available: false }

  const result = await callOpenBrain<{
    status: string
    uptime: number
    vault: string
    database: string
  }>('/api/health', { timeout: 3000 })

  if (!result) return { available: false }

  return {
    available: result.status === 'ok',
    status: result.status,
    uptime: result.uptime,
  }
}
