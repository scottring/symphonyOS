import { supabase } from '@/lib/supabase'
import type { Task } from '@/types/task'

/**
 * Fold an AI-enriched photo capture into its suggested destination task:
 * repoint the photo attachment, append the extracted note to the target's
 * notes, and delete the capture item. The attachment repoint runs first (it
 * needs the network); if it fails the capture is left untouched so the chip
 * can simply be tapped again. Mirrors PhotoCaptureService.merge on iOS.
 */
export async function mergeCaptureIntoTask(
  capture: Task,
  target: Task,
  deps: {
    updateTask: (id: string, updates: Partial<Task>) => Promise<void | boolean> | void
    deleteTask: (id: string) => Promise<void> | void
  },
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('attachments')
      .update({ entity_id: target.id })
      .eq('entity_id', capture.id)
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error('Capture merge: attachment repoint failed:', err)
    return false
  }

  const merged = [target.notes, capture.notes]
    .map((n) => n?.trim())
    .filter((n): n is string => !!n)
    .join('\n\n')
  await deps.updateTask(target.id, { notes: merged || undefined })
  await deps.deleteTask(capture.id)
  return true
}
