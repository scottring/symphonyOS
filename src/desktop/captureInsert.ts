// Minimal inbox insert for the Mac shell's quick-capture window. Mirrors the
// inbox-add shape of useSupabaseTasks.addTask (bucket 'inbox', category 'task',
// scope from area) without mounting that hook — the capture window idles for
// days and must not hold a task fetch or realtime subscription.
import { supabase } from '@/lib/supabase'
import { defaultScopeForArea } from '@/lib/scope'

export async function insertInboxTask(userId: string, title: string): Promise<boolean> {
  const { error } = await supabase.from('tasks').insert({
    user_id: userId,
    title,
    completed: false,
    bucket: 'inbox',
    scheduled_for: null,
    category: 'task',
    context: null,
    scope: defaultScopeForArea(null),
  })
  return !error
}
