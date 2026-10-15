// Contract layer of the conversation bench (README.md). No model, no network:
// each scenario step's EXPECTED tool calls are replayed through the real
// server validators and the real client applier over an in-memory store, and
// the records, outcome state and forbidden changes are graded. It proves the
// plumbing can only yield the specified result; the live layer proves the
// model chooses it.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { changeSetFromInput, resolveRefs } from '../../supabase/functions/symphony-agent/changeSet.ts'
import { summarizeTurn, type TurnWrite } from '../../supabase/functions/symphony-agent/outcome.ts'
import { CANVAS_WRITE_TOOLS, IDEMPOTENT_CREATES, stableRowId } from '../../supabase/functions/symphony-agent/canvasEvents.ts'
import { applyChangeSet, plannedWeekStart, type ApplyDeps } from '@/lib/canvas/applyChangeSet'
import type { ChangeSet } from '@/lib/canvas/changeCard'
import type { Task } from '@/types/task'

interface StartTask { id: string; title: string; scheduledFor?: string; updatedAt: string }
interface Step {
  say?: string
  action?: 'approve' | 'retry' | 'undo-set'
  connection?: 'drop-after-commit'
  expect: {
    outcome: string[]
    tools?: { name: string; input: Record<string, unknown> }[]
    card?: { ops: number; allDay?: string[] }
    records?: { created?: string[]; dated?: Record<string, string>; untouched?: string[]; count?: Record<string, number>; absent?: string[]; present?: string[] }
  }
  forbid?: { tools?: string[]; records?: { created?: 'any'; duplicateTitles?: boolean } }
}
interface Scenario { id: string; title: string; today: string; weekStart: string; start: { members: { id: string; name: string }[]; tasks: StartTask[] }; steps: Step[] }

const dir = join(__dirname, 'scenarios')
const scenarios: Scenario[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))

/** The synthetic household's records, as the server reads them and the page holds them. */
class Store {
  tasks = new Map<string, Task>()
  private seq = 0
  constructor(start: StartTask[]) {
    for (const t of start) this.tasks.set(t.id, { id: t.id, title: t.title, completed: false, createdAt: new Date(t.updatedAt), updatedAt: new Date(t.updatedAt), bucket: t.scheduledFor ? 'timed' : 'week', scheduledFor: t.scheduledFor ? new Date(`${t.scheduledFor}T12:00:00`) : undefined } as Task)
  }
  serverRows() { return [...this.tasks.values()].map((t) => ({ id: t.id, title: t.title, updated_at: t.updatedAt.toISOString(), completed: t.completed })) }
  deps(weekStart: Date): ApplyDeps {
    return {
      tasks: [...this.tasks.values()],
      weekStart,
      updateTask: async (id, updates) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, ...updates, updatedAt: new Date() }); return true },
      addTask: async (title, when, options) => { const id = options && 'id' in options && typeof (options as { id?: unknown }).id === 'string' ? (options as { id: string }).id : `new-${++this.seq}`; this.tasks.set(id, { id, title, completed: false, createdAt: new Date(), updatedAt: new Date(), bucket: when ? 'timed' : 'week', scheduledFor: when, isAllDay: options?.isAllDay } as Task); return id },
      deleteTask: async (id) => { this.tasks.delete(id) },
      completeTask: async (id) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, completed: true }); return true },
      reopenTask: async (id) => { const t = this.tasks.get(id); if (!t) return false; this.tasks.set(id, { ...t, completed: false }); return true },
    }
  }
  titles() { return [...this.tasks.values()].map((t) => t.title) }
  byTitle(title: string) { return [...this.tasks.values()].filter((t) => t.title === title) }
}

const ymd = (d: Date | undefined) => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : undefined

for (const sc of scenarios) {
  describe(`bench ${sc.id}: ${sc.title}`, () => {
    it('every step yields exactly the specified outcome and records', async () => {
      const store = new Store(sc.start.tasks)
      const snapshotBefore = new Map([...store.tasks].map(([id, t]) => [id, JSON.stringify(t)]))
      const [y, m, d] = sc.weekStart.split('-').map(Number)
      const weekStart = new Date(y, m - 1, d)
      let card: ChangeSet | null = null
      let undoSet: (() => Promise<boolean>) | null = null
      const turnIds: string[] = []

      for (const [i, step] of sc.steps.entries()) {
        const at = `step ${i + 1}`
        const writes: TurnWrite[] = []
        let proposal: { key: string; title: string; ops: number } | undefined
        const forbidden = new Set(step.forbid?.tools ?? [])

        if (step.say) {
          const turnId = step.action === 'retry' ? turnIds.at(-1)! : crypto.randomUUID()
          turnIds.push(turnId)
          for (const call of step.expect.tools ?? []) {
            expect(forbidden.has(call.name), `${at}: ${call.name} is forbidden here`).toBe(false)
            if (call.name === 'symphony_propose_changes') {
              const parsed = changeSetFromInput(call.input, `${sc.id}:${i}`)
              expect('error' in parsed ? parsed.error : '', `${at}: propose must validate`).toBe('')
              if ('error' in parsed) throw new Error(parsed.error)
              const resolved = resolveRefs(parsed.set, store.serverRows(), sc.start.members)
              if ('error' in resolved) throw new Error(resolved.error)
              card = resolved.set
              proposal = { key: card.key, title: card.title, ops: card.ops.length }
            } else if (CANVAS_WRITE_TOOLS.has(call.name)) {
              // A direct write: the server's idempotent create, through the store.
              expect(IDEMPOTENT_CREATES.has(call.name), `${at}: ${call.name} must be retry-safe`).toBe(true)
              const id = (await stableRowId('user-synthetic', turnId, call.name, call.input))!
              const title = String(call.input.title)
              const when = typeof call.input.scheduled_for === 'string' ? new Date(`${call.input.scheduled_for}T12:00:00`) : undefined
              if (store.tasks.has(id)) writes.push({ name: call.name, ok: true, ids: [id] })
              else { await store.deps(weekStart).addTask(title, when, { id } as never); writes.push({ name: call.name, ok: true, ids: [id] }) }
            }
          }
          const ended = step.connection === 'drop-after-commit' ? 'error' : 'ok'
          const outcome = summarizeTurn(writes, proposal ? { proposal } : {}, ended)
          expect(step.expect.outcome, `${at}: outcome ${outcome.state}`).toContain(outcome.state)
          if (step.expect.card) {
            expect(card?.ops.length, `${at}: card ops`).toBe(step.expect.card.ops)
            for (const title of step.expect.card.allDay ?? []) {
              const op = card!.ops.find((o) => o.title === title)!
              expect(op.date && !op.time, `${at}: ${title} is an all-day commitment`).toBeTruthy()
            }
          }
        } else if (step.action === 'approve') {
          expect(card, `${at}: a card must be waiting`).not.toBeNull()
          const r = await applyChangeSet(card!, store.deps(plannedWeekStart(card!, new Date(`${sc.today}T12:00:00`), 0)))
          expect(r.ok, `${at}: approve`).toBe(true)
          if (!r.ok) throw new Error('approve failed')
          undoSet = r.undo
          card = null
          expect(step.expect.outcome).toContain(summarizeTurn(r.ids.map((id) => ({ name: 'approve', ok: true, ids: [id] })), {}, 'ok').state)
        } else if (step.action === 'retry') {
          // The same turn id → the same stable ids → no second row.
          const prev = sc.steps[i - 1]
          for (const call of prev.expect.tools ?? []) {
            const id = (await stableRowId('user-synthetic', turnIds.at(-1)!, call.name, call.input))!
            expect(store.tasks.has(id), `${at}: the committed row is recognised`).toBe(true)
            writes.push({ name: call.name, ok: true, ids: [id] })
          }
          expect(step.expect.outcome).toContain(summarizeTurn(writes, {}, 'ok').state)
        } else if (step.action === 'undo-set') {
          expect(undoSet, `${at}: an approved set to undo`).not.toBeNull()
          expect(await undoSet!(), `${at}: undo`).toBe(true)
        }

        // Records after the step.
        const rec = step.expect.records
        for (const title of rec?.created ?? []) expect(store.titles(), `${at}: created ${title}`).toContain(title)
        for (const [title, date] of Object.entries(rec?.dated ?? {})) expect(ymd(store.byTitle(title)[0]?.scheduledFor), `${at}: ${title} on ${date}`).toBe(date)
        for (const id of rec?.untouched ?? []) expect(JSON.stringify(store.tasks.get(id)), `${at}: ${id} untouched`).toBe(snapshotBefore.get(id))
        for (const [title, n] of Object.entries(rec?.count ?? {})) expect(store.byTitle(title).length, `${at}: exactly ${n} × ${title}`).toBe(n)
        for (const title of rec?.absent ?? []) expect(store.titles(), `${at}: ${title} gone`).not.toContain(title)
        for (const title of rec?.present ?? []) expect(store.titles(), `${at}: ${title} kept`).toContain(title)
        if (step.forbid?.records?.created === 'any') expect(store.tasks.size, `${at}: nothing created`).toBe(sc.start.tasks.length)
        if (step.forbid?.records?.duplicateTitles) expect(new Set(store.titles()).size, `${at}: no duplicate titles`).toBe(store.titles().length)
      }
    })
  })
}
