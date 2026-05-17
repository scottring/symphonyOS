import type { RhythmMode } from './rhythm/rhythmMode'
import type { ImminentEntity } from './now/useImminentEntity'

export interface PinnedFocus {
  kind: 'recipe' | 'event' | 'task' | 'mode'
  title: string
  payload?: unknown
}

export type OverrideRef =
  | { kind: 'mode'; mode: RhythmMode }
  | { kind: 'coming-up-item'; itemId: string }

export interface ResolveNowFocusInput {
  pinned: PinnedFocus | null
  override: OverrideRef | null
  rhythmMode: RhythmMode
  imminent: ImminentEntity | null
}

export type NowFocus =
  | { kind: 'pinned'; pinned: PinnedFocus }
  | { kind: 'override-mode'; mode: RhythmMode }
  | { kind: 'override-item'; itemId: string }
  | { kind: 'imminent'; entity: ImminentEntity }
  | { kind: 'mode-default'; mode: RhythmMode }

export function resolveNowFocus(input: ResolveNowFocusInput): NowFocus {
  if (input.pinned) return { kind: 'pinned', pinned: input.pinned }
  if (input.override?.kind === 'coming-up-item') return { kind: 'override-item', itemId: input.override.itemId }
  if (input.override?.kind === 'mode') return { kind: 'override-mode', mode: input.override.mode }
  if (input.imminent) return { kind: 'imminent', entity: input.imminent }
  return { kind: 'mode-default', mode: input.rhythmMode }
}
