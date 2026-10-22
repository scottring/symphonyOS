import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PanelSection } from '@/components/surface/sections/PanelSection'
import { useCanvasActivity } from '@/contexts/CanvasActivityContext'
import { useGoalChoices } from '@/hooks/useChoices'
import { useGoalLog } from '@/hooks/useGoalLog'
import { useLogWriters } from '@/hooks/useLogWriters'
import { useMemberName } from '@/hooks/useMemberName'
import { deleteEntryCommand, editEntryCommand, logEventCommand, type LogInput } from '@/lib/choices/logSave'
import type { GoalRef } from '@/types/choice'
import type { TaskContext } from '@/types/task'
import { LogDialog } from './LogDialog'
import { LogList } from './LogList'
import { linkButton } from './DialogFrame'

type Open = { kind: 'log' } | { kind: 'edit'; entryId: string } | null

/** The goal's log on its panel and year page: latest 3 done lines, Coming
 *  up, and "+ Log" (about the project unless a contractor is picked). */
export function GoalLogSection({ goal, goalContext, goalScope }: {
  goal: GoalRef
  goalContext: TaskContext | null
  goalScope: string
}) {
  const { run } = useCanvasActivity()
  const navigate = useNavigate()
  const w = useLogWriters()
  const memberName = useMemberName()
  const { log, entries } = useGoalLog(goal)
  const { rows } = useGoalChoices(goal)
  const [open, setOpen] = useState<Open>(null)

  // Every option for names; only open choices' options to log about.
  const optionNames = useMemo(() => new Map(rows.flatMap((r) => r.options.map((o) => [o.id, o.name] as const))), [rows])
  const openOptions = useMemo(() => rows.filter((r) => r.choice.status !== 'decided').flatMap((r) => r.options), [rows])
  const choices = openOptions.map((o) => ({ id: o.id, name: o.name }))
  const g = { goal, goalContext, goalScope }
  const go = (c: { label: string; command: () => Promise<boolean>; options: Parameters<typeof run>[2] }) => run(c.label, c.command, c.options)
  const entryOf = (id: string) => entries.find((e) => e.id === id)
  const close = () => setOpen(null)
  // Today as of now, so saving decides entry or plan the same way as the page.
  const now = new Date()
  const editing = open?.kind === 'edit' ? entryOf(open.entryId) : undefined

  return (
    <PanelSection
      id="log"
      label="Log"
      preview={log.done.length + log.upcoming.length > 0 ? `${log.done.length} done${log.upcoming.length ? ` · ${log.upcoming.length} coming up` : ''}` : undefined}
      actions={(collapsed) => !collapsed && (
        <button type="button" onClick={() => setOpen({ kind: 'log' })} className={linkButton}>+ Log</button>
      )}
    >
      <LogList log={log} optionNames={optionNames} memberName={memberName} limit={3}
        onEdit={(id) => setOpen({ kind: 'edit', entryId: id })}
        onDelete={async (id) => { const e = entryOf(id); return e ? go(deleteEntryCommand(w, e)) : false }}
        onOpenTask={(id) => navigate(`/today?detail=task:${id}`)} />
      {open?.kind === 'log' && (
        <LogDialog title="Log" options={choices} now={now} onCancel={close}
          onSave={(input: LogInput) => go(logEventCommand(w, g, openOptions.find((o) => o.id === input.optionId), input))} />
      )}
      {editing && (
        <LogDialog title="Log" options={choices} initial={editing} now={now} onCancel={close}
          onSave={(i) => go(editEntryCommand(w, editing, { kind: i.kind, on: i.on, time: i.time ?? null, summary: i.summary }))} />
      )}
    </PanelSection>
  )
}
