// A guided session counts a period planned once anything saves at its
// choosing step (spec 2026-11-01). These wrap the page's own writers so each
// one that succeeds also tells the session — the same verbs, the same
// receipts and Undo, one extra call on success. The Week's (useGuidedWeek);
// Month, Season and Year hear of the page's own writes (GuidedPeriod).

import type { ChooseItemView, ChooseLineView, ChooseVerb } from '@/components/plan/choose/ChoosePlan'

/** Wraps one writer: on success it also reports. */
export type Report = <A extends unknown[]>(run: (...a: A) => Promise<boolean>) => (...a: A) => Promise<boolean>

export function reporter(applied: () => void): Report {
  return (run) => async (...a) => {
    const ok = await run(...a)
    if (ok) applied()
    return ok
  }
}

export function reportVerb(v: ChooseVerb, wrap: Report): ChooseVerb {
  return { ...v, run: wrap(v.run), ...(v.menu ? { menu: v.menu.map((m) => reportVerb(m, wrap)) } : {}) }
}

export function reportItem(x: ChooseItemView, wrap: Report): ChooseItemView {
  return {
    ...x, verbs: x.verbs.map((v) => reportVerb(v, wrap)), children: x.children.map((c) => reportItem(c, wrap)),
    ...(x.onBreakDown ? { onBreakDown: wrap(x.onBreakDown) } : {}),
  }
}

export function reportLine(l: ChooseLineView, wrap: Report): ChooseLineView {
  return {
    ...l, verbs: l.verbs.map((v) => reportVerb(v, wrap)), steps: l.steps.map((s) => reportItem(s, wrap)),
    ...(l.onAddStep ? { onAddStep: wrap(l.onAddStep) } : {}),
  }
}
