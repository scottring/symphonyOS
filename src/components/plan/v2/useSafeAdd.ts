// src/components/plan/v2/useSafeAdd.ts
//
// One add box's rules, shared by the week's composer and the Open journal's
// (2026-10-08 reviews): one write at a time — a second Enter while saving is
// ignored, so nothing is added twice; on success only the words that were
// SENT clear, so anything typed meanwhile stays; on failure the words stay and
// the box says so; the cursor stays in the box either way.
//
// Contract: `onAdd` resolves false (or throws) when nothing was stored. true —
// or no value — counts as stored. The pages' adapters return an explicit
// boolean from addTask's id, so a lost write is never read as success.
//
// `scope` is the period the box writes into ("2026-10-01"). The words and the
// failure note belong to it: another period on screen starts with an empty
// box, and a save still running from the last one can neither clear nor flag
// this one. The write itself still lands where it was sent.

import { useRef, useState, type RefObject } from 'react'

export function useSafeAdd(onAdd: (title: string) => Promise<boolean | void> | boolean | void, inputRef: RefObject<HTMLInputElement | null>, scope = '') {
  const [state, setState] = useState({ scope, text: '', failed: false })
  // Saves in flight, by period: one at a time per box and period, and a save
  // still running for October never holds up November's.
  const [savingIn, setSavingIn] = useState<string[]>([])
  const busy = useRef(new Set<string>())
  const here = state.scope === scope
  const draft = here ? state.text : ''
  const failed = here && state.failed
  const setDraft = (v: string) => setState({ scope, text: v, failed: false })
  const submit = async () => {
    const sent = draft
    const sentScope = scope
    const v = sent.trim()
    if (!v || busy.current.has(sentScope)) return
    busy.current.add(sentScope)
    setSavingIn((x) => [...x, sentScope])
    let ok = false
    try { ok = (await onAdd(v)) !== false } catch { ok = false } finally {
      busy.current.delete(sentScope)
      setSavingIn((x) => x.filter((k) => k !== sentScope))
    }
    setState((now) => {
      if (now.scope !== sentScope) return now
      return { scope: now.scope, text: ok && now.text === sent ? '' : now.text, failed: !ok }
    })
    inputRef.current?.focus()
  }
  return { draft, setDraft, saving: savingIn.includes(scope), failed, submit }
}
