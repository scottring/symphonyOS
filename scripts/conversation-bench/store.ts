import type { Task } from '@/types/task'
import type { Routine } from '@/types/actionable'
import type { Goal } from '@/types/goal'
import type { ApplyDeps } from '@/lib/canvas/applyChangeSet'
import { DEFAULT_SEASONS } from '../../supabase/functions/symphony-agent/readPlan'
export interface StartTask { id: string; title: string; scheduledFor?: string; updatedAt: string }
export interface StartRoutine { id: string; name: string; days: string[]; time: string; updatedAt: string }
export interface StartGoal { id: string; name: string; year: number; status: 'active' | 'completed' | 'archived'; updatedAt: string }

/** The synthetic household's records, as the server reads them and the page holds them. */
export class Store {
  tasks = new Map<string, Task>()
  routines = new Map<string, Routine>()
  /** Skipped occurrences: "routineId|YYYY-MM-DD". */
  skipped = new Set<string>()
  occurrences = new Map<string, { id: string; date: string | null; assignee: string | null }>()
  private seq = 0
  goals = new Map<string, Goal>()
  constructor(start: StartTask[], routines: StartRoutine[] = [], goals: StartGoal[] = []) {
    for (const g of goals) this.goals.set(g.id, { id: g.id, name: g.name, year: g.year, status: g.status, updatedAt: new Date(g.updatedAt), createdAt: new Date(g.updatedAt) } as unknown as Goal)
    for (const t of start) this.tasks.set(t.id, { id: t.id, title: t.title, completed: false, createdAt: new Date(t.updatedAt), updatedAt: new Date(t.updatedAt), bucket: t.scheduledFor ? 'timed' : 'week', scheduledFor: t.scheduledFor ? new Date(`${t.scheduledFor}T12:00:00`) : undefined } as Task)
    for (const r of routines) this.routines.set(r.id, { id: r.id, name: r.name, user_id: 'u', assigned_to: null, assigned_to_all: null, visibility: 'active', paused_until: null, recurrence_pattern: { type: 'weekly', days: [...r.days], interval: 1 }, time_of_day: `${r.time}:00`, created_at: r.updatedAt, updated_at: r.updatedAt } as unknown as Routine)
  }
  serverRows() { return [...this.tasks.values()].map((t) => ({ id: t.id, title: t.title, updated_at: t.updatedAt.toISOString(), completed: t.completed })) }
  serverRoutines() { return [...this.routines.values()].map((r) => ({ id: r.id, name: r.name, updated_at: r.updated_at, parent_routine_id: null })) }
  planRefs(today: string) { return { tasks: [], goals: [...this.goals.values()].map((g) => ({ id: g.id, name: g.name, updated_at: g.updatedAt.toISOString(), status: g.status, year: g.year })), seasons: DEFAULT_SEASONS, today } }
  goalsByName(name: string) { return [...this.goals.values()].filter((g) => g.name === name) }
  ruleOf(id: string) { const r = this.routines.get(id)!; return { days: (r.recurrence_pattern as { days?: string[] }).days ?? [], time: r.time_of_day ?? '' } }
  deps(weekStart: Date): ApplyDeps {
    return {
      tasks: [...this.tasks.values()],
      latest: () => ({ tasks: [...this.tasks.values()], routines: [...this.routines.values()] }),
      weekStart,
      updateTask: async (id, updates) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, ...updates, updatedAt: new Date() }); return true },
      addTask: async (title, when, options) => { const id = options && 'id' in options && typeof (options as { id?: unknown }).id === 'string' ? (options as { id: string }).id : `new-${++this.seq}`; this.tasks.set(id, { id, title, completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: when ? 'timed' : 'week', scheduledFor: when, isAllDay: options?.isAllDay } as Task); return id },
      deleteTask: async (id) => { this.tasks.delete(id) },
      completeTask: async (id) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, completed: true }); return true },
      reopenTask: async (id) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, completed: false }); return true },
      routines: [...this.routines.values()],
      updateRoutine: async (id, input) => { const r = this.routines.get(id); if (!r) return false; this.routines.set(id, { ...r, ...input, updated_at: new Date().toISOString() } as Routine); return true },
      addRoutine: async (input) => { const id = `r-new-${++this.seq}`; this.routines.set(id, { id, ...input, updated_at: new Date().toISOString() } as unknown as Routine); return id },
      deleteRoutine: async (id) => { this.routines.delete(id) },
      skipOccurrence: async (id, date) => { this.skipped.add(`${id}|${ymd(date)}`); return true },
      undoSkip: async (id, date) => { this.skipped.delete(`${id}|${ymd(date)}`); return true },
      moveOccurrence: async (id, from, to) => {
        const key=`${id}|${ymd(from)}`, previous=this.occurrences.get(key)
        this.occurrences.set(key,{id:key,date:ymd(to)!,assignee:previous?.assignee??null})
        return {instanceId:key,previousStatus:'pending',previousDeferredTo:previous?.date??null,previousPlannedOn:null}
      },
      undoMove: async moved => { if(moved.previousDeferredTo)this.occurrences.set(moved.instanceId,{id:moved.instanceId,date:moved.previousDeferredTo,assignee:null});else this.occurrences.delete(moved.instanceId);return true },
      setOccurrenceAssignee: async (id, day, assignee) => {
        const key=`${id}|${ymd(day)}`, previous=this.occurrences.get(key)
        if(assignee===null && !previous?.date)this.occurrences.delete(key)
        else this.occurrences.set(key,{id:key,date:previous?.date??null,assignee})
        return {instanceId:key,previous:previous?.assignee??null}
      },
      goals: [...this.goals.values()],
      addGoal: async (name, opts) => { const id = `g-new-${++this.seq}`; this.goals.set(id, { id, name, year: opts.year, status: 'active', carriedFrom: opts.carriedFrom, updatedAt: new Date(), createdAt: new Date() } as unknown as Goal); return id },
      updateGoal: async (id, updates) => { const g = this.goals.get(id); if (!g) return false; this.goals.set(id, { ...g, ...updates, updatedAt: new Date() } as Goal); return true },
      deleteGoal: async (id) => { this.goals.delete(id) },
      keepForward: async () => undefined,
      dropCommitment: async () => false,
    }
  }
  titles() { return [...this.tasks.values()].map((t) => t.title) }
  byTitle(title: string) { return [...this.tasks.values()].filter((t) => t.title === title) }
}

export const ymd = (d: Date | undefined) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined

