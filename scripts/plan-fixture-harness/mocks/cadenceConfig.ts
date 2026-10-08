// The harness's week start: from the URL (?weekStart=sat|sun|mon), Saturday
// by default — never the account's setting and never localStorage. Every
// module that asks for the cadence (the week anchor, week numbers, the Week
// page) gets this one answer, so the fixture week and the page agree.
export * from '@real/lib/cadence/config'
import { DEFAULT_CADENCE, type CadenceConfig, type WeekStart } from '@real/lib/cadence/config'

export const FIXTURE_WEEK_STARTS = [
  { key: 'sat', day: 6, label: 'Saturday' },
  { key: 'sun', day: 0, label: 'Sunday' },
  { key: 'mon', day: 1, label: 'Monday' },
] as const satisfies readonly { key: string; day: WeekStart; label: string }[]

export function fixtureWeekStartKey(): (typeof FIXTURE_WEEK_STARTS)[number]['key'] {
  const v = new URLSearchParams(location.search).get('weekStart')
  return FIXTURE_WEEK_STARTS.find((w) => w.key === v)?.key ?? 'sat'
}

export function readCadenceConfig(): CadenceConfig {
  const day = FIXTURE_WEEK_STARTS.find((w) => w.key === fixtureWeekStartKey())!.day
  return { ...DEFAULT_CADENCE, weekStartsOn: day, weeklyNudgeDay: day }
}

/** Read-only here: the preview never writes a setting. */
export function useCadenceConfig(): { config: CadenceConfig; setConfig: (next: Partial<CadenceConfig>) => void } {
  return { config: readCadenceConfig(), setConfig: () => {} }
}
