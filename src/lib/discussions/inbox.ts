// src/lib/discussions/inbox.ts
//
// The Discussions inbox: every thread you can see with activity, newest
// first, each row previewing the last message and whether it's waiting on you.
// Pure so the page and the sidebar badge derive from the same rule.

import { isUnread } from './unread'

export type InboxEntityType = 'task' | 'routine' | 'event'

export interface InboxSession {
  id: string
  entity_type: string | null
  entity_id: string | null
  title: string | null
  messages: unknown
  updated_at: string
  scope?: string | null
}

export interface InboxRow {
  sessionId: string
  entityType: InboxEntityType
  entityId: string
  title: string
  lastAuthor: string
  lastText: string
  lastAt: Date
  unread: boolean
}

interface StoredMessage {
  role?: string
  content?: string
  timestamp?: string
  author?: { id?: string | null; name?: string; kind?: string }
}

function readMessages(raw: unknown): StoredMessage[] {
  return Array.isArray(raw) ? (raw as StoredMessage[]) : []
}

/** One-line preview: markdown markers and line breaks read as noise in a list row. */
function previewText(raw: string): string {
  return raw.replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim()
}

function isEntityType(t: string | null): t is InboxEntityType {
  return t === 'task' || t === 'routine' || t === 'event'
}

/**
 * @param reads  session id → ISO last_read_at for the viewer
 */
export function buildInboxRows(
  sessions: readonly InboxSession[],
  reads: Readonly<Record<string, string>>,
  selfAuthId: string | null,
): InboxRow[] {
  const rows: InboxRow[] = []
  for (const s of sessions) {
    if (!isEntityType(s.entity_type) || !s.entity_id) continue
    const msgs = readMessages(s.messages).filter((m) => (m.content ?? '').trim().length > 0)
    const last = msgs[msgs.length - 1]
    if (!last) continue
    const lastAt = last.timestamp ? new Date(last.timestamp) : new Date(s.updated_at)
    const readable = msgs.map((m) => ({
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(0),
      author: {
        id: typeof m.author?.id === 'string' ? m.author.id : null,
        kind: (m.role === 'assistant' || m.author?.kind === 'symphony' ? 'symphony' : 'member') as 'member' | 'symphony',
      },
    }))
    const readAt = reads[s.id] ? new Date(reads[s.id]) : null
    rows.push({
      sessionId: s.id,
      entityType: s.entity_type,
      entityId: s.entity_id,
      title: s.title?.trim() || 'Untitled',
      lastAuthor: last.role === 'assistant' ? 'Symphony' : (last.author?.name ?? 'Someone'),
      lastText: previewText(last.content ?? ''),
      lastAt,
      unread: isUnread(readable, selfAuthId, readAt),
    })
  }
  rows.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
  return rows
}
