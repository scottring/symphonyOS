// What the Kitchen wall v2 dock says in each moment: the hint's tail, an
// example of what to say, and whether the strip stays open there. PURE.
//
// The adaptive strip (Scott, 2026-10-14, "calmer screens"): the dock's centre
// is a single round mic when there is nothing to say. It stays open only
// where its hint helps hands that are busy — cooking and getting out the
// door. No suggestion chips: what to say is an example, never a button.

import type { KioskScreen } from './kioskScreen'

export interface DockCopy {
  /** After "Say “Hey Symphony”, or tap" — e.g. " a step". */
  tapWhat: string
  /** An example of what to say here. */
  line: string
  /** Hands are busy here: the strip stays open with its hint. */
  open: boolean
}

/** What the dock says in each moment. Examples are things the wall can
 *  already do or answer. */
export function dockCopy(screen: KioskScreen | 'cooking' | 'activity' | 'more'): DockCopy {
  switch (screen) {
    case 'out-the-door': return { tapWhat: '', line: 'Tap a step or say it', open: true }
    case 'cooking': return { tapWhat: '', line: '“Next step”', open: true }
    case 'home': return { tapWhat: '', line: '“Add apples to the grocery list”', open: false }
    case 'dinner': return { tapWhat: '', line: '“Set a timer for 20 minutes”', open: false }
    case 'bedtime': return { tapWhat: ' a circle', line: '“What’s for dinner tomorrow?”', open: false }
    case 'night': return { tapWhat: '', line: '“What time do we leave tomorrow?”', open: false }
    case 'weekend': return { tapWhat: '', line: '“Add pancakes to the grocery list”', open: false }
    case 'more': return { tapWhat: '', line: 'Tap a tile, or just ask', open: false }
    default: return { tapWhat: '', line: 'Ask anything, or tell me what changed', open: false }
  }
}
