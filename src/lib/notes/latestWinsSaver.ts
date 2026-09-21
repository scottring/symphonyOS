/**
 * One write at a time, newest text wins.
 *
 * A rich editor reports every keystroke. Sending each one as its own request
 * lets them race: the server applies them in whatever order they arrive, and
 * the row keeps whichever landed last — measured on 2026-09-21 as 16 PATCHes
 * in 3 ms leaving "…and the re" where the user typed "…and the receipt".
 *
 * Here a save waits for the one in flight; while it waits, a newer save
 * replaces it. So writes reach the server in order and the final write always
 * carries the final text. The saver outlives the component that made it, so a
 * save queued just before the panel closes still goes out.
 *
 * A job resolving to `true` is a confirmed write, `false` (or a throw) a
 * failed one; anything else is unknown and reports no status.
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function createLatestWinsSaver(onStatus: (status: SaveStatus) => void) {
  let inFlight = false
  let pending: (() => unknown) | null = null

  const pump = async (): Promise<void> => {
    if (inFlight || !pending) return
    const job = pending
    pending = null
    inFlight = true
    onStatus('saving')
    let result: unknown
    try {
      result = await job()
    } catch {
      result = false
    }
    inFlight = false
    // A newer save is waiting: its outcome is the one worth reporting.
    if (pending) return pump()
    onStatus(result === true ? 'saved' : result === false ? 'error' : 'idle')
  }

  return {
    save(job: () => unknown): void {
      pending = job
      void pump()
    },
  }
}
