/** Small, versioned navigation state in the existing per-user onboarding_step.
 * No household content or credentials live in this marker. */
export type SetupStep = 'household' | 'routines' | 'horizons' | 'activity' | 'devices' | 'ready'
export type SetupStatus = 'pending' | 'done' | 'later'
export interface OnboardingProgress {
  version: 1
  step: SetupStep
  household: SetupStatus
  routines: SetupStatus
  activity: SetupStatus
  devices?: SetupStatus
  horizonsSeen: boolean
  finished: boolean
  paused: boolean
  destination: 'inbox' | 'week' | 'today' | 'year' | 'season' | 'month'
  destinationStart?: string
}
const PREFIX = 'getting-started:v1:'
export const newOnboardingProgress = (): OnboardingProgress => ({
  version: 1, step: 'household', household: 'pending', routines: 'pending', activity: 'pending',
  horizonsSeen: false, finished: false, paused: false, destination: 'week',
})
export function decodeOnboardingProgress(value: unknown): OnboardingProgress | null {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null
  try {
    const p = JSON.parse(value.slice(PREFIX.length)) as OnboardingProgress
    const statuses = ['pending', 'done', 'later']
    return p.version === 1 && ['household', 'routines', 'horizons', 'activity', 'devices', 'ready'].includes(p.step)
      && (p.devices===undefined || statuses.includes(p.devices))
      && (p.destinationStart===undefined || /^\d{4}-\d{2}-\d{2}$/.test(p.destinationStart))
      && [p.household, p.routines, p.activity].every(s => statuses.includes(s))
      && [p.horizonsSeen, p.finished, p.paused].every(v => typeof v === 'boolean')
      && ['inbox', 'week', 'today', 'year', 'season', 'month'].includes(p.destination) ? p : null
  } catch { return null }
}
export const encodeOnboardingProgress = (p: OnboardingProgress) => PREFIX + JSON.stringify(p)
export function canFinishOnboarding(p: OnboardingProgress): boolean {
  return p.household === 'done' && p.horizonsSeen && p.routines !== 'pending' && p.activity !== 'pending'
}
export function onboardingStage(step: SetupStep): number {
  return ({household: 0, routines: 1, horizons: 2, activity: 2, devices:3, ready: 4})[step]
}

/** A future item must not be introduced as "today" or "this year". */
export function onboardingOpenLabel(p:OnboardingProgress):string {
  const [y,m,d]=(p.destinationStart??'').split('-').map(Number)
  const date=new Date(y,m-1,d,12)
  if(p.destinationStart&&!Number.isNaN(date.getTime())) {
    if(p.destination==='year')return `Open ${y}`
    if(p.destination==='month')return `Open ${date.toLocaleDateString(undefined,{month:'long',year:'numeric'})}`
    const label=date.toLocaleDateString(undefined,{month:'short',day:'numeric'})
    if(p.destination==='week')return `Open the week of ${label}`
    if(p.destination==='season')return `Open the quarter beginning ${label}`
    if(p.destination==='today')return `Open ${date.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}`
  }
  return `Open ${({inbox:'my Inbox',week:'my week',today:'Today',year:'this year',season:'this quarter',month:'this month'})[p.destination]}`
}
