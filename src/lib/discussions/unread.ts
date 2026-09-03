// src/lib/discussions/unread.ts
//
// Unread = the last message is by someone other than me (a partner, or
// Symphony) and it landed after my last-read stamp. Only the LAST message
// matters: once I've read the thread everything before it is read too, and a
// thread whose last word is mine has nothing waiting for me.

export interface ReadableMessage {
  timestamp: Date
  author: { id: string | null; kind: 'member' | 'symphony' }
}

export function isUnread(
  messages: ReadableMessage[],
  selfAuthId: string | null,
  lastReadAt: Date | null,
): boolean {
  const last = messages[messages.length - 1]
  if (!last) return false
  const mine = last.author.kind === 'member' && last.author.id !== null && last.author.id === selfAuthId
  if (mine) return false
  if (!lastReadAt) return true
  return last.timestamp.getTime() > lastReadAt.getTime()
}
