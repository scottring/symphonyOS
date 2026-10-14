// What the Kitchen wall v2 dock suggests in each moment: the hint's tail,
// an example of what to say, and one suggestion chip (sent as if said).
// PURE.

import type { KioskScreen } from './kioskScreen'

export interface DockCopy {
  /** After "Say “Hey Symphony”, or tap" — e.g. " a step". */
  tapWhat: string
  /** An example of what to say here. */
  line: string
  /** One suggestion, sent as if said; null for none. */
  chip: string | null
}

/** What the dock suggests in each moment (mockups, 2026-10-14). Examples are
 *  things the wall can already do or answer. */
export function dockCopy(screen: KioskScreen | 'cooking' | 'activity' | 'more'): DockCopy {
  switch (screen) {
    case 'rest': return { tapWhat: '', line: 'Ask anything, or tell me what changed', chip: 'What’s for dinner this week?' }
    case 'out-the-door': return { tapWhat: ' a step', line: '“Is it a jacket day?”', chip: 'Who still needs to finish?' }
    case 'home': return { tapWhat: '', line: '“Add apples to the grocery list”', chip: 'Start a 20-minute timer' }
    case 'dinner': return { tapWhat: '', line: '“Set a timer for 20 minutes”', chip: 'Next step in the recipe' }
    case 'bedtime': return { tapWhat: ' a circle', line: '“What’s for dinner tomorrow?”', chip: 'What’s tomorrow?' }
    case 'night': return { tapWhat: '', line: '“What time do we leave tomorrow?”', chip: null }
    case 'weekend': return { tapWhat: '', line: '“Add pancakes to the grocery list”', chip: 'Plan this afternoon' }
    case 'cooking': return { tapWhat: '', line: '“Set a timer for 10 minutes”', chip: 'Next step' }
    case 'more': return { tapWhat: '', line: 'Tap a tile, or just ask', chip: null }
    default: return { tapWhat: '', line: 'Ask anything, or tell me what changed', chip: null }
  }
}
