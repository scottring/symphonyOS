export interface VaultDraft {
  title: string
  content: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { id: string; title: string; vaultPath?: string }[]
  vaultDraft?: VaultDraft
  mealRequest?: string
  timestamp: Date
}

export interface EntityContext {
  type: 'task' | 'contact' | 'project' | 'event' | 'routine'
  id: string
  name: string
}

export type ChatMode = 'chat' | 'guided_reflection'

export interface ChatSession {
  id: string
  title: string | null
  entityType: string | null
  entityId: string | null
  mode: ChatMode
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}
