import { GUIDE_STEPS, stepsFor, type GuideLevel } from './steps'

export interface GuideProgress {
  current: string
  done: string[]
  skipped: string[]
  plannedAt?: string
  finishedAt?: string
  threadId?: string
}

export function startProgress(level: GuideLevel): GuideProgress {
  return { current: stepsFor(level)[0].id, done: [], skipped: [] }
}

function without(list: string[], id: string): string[] {
  return list.filter(x => x !== id)
}

function advance(p: GuideProgress, level: GuideLevel, done: string[], skipped: string[]): GuideProgress {
  const steps = stepsFor(level)
  const idx = steps.findIndex(s => s.id === p.current)
  let next = p.current
  for (let i = idx + 1; i < steps.length; i++) {
    if (!done.includes(steps[i].id)) {
      next = steps[i].id
      break
    }
  }
  return { ...p, current: next, done, skipped }
}

export function goNext(p: GuideProgress, level: GuideLevel): GuideProgress {
  const done = p.done.includes(p.current) ? p.done : [...p.done, p.current]
  return advance(p, level, done, without(p.skipped, p.current))
}

export function skipStep(p: GuideProgress, level: GuideLevel): GuideProgress {
  const skipped = p.skipped.includes(p.current) ? p.skipped : [...p.skipped, p.current]
  return advance(p, level, without(p.done, p.current), skipped)
}

// The interface carries no level, so an id is known if any level has it.
export function jumpTo(p: GuideProgress, stepId: string): GuideProgress {
  const known = (Object.keys(GUIDE_STEPS) as GuideLevel[]).some(l => GUIDE_STEPS[l].some(s => s.id === stepId))
  return known && p.current !== stepId ? { ...p, current: stepId } : p
}

export function isLastStep(p: GuideProgress, level: GuideLevel): boolean {
  const steps = stepsFor(level)
  return steps[steps.length - 1].id === p.current
}

export function parseProgress(raw: unknown, level: GuideLevel): GuideProgress {
  if (!raw || typeof raw !== 'object') return startProgress(level)
  const r = raw as Record<string, unknown>
  const ids = new Set(stepsFor(level).map(s => s.id))
  if (typeof r.current !== 'string' || !ids.has(r.current)) return startProgress(level)
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && ids.has(x)) : []
  const out: GuideProgress = { current: r.current, done: list(r.done), skipped: list(r.skipped) }
  if (typeof r.plannedAt === 'string') out.plannedAt = r.plannedAt
  if (typeof r.finishedAt === 'string') out.finishedAt = r.finishedAt
  if (typeof r.threadId === 'string') out.threadId = r.threadId
  return out
}

/** A session finished before, opened again ("Plan … again"): it starts on its
 *  first step, with what was done and skipped still marked. Running again it
 *  is not finished; Done sets finishedAt again. */
export function reopenProgress(p: GuideProgress, level: GuideLevel): GuideProgress {
  if (!p.finishedAt) return p
  const { finishedAt: _finished, ...rest } = p
  return { ...rest, current: stepsFor(level)[0].id }
}
