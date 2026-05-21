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
// Agent Chat (Michael)
// ============================================================================

export interface AgentChatResponse {
  reply: string
  sessionId: string | null
  channelId: string
}

export interface AgentChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

/** Send a message to the Michael agent */
export async function agentChat(
  message: string,
  channelId = 'web:default',
): Promise<AgentChatResponse | null> {
  return callOpenBrain<AgentChatResponse>('/api/agent-chat', {
    method: 'POST',
    body: JSON.stringify({ message, channelId }),
    timeout: 120000, // Agent can take a while
  })
}

/** Get chat history for a channel */
export async function getAgentChatHistory(
  channelId = 'web:default',
  limit = 50,
): Promise<AgentChatMessage[] | null> {
  const result = await callOpenBrain<{ messages: AgentChatMessage[] }>(
    `/api/agent-chat/history?channelId=${encodeURIComponent(channelId)}&limit=${limit}`,
  )
  return result?.messages ?? null
}

/** Reset agent session (start fresh) */
export async function resetAgentSession(channelId = 'web:default'): Promise<boolean> {
  const result = await callOpenBrain('/api/agent-chat/reset', {
    method: 'POST',
    body: JSON.stringify({ channelId }),
  })
  return result !== null
}

// ============================================================================
// Briefing
// ============================================================================

export interface BriefingTask {
  slug: string
  title: string
  status: string
  due?: string
  domain?: string
  daysOverdue?: number
}

export interface BriefingData {
  greeting: string
  timeContext: 'morning' | 'midday' | 'evening' | 'night'
  timestamp: string
  overdueTasks: BriefingTask[]
  dueTodayTasks: BriefingTask[]
  upcomingTasks: BriefingTask[]
  activeProjects: { slug: string; title: string; status: string; domain?: string }[]
  recentCaptures: { text: string; timestamp: string }[]
}

/** Fetch structured briefing from Open Brain */
export async function fetchBriefing(): Promise<BriefingData> {
  if (!OPEN_BRAIN_URL) throw new Error('OPEN_BRAIN_URL not configured')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000)

  const res = await fetch(`${OPEN_BRAIN_URL}/api/briefing`, {
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': OPEN_BRAIN_API_KEY,
    },
  })

  clearTimeout(timeoutId)

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
  }

  return await res.json() as BriefingData
}

// ============================================================================
// Voice Transcription
// ============================================================================

/** Discriminated result so callers can show a specific failure message. */
export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'not-configured' | 'empty' | 'timeout' | 'network' | 'http'; detail?: string }

/**
 * Transcribe audio via Groq Whisper on Open Brain. Returns a discriminated
 * result instead of null so the wall mic can surface a specific failure
 * message (timeout vs. HTTP error vs. network drop) and log the cause.
 */
export async function transcribeVoice(audioBlob: Blob): Promise<TranscribeResult> {
  if (!OPEN_BRAIN_URL) return { ok: false, reason: 'not-configured' }
  if (audioBlob.size === 0) return { ok: false, reason: 'empty' }

  const formData = new FormData()
  formData.append('audio', audioBlob, 'recording.webm')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const res = await fetch(`${OPEN_BRAIN_URL}/api/voice/transcribe`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'X-Api-Key': OPEN_BRAIN_API_KEY,
      },
      body: formData,
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      let bodyHint = ''
      try { bodyHint = (await res.text()).slice(0, 200) } catch { /* noop */ }
      console.warn(`[transcribeVoice] HTTP ${res.status}`, bodyHint)
      return { ok: false, reason: 'http', detail: `${res.status} ${res.statusText}` }
    }

    const data = await res.json() as { text?: string }
    const text = (data.text ?? '').trim()
    if (!text) return { ok: false, reason: 'empty' }
    return { ok: true, text }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.warn('[transcribeVoice] timed out after 30s')
      return { ok: false, reason: 'timeout' }
    }
    console.warn('[transcribeVoice] network error:', err)
    return { ok: false, reason: 'network', detail: err instanceof Error ? err.message : String(err) }
  }
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
