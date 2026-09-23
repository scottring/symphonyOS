// What the reader is told the household already has, built from the rows the
// signed-in user can already see (RLS-filtered reads in the app's own hooks).
// The function reads nothing server-side; this is prompt text only.
import type { PlanContext } from '../../../supabase/functions/plan-from-paper/lib/plan'
import { localYmd } from '@/lib/cadence/config'
import { seasonEndFor, seasonLabel, seasonStartFor, type Seasons } from '@/lib/cadence/seasons'

interface TaskLike { id: string; title: string; completed?: boolean; bucket?: string; isGoal?: boolean; monthStart?: Date; seasonStart?: Date }
interface GoalLike { id: string; name: string; year?: number; status?: string }
interface RoutineLike { id: string; name: string; visibility?: string }
interface MemberLike { id: string; name: string; role_label?: string | null }

const dayBefore = (d: Date) => { const x = new Date(d); x.setDate(x.getDate() - 1); return x }

export function buildPlanContext(input: {
  today: Date
  seasons: Seasons
  tasks: TaskLike[]
  goals: GoalLike[]
  routines: RoutineLike[]
  members: MemberLike[]
}): PlanContext {
  const { today, seasons } = input
  const year = today.getFullYear()
  // This season and the next: a page planned in late August is for Fall.
  const thisStart = seasonStartFor(today, seasons)
  const nextStart = seasonEndFor(today, seasons)
  const seasonRows = [thisStart, nextStart].map((start) => ({
    label: seasonLabel(start, seasons),
    start: localYmd(start),
    end: localYmd(dayBefore(seasonEndFor(start, seasons))),
  }))
  const open = input.tasks.filter((t) => !t.completed)
  return {
    today: localYmd(today),
    year,
    seasons: seasonRows,
    members: input.members.map((m) => ({ id: m.id, name: m.name, role: m.role_label ?? null })),
    yearGoals: input.goals.filter((g) => (g.year ?? year) === year && g.status !== 'archived' && g.status !== 'completed').map((g) => ({ id: g.id, title: g.name })),
    periodGoals: open.filter((t) => t.isGoal && (t.bucket === 'month' || t.bucket === 'quarter')).map((t) => ({
      id: t.id,
      title: t.title,
      level: t.bucket === 'month' ? 'month' as const : 'season' as const,
      start: t.bucket === 'month' ? (t.monthStart ? localYmd(t.monthStart) : '') : (t.seasonStart ? localYmd(t.seasonStart) : ''),
    })),
    openTasks: open.filter((t) => !t.isGoal).map((t) => ({ id: t.id, title: t.title, placement: t.bucket === 'quarter' ? 'season' : t.bucket ?? 'inbox' })),
    routines: input.routines.map((r) => ({ id: r.id, title: r.name })),
  }
}
