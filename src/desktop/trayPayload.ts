// What the Mac shell's menu-bar extra shows. Emitted to Rust as the
// `shell:tray-update` event payload — the shape is deserialized by serde in
// desktop/src-tauri/src/lib.rs, so keep the two in sync.
import type { Task } from '@/types/task'
import { selectTimed, selectOverdue } from '@/lib/today/taskPools'

export interface TrayPayload {
  remaining: number
  items: Array<{ id: string; title: string }>
}

const MAX_ITEMS = 8
const matchAll = () => true

export function buildTrayPayload(tasks: Task[], now: Date): TrayPayload {
  const todayRemaining = selectTimed(tasks, now, matchAll).filter((t) => !t.completed)
  const overdueRemaining = selectOverdue(tasks, true, matchAll, now).filter((t) => !t.completed)
  const all = [...overdueRemaining, ...todayRemaining]
  return {
    remaining: all.length,
    items: all.slice(0, MAX_ITEMS).map((t) => ({ id: t.id, title: t.title })),
  }
}
