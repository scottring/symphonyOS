// "Tell Symphony" on the kiosk: a small, closed set of kitchen commands
// (conversational canvas, slice 7).
//
// Taps, typing and (opt-in) speech all land here and come out as the SAME
// KioskCommand the on-screen buttons run, so voice can never do something a
// button can't. Anything outside this set is "not understood" — the wall is
// a shared screen and does not guess. A name spoken aloud is not
// authentication, so no command here reads or writes anything private.
//
// The wall mic was switched off on 2026-05-25 because the kids played with
// it. Speech is therefore behind an explicit opt-in (default off) and real-
// room behaviour — distance, echo off the speakerphone, kids talking over
// it — has NOT been validated. That needs the EMEET M0 Plus speakerphone on
// the Pi; until then treat voice as untested.
//
// PURE.

export type KioskCommand =
  | { type: 'show-dinner' }
  | { type: 'set-serves'; serves: number }
  | { type: 'add-missing' }
  | { type: 'start-cooking' }
  | { type: 'next-step' }
  | { type: 'prev-step' }
  | { type: 'start-timer'; minutes: number }
  | { type: 'stop-timer' }
  | { type: 'resume-cooking' }
  | { type: 'home' }
  | { type: 'back' }

const UNITS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 }
const UNIT_RE = Object.keys(UNITS).sort((a, b) => b.length - a.length).join('|')
const TENS_RE = Object.keys(TENS).join('|')

/** "twenty five" → "25", "six" → "6". "a"/"an" stay words ("a minute"). */
function wordsToDigits(t: string): string {
  return t
    .replace(new RegExp(String.raw`\b(${TENS_RE})[ -](${UNIT_RE})\b`, 'g'), (_, tens: string, unit: string) => String(TENS[tens] + UNITS[unit]))
    .replace(new RegExp(String.raw`\b(${TENS_RE})\b`, 'g'), (w: string) => String(TENS[w]))
    .replace(new RegExp(String.raw`\b(${UNIT_RE})\b`, 'g'), (w: string) => String(UNITS[w]))
}

const NUM = String.raw`(\d+|an?)`

function toNumber(s: string): number | null {
  const t = s.trim().toLowerCase()
  if (/^\d+$/.test(t)) return Number(t)
  return t === 'a' || t === 'an' ? 1 : null
}

function clean(text: string): string {
  return wordsToDigits(text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9' -]/g, ' ')
    .replace(/\b(please|symphony|hey|ok|okay|um|uh)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim())
}

/** One utterance or typed line → a command, or null when it isn't one. */
export function parseKioskCommand(input: string): KioskCommand | null {
  const t = clean(input)
  if (!t) return null

  // Timers first: "timer 5 minutes" must never read as "5 people".
  const UNIT = '(min|mins|minute|minutes|hour|hours)'
  const timer = t.match(new RegExp(String.raw`(?:set |start )?(?:a )?timer (?:for )?${NUM} ?${UNIT}?\b`))
    ?? t.match(new RegExp(String.raw`\b${NUM}[ -]?${UNIT}(?: timer)?\b`))
  if (timer && /timer|minute|min\b|mins|hour/.test(t) && !/\b(people|of us|servings?)\b/.test(t)) {
    const n = toNumber(timer[1])
    if (n != null && n > 0) {
      const minutes = /^hour/.test(timer[2] ?? '') ? n * 60 : n
      if (minutes <= 24 * 60) return { type: 'start-timer', minutes }
    }
  }
  if (/\b(stop|cancel|end|silence) (the )?(timer|alarm)\b/.test(t)) return { type: 'stop-timer' }

  if (/\b(back to|resume|continue|return to) (the )?cooking\b/.test(t)) return { type: 'resume-cooking' }
  if (/\b(start|begin) cooking\b|\blet's cook\b|\bcook (it|dinner|this)\b/.test(t)) return { type: 'start-cooking' }

  if (/\b(previous|last) step\b|\b(back|go back) (a|one|1) step\b|\bstep back\b/.test(t)) return { type: 'prev-step' }
  if (/^(next|next step|go on|done next)$|\bnext step\b/.test(t)) return { type: 'next-step' }

  if (/\badd (what's|what is|whats|the|everything) missing\b|\badd missing\b|\bwhat's missing\b|\badd .* to (the )?groceries\b/.test(t)) {
    return { type: 'add-missing' }
  }

  const serves = t.match(new RegExp(String.raw`\b(?:we have|we've got|we are|we're|there are|there's|there will be|cook(?:ing)? for|serves?|serving|make it for|for) ${NUM}(?: (?:people|of us|servings?|guests))?\b`))
  if (serves && (/\b(people|of us|servings?|serves?|guests|we have|we've got|we are|we're|there are|cook)/.test(t))) {
    const n = toNumber(serves[1])
    if (n != null && n > 0 && n <= 24) return { type: 'set-serves', serves: n }
  }

  if (/\bwhat's for dinner\b|\bwhat is for dinner\b|\bwhats for dinner\b|\bshow (me )?dinner\b|\bdinner tonight\b|^dinner$/.test(t)) {
    return { type: 'show-dinner' }
  }

  if (/^(go )?home$|\bgo home\b|\bhome screen\b|\bhousehold view\b/.test(t)) return { type: 'home' }
  if (/^(go )?back$/.test(t)) return { type: 'back' }
  return null
}

/** What the wall says back, in plain words, once a command runs. */
export function describeKioskCommand(c: KioskCommand): string {
  switch (c.type) {
    case 'show-dinner': return 'Showing dinner'
    case 'set-serves': return `Serving ${c.serves}`
    case 'add-missing': return 'Checking what’s missing'
    case 'start-cooking': return 'Cooking'
    case 'next-step': return 'Next step'
    case 'prev-step': return 'Previous step'
    case 'start-timer': return `Timer · ${c.minutes} min`
    case 'stop-timer': return 'Timer stopped'
    case 'resume-cooking': return 'Back to cooking'
    case 'home': return 'Home'
    case 'back': return 'Back'
  }
}

/** The phrases the command panel offers as buttons — always available,
 *  whether or not speech is on. */
export const KIOSK_PHRASES: { label: string; command: KioskCommand }[] = [
  { label: 'What’s for dinner?', command: { type: 'show-dinner' } },
  { label: 'Add what’s missing', command: { type: 'add-missing' } },
  { label: 'Start cooking', command: { type: 'start-cooking' } },
  { label: 'Next step', command: { type: 'next-step' } },
  { label: 'Back a step', command: { type: 'prev-step' } },
  { label: 'Timer 5 minutes', command: { type: 'start-timer', minutes: 5 } },
  { label: 'Timer 10 minutes', command: { type: 'start-timer', minutes: 10 } },
  { label: 'Back to cooking', command: { type: 'resume-cooking' } },
  { label: 'Home', command: { type: 'home' } },
]

// ─── Speech opt-in ────────────────────────────────────────────────

export const VOICE_OPT_IN_KEY = 'symphony-wall-voice-optin'

export function readVoiceOptIn(store: Pick<Storage, 'getItem'> | null): boolean {
  try { return store?.getItem(VOICE_OPT_IN_KEY) === 'on' } catch { return false }
}

export function writeVoiceOptIn(store: Pick<Storage, 'setItem' | 'removeItem'> | null, on: boolean): void {
  try {
    if (!store) return
    if (on) store.setItem(VOICE_OPT_IN_KEY, 'on')
    else store.removeItem(VOICE_OPT_IN_KEY)
  } catch { /* best effort */ }
}
