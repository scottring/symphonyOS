// Writes an approved plan. Insert-only: ON CONFLICT (id) DO NOTHING, so a
// retry after a partial failure fills in what is missing and leaves every row
// that already landed exactly as it is. (Not a partial upsert — nothing is
// ever updated here.) Tables go in reference order: goals before the tasks
// that point at them, notes before the attachments filed on them.
import { supabase } from '@/lib/supabase'
import type { SavePlanRows } from './savePlan'

const ORDER = ['goals', 'tasks', 'routines', 'notes', 'attachments'] as const

export class SavePlanError extends Error {
  readonly table: string
  constructor(table: string, message: string) {
    super(message)
    this.name = 'SavePlanError'
    this.table = table
  }
}

export async function writePlanRows(rows: SavePlanRows): Promise<void> {
  for (const table of ORDER) {
    const batch = rows[table]
    if (!batch.length) continue
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new SavePlanError(table, error.message)
  }
}
