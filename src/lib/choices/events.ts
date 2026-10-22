/** Window event; every writer caller dispatches it after a write, and the
 *  choice views refetch on it. */
export const CHOICES_UPDATED = 'symphony-choices-updated'

export function announceChoices() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHOICES_UPDATED))
}
