import type { ConnectorMessage } from './types.ts'

/** Messages accumulate here between flush ticks. In memory on purpose: a
 * worker restart loses at most one tick's buffer, and both sources still
 * hold their own history, so the next tick re-reads from the high-water
 * mark rather than losing anything permanently. */
export class MessageBuffer {
  private readonly bySource = new Map<string, ConnectorMessage[]>()

  add(sourceKey: string, message: ConnectorMessage): void {
    const list = this.bySource.get(sourceKey)
    if (list) list.push(message)
    else this.bySource.set(sourceKey, [message])
  }

  drain(sourceKey: string): ConnectorMessage[] {
    const list = this.bySource.get(sourceKey) ?? []
    this.bySource.delete(sourceKey)
    return list
  }

  /** Put a failed batch back at the FRONT, so time order survives a retry. */
  restore(sourceKey: string, messages: ConnectorMessage[]): void {
    if (messages.length === 0) return
    const current = this.bySource.get(sourceKey) ?? []
    this.bySource.set(sourceKey, [...messages, ...current])
  }

  keys(): string[] {
    return [...this.bySource.keys()]
  }
}
