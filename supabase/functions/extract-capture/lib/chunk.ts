import type { ParsedMessage } from './whatsapp.ts'

// Packs messages into newline-joined "[ts] sender: text" chunks, each (best-effort)
// under maxChars. A single message longer than maxChars becomes its own chunk.
export function chunkMessages(messages: ParsedMessage[], maxChars: number): string[] {
  const chunks: string[] = []
  let cur: string[] = []
  let len = 0
  for (const mm of messages) {
    const line = `[${mm.timestamp}] ${mm.sender}: ${mm.text}`
    if (cur.length > 0 && len + line.length + 1 > maxChars) {
      chunks.push(cur.join('\n'))
      cur = []
      len = 0
    }
    cur.push(line)
    len += line.length + 1
  }
  if (cur.length > 0) chunks.push(cur.join('\n'))
  return chunks
}
