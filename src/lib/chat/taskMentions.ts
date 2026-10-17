// src/lib/chat/taskMentions.ts
//
// Which of the person's tasks a line of Symphony's reply names, so the line
// can carry the task's own actions (Done, Today, Open) in the conversation.
// Routines are named the same way, by their name.
// A list line names a task when it is the task's title, or the title followed
// by a note ("Pick up the kids — early release"). Anything less certain names
// nothing: Done on the wrong task is worse than no button.

import type { Task } from '@/types/task'

/** Shorter titles ("Gym") are too likely to be a word in a sentence. */
const MIN_TITLE = 4

export function normalizeMention(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*\[[ x]\]\s*/, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '')
    .trim()
}

/** After the title, a note may follow: " — …", " - …", ": …", " (…", ", …". */
const NOTE_AFTER = /^\s*([—–:(,;]|-\s)/

/** The one task a list line names, or null when none (or more than one) does. */
export function matchTaskMention(line: string, tasks: Task[]): Task | null {
  return matchMention(line, tasks, (t) => t.title, (t) => !t.completed)
}

/** The one item a list line names by its title. Between items of the same
 *  title the open one is meant; two open ones is a guess, so none. */
export function matchMention<T>(line: string, items: readonly T[], titleOf: (item: T) => string | null | undefined, isOpen: (item: T) => boolean = () => true): T | null {
  const said = normalizeMention(line)
  if (said.length < MIN_TITLE) return null
  let best: T[] = []
  let bestLength = 0
  for (const item of items) {
    const title = normalizeMention(titleOf(item) ?? '')
    if (title.length < MIN_TITLE || title.length < bestLength) continue
    const named = said === title || (said.startsWith(title) && NOTE_AFTER.test(said.slice(title.length)))
    if (!named) continue
    if (title.length > bestLength) { best = [item]; bestLength = title.length } else best.push(item)
  }
  const open = best.filter(isOpen)
  if (open.length === 1) return open[0]
  if (open.length === 0 && best.length === 1) return best[0]
  return null
}

export interface ListLine {
  /** The whole line as written. */
  line: string
  /** The marker ("- ", "• ", "2. ") as written, kept when the line is drawn. */
  marker: string
  /** The words after the marker. */
  text: string
}

/** A reply split into lines, each list line with its marker apart. */
export function splitListLines(content: string): (ListLine | { line: string })[] {
  return content.split('\n').map((line) => {
    const m = line.match(/^(\s*(?:[-•*]|\d{1,2}[.)])\s+)(.+)$/)
    return m ? { line, marker: m[1], text: m[2] } : { line }
  })
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Already on today's page, so "Today" would do nothing. */
export function isPlannedToday(task: Task, now = new Date()): boolean {
  return !!task.scheduledFor && startOfDay(task.scheduledFor).getTime() === startOfDay(now).getTime()
}
