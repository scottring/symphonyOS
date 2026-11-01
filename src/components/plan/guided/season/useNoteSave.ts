// One note of the season's (energy, ideal week, wild cards), shown as last
// sent while its save runs: the notes row only changes once the save lands,
// and a second change made before then must build on the first, not on the
// row as it was. A save that fails says so, and `retry` sends the same value
// again; only the latest save counts.

import { useCallback, useRef, useState } from 'react'

export function useNoteSave<T>(saved: T, save: (value: T) => Promise<boolean>) {
  const [sent, setSent] = useState<{ value: T } | null>(null)
  const [failed, setFailed] = useState(false)
  const latest = useRef(0)
  const set = useCallback((value: T) => {
    const n = ++latest.current
    setSent({ value }); setFailed(false)
    void save(value).catch(() => false).then((ok) => { if (n === latest.current) setFailed(!ok) })
  }, [save])
  const retry = useCallback(() => { if (sent) set(sent.value) }, [sent, set])
  return { value: sent ? sent.value : saved, set, failed, retry }
}
