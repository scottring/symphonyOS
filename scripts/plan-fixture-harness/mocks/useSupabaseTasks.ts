export * from '@real/hooks/useSupabaseTasks'
import { useSyncExternalStore } from 'react'
import { TASKS } from './fixtures'
import type { Task } from '@/types/task'
let store: Task[] = TASKS
const subs = new Set<() => void>()
const set = (f: (t: Task[]) => Task[]) => { store = f(store); subs.forEach((s) => s()) }
const delay = () => new Promise((r) => setTimeout(r, 400))
// The commitment a new row gets, as the database's mirror trigger writes it:
// the period its bucket names (week / month / quarter=season), none for a
// row with no period (2026-10-08 review: every add got a WEEK commitment, so
// a Month add vanished from the month).
function commitmentsFor(o: Partial<Task>): Task['commitments'] {
  if (o.bucket === 'week' && o.weekStart) return [{ level: 'week', periodStart: o.weekStart, status: 'open' }]
  if (o.bucket === 'month' && o.monthStart) return [{ level: 'month', periodStart: o.monthStart, status: 'open' }]
  if (o.bucket === 'quarter' && o.seasonStart) return [{ level: 'season', periodStart: o.seasonStart, status: 'open' }]
  return []
}
export function useSupabaseTasks() {
  const tasks = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => store)
  return {
    tasks, loading: false, error: null, userId: 'me', refetch: async () => {},
    addTask: async (title: string, _c: unknown, _p: unknown, scheduledFor: Date | undefined, o: Partial<Task>) => {
      await delay()
      const id = 'n' + Math.random().toString(36).slice(2, 7)
      set((t) => [...t, { id, title, completed: false, createdAt: new Date(), assignedTo: 'me', ...o, scheduledFor, commitments: commitmentsFor(o) } as Task])
      return id
    },
    updateTask: async (id: string, u: Partial<Task>) => { await delay(); set((t) => t.map((x) => (x.id === id ? { ...x, ...u } : x))); return true },
    toggleTask: async (id: string) => { set((t) => t.map((x) => (x.id === id ? { ...x, completed: !x.completed } : x))); return true },
    pushTask: async () => true, updateTasksBulk: async () => true, keepForward: async (id: string) => id, dropCommitment: async () => true, deleteTask: async () => true,
  }
}
