// Tell the family (Planning the week): each line posted as its own note on
// the wall, exactly as written, until the week is over (its next start).
// Not knowing who wrote it does not stop the notes: they post unsigned.
// Shared by the Week page's "For the family this week" line.
import { addScratchpadNote, deleteScratchpadNote, ownMemberId } from './addScratchpadNote'

/** The wall's longest note (addScratchpadNote keeps 500 characters). */
export const LONGEST_FAMILY_NOTE = 500

/** Posts each line; returns the notes that posted (their ids, for Undo)
 *  and the lines that did not. */
export async function postFamilyNotes(userId: string, lines: readonly string[], weekStart: Date): Promise<{ posted: { id: string; line: string }[]; left: string[] }> {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const author = await ownMemberId(userId).catch((e: unknown) => {
    console.error('[tell the family] could not tell who wrote it:', e)
    return null
  })
  const left: string[] = []
  const posted: { id: string; line: string }[] = []
  for (const line of lines) {
    const id = crypto.randomUUID()
    const ok = await addScratchpadNote(userId, line, 'note', author, end, id).catch(() => false)
    if (ok) posted.push({ id, line })
    else left.push(line)
  }
  return { posted, left }
}

/** Undo: the note off the wall again. */
export const takeBackFamilyNote = (id: string) => deleteScratchpadNote(id).catch(() => false)
