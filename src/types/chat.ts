export interface VaultDraft {
  title: string
  content: string
}

/** Who wrote a message in a shared (Discuss) thread. `id` is the auth user id,
 *  so the panel can tell "me" from "my partner". Absent on solo chats. */
export interface ChatAuthor {
  id: string | null
  name: string
  kind: 'member' | 'symphony'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: { id: string; title: string; vaultPath?: string }[]
  vaultDraft?: VaultDraft
  timestamp: Date
  /** Set only in a shared thread — see ChatAuthor. */
  author?: ChatAuthor
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
