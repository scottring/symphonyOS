import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Per-source "newest message we have successfully DELIVERED" marks, on the
 * Fly volume. Distinct from capture_checkpoints, which is the server's own
 * dedupe: this one exists so a failed POST re-sends instead of vanishing.
 * The two together make delivery at-least-once and extraction exactly-once. */
export class HighWaterStore {
  private marks = new Map<string, Date>()
  private readonly filePath: string

  // Written out longhand rather than as a TS parameter property: Node's
  // --experimental-strip-types cannot compile `constructor(private x: T)`,
  // and tsc will not warn you, so it fails only at runtime on the server.
  constructor(filePath: string) {
    this.filePath = filePath
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Record<string, string>
      this.marks = new Map(Object.entries(parsed).map(([k, v]) => [k, new Date(v)]))
    } catch {
      // No file yet (first boot) or unreadable — start empty. An empty mark
      // means "everything is new", which over-delivers rather than losing;
      // capture_checkpoints absorbs the duplicate.
      this.marks = new Map()
    }
  }

  get(sourceKey: string): Date | null {
    return this.marks.get(sourceKey) ?? null
  }

  async set(sourceKey: string, at: Date): Promise<void> {
    const current = this.marks.get(sourceKey)
    if (current && current.getTime() >= at.getTime()) return
    this.marks.set(sourceKey, at)
    const obj = Object.fromEntries([...this.marks].map(([k, v]) => [k, v.toISOString()]))
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(obj, null, 2), 'utf8')
  }
}
