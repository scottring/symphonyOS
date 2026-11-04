// Tell the family (Planning the week): each line posted as its own note on
// the wall, exactly as written, until the week is over (its next start).
// Not knowing who wrote it does not stop the notes: they post unsigned.
// Shared by the Week page's "For the family this week" line.
import { addScratchpadNote, ownMemberId } from './addScratchpadNote'

/** The wall's longest note (addScratchpadNote keeps 500 characters). */
export const LONGEST_FAMILY_NOTE = 500

/** Posts each line; returns how many posted and the lines that did not. */
export async function postFamilyNotes(userId: string, lines: readonly string[], weekStart: Date): Promise<{ posted: number; left: string[] }> {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const author = await ownMemberId(userId).catch((e: unknown) => {
    console.error('[tell the family] could not tell who wrote it:', e)
    return null
  })
  const left: string[] = []
  let posted = 0
  for (const line of lines) {
    const ok = await addScratchpadNote(userId, line, 'note', author, end).catch(() => false)
    if (ok) posted++
    else left.push(line)
  }
  return { posted, left }
}
