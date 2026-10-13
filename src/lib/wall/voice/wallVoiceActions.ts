// What a sentence to the wall saves, each with its own Undo (Scott,
// 2026-10-13: kids may talk to the wall too; a silly capture saves and is
// undone, nothing waits for a grown-up). Runs as the signed-in wall user
// under RLS — never a service role — in the household shape every wall
// capture uses (context family, household scope), so the rest of the family
// sees it.

import { supabase } from '@/lib/supabase'
import { scopeForDomain } from '@/lib/scope'

export interface VoiceSave {
  /** What the wall says and shows: "Added milk and eggs to Groceries." */
  said: string
  /** Takes the save back; false if it could not. */
  undo?: () => Promise<boolean>
}

type Db = Pick<typeof supabase, 'from'>

const list = (items: string[]) => items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`

const removeRows = (db: Db, table: string, ids: string[]) => async () => {
  if (!ids.length) return true
  const { error } = await db.from(table).delete().in('id', ids)
  if (error) console.error(`[wall-voice] undo on ${table} failed:`, error.message)
  return !error
}

/** New lines on the family grocery list; ones already open are skipped. */
export async function addGroceries(listId: string, listTitle: string, userId: string, items: string[], db: Db = supabase): Promise<VoiceSave> {
  const { data: open, error: readErr } = await db.from('list_items').select('text').eq('list_id', listId).eq('completed', false)
  if (readErr) return { said: 'Couldn’t reach the grocery list. Try again.' }
  const have = new Set(((open ?? []) as { text: string | null }[]).map((r) => (r.text ?? '').trim().toLowerCase()))
  const fresh = items.filter((i) => !have.has(i.trim().toLowerCase()))
  const already = items.filter((i) => have.has(i.trim().toLowerCase()))
  if (!fresh.length) return { said: `${list(already)} ${already.length === 1 ? 'is' : 'are'} already on ${listTitle}.` }
  const { data, error } = await db.from('list_items')
    .insert(fresh.map((text, i) => ({ list_id: listId, user_id: userId, text, sort_order: 10_000 + i, completed: false })))
    .select('id')
  if (error) return { said: 'Couldn’t save that to the grocery list. Try again.' }
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  const also = already.length ? ` ${list(already)} ${already.length === 1 ? 'was' : 'were'} already there.` : ''
  return { said: `Added ${list(fresh)} to ${listTitle}.${also}`, undo: removeRows(db, 'list_items', ids) }
}

/** A note or a thing to talk about on the scratchpad. Spoken: no author. */
export async function addScratch(userId: string, body: string, kind: 'note' | 'talk', db: Db = supabase): Promise<VoiceSave> {
  const { data, error } = await db.from('scratchpad_notes')
    .insert({ user_id: userId, body: body.trim().slice(0, 500), kind, author_member_id: null })
    .select('id').single()
  if (error || !data) return { said: 'Couldn’t save that to the scratchpad. Try again.' }
  return {
    said: kind === 'talk' ? `Added “${body}” to talk about.` : 'Added a note to the scratchpad.',
    undo: removeRows(db, 'scratchpad_notes', [(data as { id: string }).id]),
  }
}

/** A family task in the Inbox, for whoever sorts it next. */
export async function addInboxTask(userId: string, title: string, db: Db = supabase): Promise<VoiceSave> {
  const { data, error } = await db.from('tasks').insert({
    user_id: userId,
    title: title.trim().slice(0, 300),
    context: 'family',
    scope: scopeForDomain('family', [], null),
    bucket: 'inbox',
    scheduled_for: null,
    completed: false,
  }).select('id').single()
  if (error || !data) return { said: 'Couldn’t save that to the Inbox. Try again.' }
  return { said: `Saved to the Inbox: ${title}.`, undo: removeRows(db, 'tasks', [(data as { id: string }).id]) }
}

/** A reply as natural speech (wall-say): base64 wav, or null — the
 *  listener's offline voice speaks instead. */
export async function speechFor(text: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('wall-say', { body: { text } })
  const wav = (data as { wav?: string } | null)?.wav
  if (error || !wav) { console.warn('[wall-voice] natural voice unavailable:', error?.message); return null }
  return wav
}

/** A spoken question, answered from what the wall shows (wall-ask). */
export async function askWall(question: string, snapshot: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('wall-ask', { body: { question, snapshot } })
  const answer = (data as { answer?: string } | null)?.answer
  if (error || !answer) {
    console.error('[wall-voice] ask failed:', error?.message ?? data)
    return 'Sorry, I couldn’t answer that just now.'
  }
  return answer
}
