// src/lib/explain/showSignal.ts
//
// The conversation (text agent or voice) asks the page to show something; the
// guide layer in the shell draws it. A module signal, like quickAddSignal, so
// the stream and the voice transport need no React plumbing.

import type { ShowStep } from './steps'

/** 'chat' steps through with Next and Back; 'voice' is driven by the voice. */
export type ShowSource = 'chat' | 'voice'
type Listener = (steps: ShowStep[], source: ShowSource) => void

const listeners = new Set<Listener>()

export function requestShow(steps: ShowStep[], source: ShowSource): void {
  if (steps.length) listeners.forEach((l) => l(steps, source))
}

export function onShowRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
