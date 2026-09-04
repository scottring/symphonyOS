/**
 * Demo Data Seed
 *
 * Sets up a clean demo environment for Alex Chen persona:
 * - Family contacts (Michael, Jane, Iris)
 * - Kitchen Renovation project with rich context
 * - Sample completed tasks to show history
 *
 * Can be reset/reloaded via Settings page
 */

import { supabase, getAuthUser } from './supabase'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { Task } from '@/types/task'

export interface DemoDataResult {
  success: boolean
  message: string
  data?: {
    contacts: Contact[]
    projects: Project[]
    tasks: Task[]
  }
}

/**
 * A readable message for anything thrown in here.
 *
 * Supabase/PostgREST errors are PLAIN OBJECTS ({ message, details, hint,
 * code }), not Error instances — so the usual `e instanceof Error ? e.message
 * : 'Unknown error'` collapsed every database failure into the useless
 * "Unknown error" the launch rehearsal hit. Read the shape, not the class.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown }
    const parts = [
      typeof e.message === 'string' ? e.message : '',
      typeof e.details === 'string' ? e.details : '',
      typeof e.hint === 'string' ? e.hint : '',
    ].filter(Boolean)
    const text = parts.join(' — ')
    if (text) return typeof e.code === 'string' ? `${text} (${e.code})` : text
  }
  return typeof error === 'string' && error ? error : 'Unknown error'
}

/**
 * Clear all demo data for current user
 */
export async function clearDemoData(): Promise<{ success: boolean; message: string }> {
  try {
    const { data: { user } } = await getAuthUser()
    if (!user) {
      return { success: false, message: 'Not authenticated' }
    }

    // Delete in order (tasks first due to foreign keys).
    //
    // Every delete's error is CHECKED. They used to be discarded, so a clear
    // blocked by RLS or a foreign key still reported success and the caller
    // happily reseeded on top of the leftovers.
    for (const table of ['tasks', 'projects', 'contacts', 'routines', 'lists'] as const) {
      const { error } = await supabase.from(table).delete().eq('user_id', user.id)
      if (error) throw error
    }

    return { success: true, message: 'Demo data cleared successfully' }
  } catch (error) {
    console.error('Error clearing demo data:', error)
    return { success: false, message: describeError(error) }
  }
}

/**
 * Load demo data for Alex Chen persona
 */
export async function loadDemoData(): Promise<DemoDataResult> {
  try {
    const { data: { user } } = await getAuthUser()
    if (!user) {
      return { success: false, message: 'Not authenticated' }
    }

    // 1. Create family contacts
    const contactsToCreate = [
      { name: 'Michael Chen', relationship: 'Son', user_id: user.id },
      { name: 'Jane Chen', relationship: 'Daughter', user_id: user.id },
      { name: 'Iris Chen', relationship: 'Partner', user_id: user.id },
    ]

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .insert(contactsToCreate)
      .select()

    if (contactsError) throw contactsError

    // 2. Create Kitchen Renovation project (Personal domain)
    const projectData = {
      name: 'Kitchen Renovation',
      context: 'personal' as const,
      status: 'in_progress' as const,
      phone_number: '(555) 123-4567',
      notes: 'Contractor: Bob Johnson\nTile: Arctic White subway 3x6\nMeasurements: 45 sq ft needed',
      // Links live on the project's own jsonb column. DemoControls advertises
      // "a project with phone/link/notes", so the link belongs in the seed.
      links: [{ url: 'https://tilesupplier.com', title: 'Tile Supplier' }],
      user_id: user.id,
    }

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .insert([projectData])
      .select()

    if (projectsError) throw projectsError

    const kitchenProject = projects[0]

    // 3. Create a few completed tasks to show history
    //
    // (There used to be a separate `task_links` INSERT here. That table does
    // not exist in the database — it never shipped — so every load threw on
    // it, which is what broke Reset Demo: the clear ran, the reload died, and
    // the account was left half-empty. The link now rides the project insert
    // above, on the `links` jsonb column where links actually live.)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(14, 0, 0, 0)

    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    lastWeek.setHours(10, 0, 0, 0)

    const completedTasksData = [
      {
        title: 'Get tile samples from showroom',
        completed: true,
        context: 'personal' as const,
        project_id: kitchenProject?.id,
        scheduled_for: lastWeek.toISOString(),
        user_id: user.id,
      },
      {
        title: 'Finalize tile selection with Iris',
        completed: true,
        context: 'personal' as const,
        project_id: kitchenProject?.id,
        scheduled_for: yesterday.toISOString(),
        user_id: user.id,
      },
      {
        title: 'Weekly team standup',
        completed: true,
        context: 'work' as const,
        scheduled_for: yesterday.toISOString(),
        user_id: user.id,
      },
    ]

    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .insert(completedTasksData)
      .select()

    if (tasksError) throw tasksError

    return {
      success: true,
      message: 'Demo data loaded successfully',
      data: {
        contacts: contacts || [],
        projects: projects || [],
        tasks: tasks || [],
      },
    }
  } catch (error) {
    console.error('Error loading demo data:', error)
    return {
      success: false,
      message: describeError(error),
    }
  }
}

/**
 * Reset demo: Clear existing data and reload fresh demo state
 */
export async function resetDemo(): Promise<DemoDataResult> {
  const clearResult = await clearDemoData()
  if (!clearResult.success) {
    return { success: false, message: `Nothing was cleared: ${clearResult.message}` }
  }

  // Wait a moment for deletes to complete
  await new Promise(resolve => setTimeout(resolve, 500))

  const loadResult = await loadDemoData()
  if (!loadResult.success) {
    // The clear already happened. Saying only "reload failed" left the
    // rehearsal guessing why the account had gone empty.
    return {
      ...loadResult,
      message: `Data was cleared but the reload failed, so the account is now EMPTY. Press "Load Data" to retry. ${loadResult.message}`,
    }
  }
  return loadResult
}
