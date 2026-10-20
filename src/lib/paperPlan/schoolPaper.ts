// A school paper photographed on the phone (spec 2026-10-20-school-papers-on-
// the-wall-design.md). The photo is read on the server (plan-from-paper,
// action read-paper); this file decides whether it is a paper already on the
// wall, and saves it — claimed by whoever took the photo, since they hold it.
import { attachFile } from '@/lib/taskAttachments'
import { supabase } from '@/lib/supabase'
import { rowToTask, TASK_COLUMNS } from '@/hooks/useWallData'
import { itemsMatch, normaliseTitle, scopeFor } from '../../../supabase/functions/extract-email/lib/plan.ts'
import { nextSchoolDay } from '../../../supabase/functions/school-digest/lib/homework.ts'
import type { Task } from '@/types/task'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Words every school paper shares; a match on these alone is no match. */
const GENERIC = new Set(['form', 'forms', 'slip', 'slips', 'paper', 'sheet', 'return', 'the', 'a', 'an', 'of', 'for', 'and', 'to'])
const sharesAWord = (a: string, b: string) => {
  const A = new Set(normaliseTitle(a).split(' ').filter((w) => w && !GENERIC.has(w)))
  return normaliseTitle(b).split(' ').some((w) => A.has(w))
}

/** The kid's open, not-yet-found paper this photo most likely is: the same
 *  name, or the same due date with at least one shared word (many papers are
 *  due Friday). Null when none fits — then it is a new paper. */
export function matchOpenPaper(read: { title: string; due?: string }, open: Task[], kidId: string): Task | null {
  const candidates = open.filter((t) => t.category === 'paper' && t.assignedTo === kidId && !t.completed && !t.heldBy && !t.dismissedAt)
  return candidates.find((t) => itemsMatch(t.title, read.title))
    ?? (read.due ? candidates.find((t) => t.neededOn && ymd(t.neededOn) === read.due && sharesAWord(t.title, read.title)) : undefined)
    ?? null
}

interface PaperWriteDb {
  from: (table: 'tasks') => {
    update: (patch: Record<string, unknown>) => { eq: (column: 'id', id: string) => PromiseLike<{ error: unknown }> }
    insert: (rows: Record<string, unknown>[]) => { select: (columns: 'id') => PromiseLike<{ data: { id: string }[] | null; error: unknown }> }
  }
}

export interface SchoolPaperSave {
  userId: string
  kidIds: string[]
  title: string
  /** YYYY-MM-DD; undated papers are due the next school day, as the digest's are. */
  due?: string
  notes: string
  holderId: string
  photo: Blob
  /** The paper already on the wall that this photo is; it gets claimed instead. */
  existing?: Task
  /** YYYY-MM-DD, the phone's local day. */
  today: string
}

/** `saved` once the paper is on the wall — even if the photo then failed to
 *  attach, so the card never offers a Save that would add it a second time. */
export interface SchoolPaperSaved { saved: boolean; photoAttached: boolean }

export async function saveSchoolPaper(db: PaperWriteDb, s: SchoolPaperSave): Promise<SchoolPaperSaved> {
  const name = `paper-${s.today}.jpg`
  if (s.existing) {
    const { error } = await db.from('tasks').update({ held_by: s.holderId }).eq('id', s.existing.id)
    if (error) return { saved: false, photoAttached: false }
    return { saved: true, photoAttached: !!(await attachFile('task', s.existing.id, s.photo, name)) }
  }
  const due = s.due && s.due >= s.today ? s.due : nextSchoolDay(s.today)
  const rows = s.kidIds.map((kid) => ({
    user_id: s.userId,
    title: s.title,
    completed: false,
    bucket: 'timed',
    context: 'family',
    scope: scopeFor('family', [kid], null),
    category: 'paper',
    // All day, at noon UTC: the same calendar day in every US zone (as the digest writes).
    scheduled_for: `${due}T12:00:00.000Z`,
    is_all_day: true,
    needed_on: due,
    notes: s.notes,
    assigned_to: kid,
    assigned_to_all: null,
    held_by: s.holderId,
  }))
  const { data, error } = await db.from('tasks').insert(rows).select('id')
  if (error || !data) return { saved: false, photoAttached: false }
  const attached = await Promise.all(data.map((r) => attachFile('task', r.id, s.photo, name)))
  return { saved: true, photoAttached: attached.every(Boolean) }
}

/** The household's open, unclaimed papers, to match a photo against. */
export async function loadOpenPapers(): Promise<Task[]> {
  const { data } = await supabase.from('tasks').select(TASK_COLUMNS)
    .eq('category', 'paper').eq('completed', false).is('dismissed_at', null).is('held_by', null)
  return (data ?? []).map(rowToTask)
}

/** Upload the photo where the paper reader may open it; returns its path. */
export async function uploadPaperPhoto(userId: string, photo: Blob): Promise<string | null> {
  const path = `${userId}/paper-plan/${crypto.randomUUID()}/photo-1.jpg`
  const { error } = await supabase.storage.from('attachments').upload(path, photo, { contentType: 'image/jpeg', upsert: true })
  return error ? null : path
}
