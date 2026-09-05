import { DOMAINS, type DomainId } from '@/lib/domains'

/**
 * ⌥1 / ⌥2 / ⌥3 file a capture into the nth domain without leaving the keyboard.
 *
 * Matched on `code`, NOT `key`: on macOS Option+1 produces "¡", Option+2 "™" —
 * `key` never carries the digit. Positions come from DOMAINS, so the shortcuts
 * follow the registry rather than a second hand-written list.
 *
 * ⌥ rather than ⌘: Chrome binds ⌘1-9 to tab switching and will not give it up.
 */
export function domainForHotkey(e: { altKey: boolean; code: string }): DomainId | null {
  if (!e.altKey) return null
  const digit = /^Digit([1-9])$/.exec(e.code)
  if (!digit) return null
  return DOMAINS[Number(digit[1]) - 1]?.id ?? null
}

/** The hint printed on the nth chip. */
export function domainHotkeyLabel(index: number): string {
  return `⌥${index + 1}`
}
