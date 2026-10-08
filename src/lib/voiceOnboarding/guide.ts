// src/lib/voiceOnboarding/guide.ts
//
// The typed guide (planning-conversation) from the page's side: what is sent,
// and what comes back as proposals the person may Add or Dismiss.
//
// What is sent is ONLY what this session shows, after the draft is checked
// against what the person may see now (reconcileDraft — the domain filter,
// people lens and account the page reads with): the session's goals, its
// lines and the ones already on the plan for them, and the last few turns.
// Goals travel as refs ("g1"), never row ids; nothing else about the account
// is sent. Nothing comes back as a write: a proposal becomes a draft line only
// when the person taps Add, and only Save writes it.

import { supabase } from '@/lib/supabase'
import { FREE, HORIZONS, activeGoals, horizonOf, reconcileDraft, type ExistingPlan, type FlowAction, type Horizon, type PeriodLabels, type VoicePlanDraft } from './flow'

export const GUIDE_ON = import.meta.env.VITE_PLANNING_CONVERSATION === '1'
export const MAX_TURNS = 8

export interface GuideTurn { role: 'user' | 'assistant'; text: string }
export interface GuideProposal { level: Horizon; goal: string | null; text: string }
export interface GuideReply { reply: string; proposals: GuideProposal[] }

export interface GuideRequest {
  horizon: Horizon
  labels: PeriodLabels
  goals: { ref: string; title: string }[]
  lines: { goal: string | null; horizon: Horizon; text: string; existing: boolean }[]
  focus: string | null
  turns: GuideTurn[]
}

/** The request, and the refs it used (ref → goal key), so a proposal maps back. */
export function guideRequest(draft: VoicePlanDraft, existing: ExistingPlan, labels: PeriodLabels, turns: GuideTurn[]): { request: GuideRequest; goalOf: Map<string, string> } {
  const d = reconcileDraft(draft, existing)
  const goals = activeGoals(d).slice(0, 12)
  const refOf = new Map(goals.map((g, i) => [g.id, `g${i + 1}`]))
  const goalOf = new Map(goals.map((g, i) => [`g${i + 1}`, g.id]))
  const ref = (id: string | null) => (id ? refOf.get(id) ?? null : null)
  const inSession = (id: string | null) => id === null || refOf.has(id)
  // Already on the plan: the session's goals' lines and the unlinked ones the
  // page shows under "Something else" — the same rows the page reads.
  const lines: GuideRequest['lines'] = [
    ...existing.items.filter((i) => inSession(i.goalId ?? null))
      .map((i) => ({ goal: ref(i.goalId ?? null), horizon: i.horizon as Horizon, text: i.title.slice(0, 140), existing: true })),
    ...(['season', 'month'] as const).flatMap((h) => d[h].filter((l) => inSession(l.goalId)).map((l) => ({ goal: ref(l.goalId), horizon: h as Horizon, text: l.text, existing: false }))),
    ...d.week.filter((w) => inSession(w.goalId)).map((w) => ({ goal: ref(w.goalId), horizon: 'week' as Horizon, text: w.text, existing: false })),
  ].slice(0, 60)
  const here = horizonOf(d.step)
  return {
    request: {
      horizon: here === 'review' ? 'week' : here,
      labels,
      goals: goals.map((g) => ({ ref: refOf.get(g.id)!, title: g.title.slice(0, 140) })),
      lines,
      focus: d.focus === FREE ? null : ref(d.focus),
      turns: turns.slice(-MAX_TURNS).map((t) => ({ role: t.role, text: t.text.slice(0, 600) })),
    },
    goalOf,
  }
}

/** What a reply was asked about: a reply for another horizon, session or
 *  set of visible goals is out of date and its proposals are not offered. */
export function guideSnapshot(draft: VoicePlanDraft, existing: ExistingPlan): string {
  return [draft.startAt, draft.periods.weekStart, draft.step, activeGoals(reconcileDraft(draft, existing)).map((g) => g.id).join(',')].join('|')
}

/** The draft action a proposal becomes when the person taps Add — only at
 *  the horizon it was asked about, for a goal it was told about. */
export function proposalAction(p: GuideProposal, goalOf: Map<string, string>, horizon: Horizon): FlowAction | null {
  if (!HORIZONS.includes(p.level) || p.level !== horizon) return null
  const goal = p.goal ? goalOf.get(p.goal) : undefined
  if (p.goal && !goal) return null
  if (p.level === 'year') return { type: 'addGoal', text: p.text }
  if (p.level === 'week') return { type: 'addWeek', text: p.text, goal: goal ?? FREE }
  return { type: 'answer', text: p.text, level: p.level, goal: goal ?? FREE }
}

export type AskGuide = (request: GuideRequest) => Promise<GuideReply>

/** The app's guide: the signed-in person's own token, the bounded endpoint. */
export const askGuide: AskGuide = async (request) => {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  if (!token) throw new Error('Sign in again to ask the guide.')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/planning-conversation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify(request),
  })
  const body = await res.json().catch(() => null) as (GuideReply & { error?: string }) | null
  if (!res.ok || !body || typeof body.reply !== 'string') throw new Error(body?.error ?? 'The guide could not answer just now.')
  return { reply: body.reply, proposals: Array.isArray(body.proposals) ? body.proposals : [] }
}
