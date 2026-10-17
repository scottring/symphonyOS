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
import type { Routine } from '@/types/actionable'
import type { Goal } from '@/types/goal'
import { DEFAULT_SEASONS } from '../../supabase/functions/symphony-agent/readPlan.ts'

interface Step {
  say?: string
  action?: 'approve' | 'retry' | 'undo-set'
  connection?: 'drop-after-commit'
  expect: {
    outcome: string[]
    tools?: { name: string; input: Record<string, unknown> }[]
    card?: { ops: number; allDay?: string[] }
    records?: { created?: string[]; dated?: Record<string, string>; untouched?: string[]; count?: Record<string, number>; absent?: string[]; present?: string[] }
    routines?: { unchanged?: string[]; skipped?: [string, string][]; rule?: Record<string, { days: string[]; time: string }> }
    goals?: { unchanged?: string[]; status?: Record<string, string>; present?: string[]; absent?: string[]; carriedCopies?: Record<string, number | null> }
  }
  forbid?: { tools?: string[]; records?: { created?: 'any'; duplicateTitles?: boolean } }
}
interface Scenario { id: string; title: string; today: string; weekStart: string; start: { members: { id: string; name: string }[]; tasks: StartTask[]; routines?: StartRoutine[]; yearGoals?: StartGoal[] }; steps: Step[] }

import { Store, ymd, type StartTask, type StartRoutine, type StartGoal } from './store'

const dir = join(__dirname, 'scenarios')
const scenarios: Scenario[] = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))


for (const sc of scenarios) {
  describe(`bench ${sc.id}: ${sc.title}`, () => {
    it('every step yields exactly the specified outcome and records', async () => {
      const store = new Store(sc.start.tasks, sc.start.routines, sc.start.yearGoals)
      const goalsBefore = new Map([...store.goals].map(([id, g]) => [id, JSON.stringify(g)]))
      const snapshotBefore = new Map([...store.tasks].map(([id, t]) => [id, JSON.stringify(t)]))
      const routinesBefore = new Map([...store.routines].map(([id, r]) => [id, JSON.stringify(r)]))
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
              const resolved = resolveRefs(parsed.set, store.serverRows(), sc.start.members, store.serverRoutines(), store.planRefs(sc.today))
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
        const ro = step.expect.routines
        for (const id of ro?.unchanged ?? []) expect(JSON.stringify(store.routines.get(id)), `${at}: routine ${id} untouched`).toBe(routinesBefore.get(id))
        for (const [id, date] of ro?.skipped ?? []) expect(store.skipped.has(`${id}|${date}`), `${at}: ${id} skipped on ${date}`).toBe(true)
        for (const [id, rule] of Object.entries(ro?.rule ?? {})) expect(store.ruleOf(id), `${at}: ${id} rule`).toEqual(rule)
        const go = step.expect.goals
        for (const id of go?.unchanged ?? []) expect(JSON.stringify(store.goals.get(id)), `${at}: goal ${id} untouched`).toBe(goalsBefore.get(id))
        for (const [id, status] of Object.entries(go?.status ?? {})) expect(store.goals.get(id)?.status, `${at}: goal ${id} status`).toBe(status)
        for (const name of go?.present ?? []) expect(store.goalsByName(name).length, `${at}: goal ${name} present`).toBeGreaterThan(0)
        for (const name of go?.absent ?? []) expect(store.goalsByName(name).length, `${at}: goal ${name} absent`).toBe(0)
        for (const [name, year] of Object.entries(go?.carriedCopies ?? {})) {
          const copies = store.goalsByName(name).filter((g) => (g as unknown as { carriedFrom?: string }).carriedFrom)
          if (year === null) expect(copies.length, `${at}: no carried copy of ${name}`).toBe(0)
          else expect(copies.map((g) => g.year), `${at}: ${name} carried to ${year}`).toEqual([year])
        }
      }
    })
  })
}
