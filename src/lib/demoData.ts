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

import { supabase } from './supabase'
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
 * Clear all demo data for current user
 */
export async function clearDemoData(): Promise<{ success: boolean; message: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, message: 'Not authenticated' }
    }

    // Delete in order (tasks first due to foreign keys)
    await supabase.from('tasks').delete().eq('user_id', user.id)
    await supabase.from('projects').delete().eq('user_id', user.id)
    await supabase.from('contacts').delete().eq('user_id', user.id)
    await supabase.from('routines').delete().eq('user_id', user.id)
    await supabase.from('lists').delete().eq('user_id', user.id)

    return { success: true, message: 'Demo data cleared successfully' }
  } catch (error) {
    console.error('Error clearing demo data:', error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

/**
 * Load demo data for Alex Chen persona
 */
export async function loadDemoData(): Promise<DemoDataResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
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
      user_id: user.id,
    }

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .insert([projectData])
      .select()

    if (projectsError) throw projectsError

    const kitchenProject = projects[0]

    // 3. Add link to Kitchen Renovation project
    if (kitchenProject) {
      const { error: linkError } = await supabase
        .from('task_links')
        .insert([{
          url: 'https://tilesupplier.com',
          title: 'Tile Supplier',
          project_id: kitchenProject.id,
          user_id: user.id,
        }])

      if (linkError) throw linkError
    }

    // 4. Create a few completed tasks to show history
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
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

/**
 * Reset demo: Clear existing data and reload fresh demo state
 */
export async function resetDemo(): Promise<DemoDataResult> {
  const clearResult = await clearDemoData()
  if (!clearResult.success) {
    return { success: false, message: `Failed to clear data: ${clearResult.message}` }
  }

  // Wait a moment for deletes to complete
  await new Promise(resolve => setTimeout(resolve, 500))

  return await loadDemoData()
}
