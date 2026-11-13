// src/lib/today/sourceMark.ts
//
// Where a task came from, as a small lettered mark on its row in Today's To do
// (Scott, 2026-11-13: "logos"; no logo images yet, so a letter on a colour).
// Two sources, both from the data: a task made from an email names its sender
// in its notes ("From Oak Hill School · …", extract-email's sourceNote), and
// an Amazon task says Amazon in its title. Nothing else gets a mark.
import type { Task } from '@/types/task'
// The Amazon mark (homarr-labs/dashboard-icons, svg/amazon.svg, 2026-11-13).
import amazonMark from '@/assets/marks/amazon.svg'

export interface SourceMark { letter: string; label: string; color: string; /** A real logo, where we have one. */ image?: string }

const AMAZON: SourceMark = { letter: 'a', label: 'Amazon', color: '#ffffff', image: amazonMark }
const MUTED = ['hsl(205 45% 32%)', 'hsl(150 34% 28%)', 'hsl(330 35% 36%)', 'hsl(28 55% 34%)', 'hsl(262 30% 38%)']

export function sourceMark(task: Pick<Task, 'title' | 'notes' | 'captureId'>): SourceMark | null {
  if (/\bamazon\b/i.test(task.title)) return AMAZON
  const from = task.captureId ? /^From (.+?) · /.exec(task.notes ?? '') : null
  const label = from?.[1]?.trim()
  if (!label) return null
  let h = 0
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return { letter: label[0].toUpperCase(), label, color: MUTED[h % MUTED.length] }
}
