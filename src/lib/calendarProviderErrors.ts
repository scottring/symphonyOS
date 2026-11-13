import { isCalendarProvider, type CalendarProvider } from '@/lib/calendarProviders'

type ProviderError = { provider: string; connectionId?: string; needsReconnect: boolean }
const sameList = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Which accounts an events answer says need reconnecting. Kept as the same
 * array when nothing changed, so a quiet fetch doesn't re-render the page. */
export function applyProviderErrors(
  data: { providerErrors?: ProviderError[] } | null | undefined,
  setProviders: (fn: (prev: CalendarProvider[]) => CalendarProvider[]) => void,
  setAccountIds: (fn: (prev: string[]) => string[]) => void,
) {
  const broken = (data?.providerErrors ?? []).filter((e) => e.needsReconnect)
  const providers = [...new Set(broken.map((e) => e.provider))].filter(isCalendarProvider)
  const ids = broken.filter((e) => e.connectionId).map((e) => e.connectionId!)
  setProviders((prev) => (sameList(prev, providers) ? prev : providers))
  setAccountIds((prev) => (sameList(prev, ids) ? prev : ids))
}
