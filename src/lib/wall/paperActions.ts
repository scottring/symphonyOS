// The three things a person does to a school paper at the wall (spec
// 2026-10-20-school-papers-on-the-wall-design.md), each one update on the
// paper's own row. True when it saved.

interface PaperDb {
  from: (table: 'tasks') => {
    update: (patch: Record<string, unknown>) => {
      eq: (column: 'id', id: string) => PromiseLike<{ error: unknown }>
    }
  }
}

async function patch(db: PaperDb, taskId: string, values: Record<string, unknown>): Promise<boolean> {
  const { error } = await db.from('tasks').update(values).eq('id', taskId)
  return !error
}

/** "I have it": the parent who picked the paper up. */
export const claimPaper = (db: PaperDb, taskId: string, memberId: string) => patch(db, taskId, { held_by: memberId })

/** "In backpack": done. It stays struck through on the wall until tomorrow. */
export const paperInBackpack = (db: PaperDb, taskId: string, now: Date) =>
  patch(db, taskId, { completed: true, completed_at: now.toISOString() })

/** "Not ours": kept, never shown, and the digest won't add it back. */
export const paperNotOurs = (db: PaperDb, taskId: string, now: Date) => patch(db, taskId, { dismissed_at: now.toISOString() })
