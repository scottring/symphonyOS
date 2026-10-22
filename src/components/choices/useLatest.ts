import { useMemo, useReducer, useRef } from 'react'

interface Entry<T> { from: T; cur: T; pending: number }

/** Edits made faster than the page refetches. Per key, the value the last
 *  edit asked for wins over the server copy while a write is in flight, and
 *  until the server copy changes. A failed write puts back what it replaced. */
export function useLatest<T>() {
  const map = useRef(new Map<string, Entry<T>>())
  const [, bump] = useReducer((n: number) => n + 1, 0)
  return useMemo(() => {
    const get = (key: string, server: T): T => {
      const e = map.current.get(key)
      return e && (e.pending > 0 || e.from === server) ? e.cur : server
    }
    /** Writes `next` in place of the current value. Returns the write's result. */
    const write = async (key: string, server: T, next: T, save: () => Promise<boolean>): Promise<boolean> => {
      const prev = get(key, server)
      const e = map.current.get(key)
      map.current.set(key, { from: server, cur: next, pending: (e && e.pending > 0 ? e.pending : 0) + 1 })
      bump()
      let ok = false
      try { ok = await save() } finally {
        const now = map.current.get(key)
        if (now) {
          now.pending = Math.max(0, now.pending - 1)
          if (!ok && now.cur === next) now.cur = prev
        }
        bump()
      }
      return ok
    }
    return { get, write }
  }, [])
}
