import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ContextSnapshot {
  user: {
    id: string
    name: string
  }
  currentTime: string
  today: string
  tasks: {
    scheduled: unknown[]
    inbox: unknown[]
    staleInbox: unknown[]
    agingInbox: unknown[]
    freshInbox: unknown[]
    overdue: unknown[]
    unassigned: unknown[]
    todayCount: number
    // Tasks by context for COO reporting
    byContext: {
      work: unknown[]
      family: unknown[]
      personal: unknown[]
      unset: unknown[]
    }
    todayByContext: {
      work: unknown[]
      family: unknown[]
      personal: unknown[]
    }
  }
  projects: unknown[]
  emptyProjects: unknown[]
  contacts: unknown[]
  recentActions: unknown[]
  routines: unknown[]
  unassignedRoutines: unknown[]
  // Family members for assignment and messaging
  familyMembers: Array<{
    id: string
    name: string
    initials: string
  }>
  // Calendar events for today
  calendarEvents: unknown[]
  stats: {
    staleInboxCount: number
    agingInboxCount: number
    freshInboxCount: number
    totalInboxCount: number
    scheduledTodayCount: number
    overdueCount: number
    activeProjectsCount: number
    emptyProjectsCount: number
    pendingFollowupsCount: number
    unassignedTasksCount: number
    unassignedRoutinesCount: number
    itemsWithHomeCount: number
    totalIncompleteCount: number
    todayEventsCount: number
    // Context breakdown
    workTasksCount: number
    familyTasksCount: number
    personalTasksCount: number
  }
  clarity: {
    score: number
    maxPossible: number
    actions: string[]
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify the user's token
    const anonClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Calculate today's date range for calendar events
    const todayStart = `${today}T00:00:00.000Z`
    const todayEnd = `${today}T23:59:59.999Z`

    // Fetch all relevant data in parallel
    const [
      { data: allIncompleteTasks },
      { data: projects },
      { data: contacts },
      { data: recentActions },
      { data: routines },
      { data: familyMembers },
      { data: calendarEvents },
    ] = await Promise.all([
      // All incomplete tasks for clarity calculation
      supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .eq('completed', false)
        .order('scheduled_for', { nullsFirst: true }),

      // Active projects (not completed, not on_hold)
      supabase
        .from('projects')
        .select('*')
        .eq('user_id', user.id)
        .in('status', ['not_started', 'in_progress']),

      // Contacts (for context)
      supabase
        .from('contacts')
        .select('id, name, phone, email')
        .eq('user_id', user.id),

      // Recent action logs (messages sent in last 3 days - potential follow-ups)
      supabase
        .from('action_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'sent')
        .gte('sent_at', fourDaysAgo)
        .order('sent_at', { ascending: false }),

      // Active routines
      supabase
        .from('routines')
        .select('*')
        .eq('user_id', user.id)
        .eq('visibility', 'active'),

      // Family members (for assignment context and messaging)
      supabase
        .from('family_members')
        .select('id, name, initials')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true }),

      // Calendar events for today (cached from Google Calendar)
      supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .gte('start_time', todayStart)
        .lte('start_time', todayEnd)
        .order('start_time', { ascending: true }),
    ])

    // Categorize tasks
    const incompleteTasks = allIncompleteTasks || []
    const scheduledTasks = incompleteTasks.filter((t: { scheduled_for: string | null }) => t.scheduled_for && t.scheduled_for >= today)
    const overdueTasks = incompleteTasks.filter((t: { scheduled_for: string | null }) => t.scheduled_for && t.scheduled_for < today)
    const inboxTasks = incompleteTasks.filter((t: { scheduled_for: string | null; deferred_until: string | null; is_someday: boolean }) =>
      !t.scheduled_for && !t.deferred_until && !t.is_someday
    )
    const deferredTasks = incompleteTasks.filter((t: { deferred_until: string | null }) => t.deferred_until)

    // Age-based inbox categorization
    const staleInbox = inboxTasks.filter((t: { created_at: string }) => t.created_at < eightDaysAgo)
    const agingInbox = inboxTasks.filter((t: { created_at: string }) => t.created_at >= eightDaysAgo && t.created_at < fourDaysAgo)
    const freshInbox = inboxTasks.filter((t: { created_at: string }) => t.created_at >= fourDaysAgo)

    // Unassigned items
    const unassignedTasks = incompleteTasks.filter((t: { assigned_to: string | null; assigned_to_all: string[] | null }) =>
      !t.assigned_to && (!t.assigned_to_all || t.assigned_to_all.length === 0)
    )
    const activeRoutines = routines || []
    const unassignedRoutines = activeRoutines.filter((r: { assigned_to: string | null; assigned_to_all: string[] | null }) =>
      !r.assigned_to && (!r.assigned_to_all || r.assigned_to_all.length === 0)
    )

    // Empty projects (active projects with no incomplete tasks)
    const projectTaskCounts = new Map<string, number>()
    for (const task of incompleteTasks) {
      if ((task as { project_id?: string }).project_id) {
        const pid = (task as { project_id: string }).project_id
        projectTaskCounts.set(pid, (projectTaskCounts.get(pid) || 0) + 1)
      }
    }
    const emptyProjects = (projects || []).filter((p: { id: string }) => !projectTaskCounts.has(p.id))

    // Calculate clarity score (matching useSystemHealth.ts logic)
    const totalItems = incompleteTasks.length
    const itemsWithHome = scheduledTasks.length + deferredTasks.length

    // Items with assignment get full credit, unassigned get 50%
    const assignedItemsWithHome = incompleteTasks.filter((t: { scheduled_for: string | null; deferred_until: string | null; assigned_to: string | null; assigned_to_all: string[] | null }) =>
      (t.scheduled_for || t.deferred_until) && (t.assigned_to || (t.assigned_to_all && t.assigned_to_all.length > 0))
    ).length
    const unassignedItemsWithHome = itemsWithHome - assignedItemsWithHome
    const effectiveItemsWithHome = assignedItemsWithHome + (unassignedItemsWithHome * 0.5)

    let rawScore = totalItems > 0 ? (effectiveItemsWithHome / totalItems) * 100 : 100

    // Penalties
    const agingPenalty = agingInbox.length * 3
    const stalePenalty = staleInbox.length * 8
    const emptyProjectPenalty = emptyProjects.length * 5

    const clarityScore = Math.max(0, Math.min(100, Math.round(rawScore - agingPenalty - stalePenalty - emptyProjectPenalty)))

    // Generate specific actions to improve clarity
    const clarityActions: string[] = []
    if (staleInbox.length > 0) {
      clarityActions.push(`Schedule or defer ${staleInbox.length} stale inbox item${staleInbox.length > 1 ? 's' : ''} (+${staleInbox.length * 8} points)`)
    }
    if (agingInbox.length > 0) {
      clarityActions.push(`Process ${agingInbox.length} aging inbox item${agingInbox.length > 1 ? 's' : ''} (+${agingInbox.length * 3} points)`)
    }
    if (freshInbox.length > 0) {
      clarityActions.push(`Triage ${freshInbox.length} fresh inbox item${freshInbox.length > 1 ? 's' : ''} to get ahead`)
    }
    if (emptyProjects.length > 0) {
      clarityActions.push(`Add tasks to ${emptyProjects.length} empty project${emptyProjects.length > 1 ? 's' : ''} (+${emptyProjects.length * 5} points)`)
    }
    if (unassignedItemsWithHome > 0) {
      clarityActions.push(`Assign ${unassignedItemsWithHome} scheduled item${unassignedItemsWithHome > 1 ? 's' : ''} to family members (+${Math.round(unassignedItemsWithHome * 0.5)} points)`)
    }
    if (overdueTasks.length > 0) {
      clarityActions.push(`Reschedule ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`)
    }

    const todaysTasks = scheduledTasks.filter((t: { scheduled_for: string }) => t.scheduled_for?.startsWith(today))

    // Group tasks by context
    const tasksByContext = {
      work: incompleteTasks.filter((t: { context?: string }) => t.context === 'work'),
      family: incompleteTasks.filter((t: { context?: string }) => t.context === 'family'),
      personal: incompleteTasks.filter((t: { context?: string }) => t.context === 'personal'),
      unset: incompleteTasks.filter((t: { context?: string }) => !t.context),
    }

    // Today's tasks by context (for morning brief)
    const todayByContext = {
      work: todaysTasks.filter((t: { context?: string }) => t.context === 'work'),
      family: todaysTasks.filter((t: { context?: string }) => t.context === 'family'),
      personal: todaysTasks.filter((t: { context?: string }) => t.context === 'personal'),
    }

    const snapshot: ContextSnapshot = {
      user: {
        id: user.id,
        name: user.user_metadata?.full_name || user.user_metadata?.name || 'there',
      },
      currentTime: now.toISOString(),
      today,
      tasks: {
        scheduled: scheduledTasks,
        inbox: inboxTasks,
        staleInbox: staleInbox,
        agingInbox: agingInbox,
        freshInbox: freshInbox,
        overdue: overdueTasks,
        unassigned: unassignedTasks,
        todayCount: todaysTasks.length,
        byContext: tasksByContext,
        todayByContext: todayByContext,
      },
      projects: projects || [],
      emptyProjects: emptyProjects,
      contacts: contacts || [],
      recentActions: recentActions || [],
      routines: activeRoutines,
      unassignedRoutines: unassignedRoutines,
      familyMembers: (familyMembers || []).map((m: { id: string; name: string; initials: string }) => ({
        id: m.id,
        name: m.name,
        initials: m.initials,
      })),
      calendarEvents: calendarEvents || [],
      stats: {
        staleInboxCount: staleInbox.length,
        agingInboxCount: agingInbox.length,
        freshInboxCount: freshInbox.length,
        totalInboxCount: inboxTasks.length,
        scheduledTodayCount: todaysTasks.length,
        overdueCount: overdueTasks.length,
        activeProjectsCount: (projects || []).length,
        emptyProjectsCount: emptyProjects.length,
        pendingFollowupsCount: (recentActions || []).length,
        unassignedTasksCount: unassignedTasks.length,
        unassignedRoutinesCount: unassignedRoutines.length,
        itemsWithHomeCount: itemsWithHome,
        totalIncompleteCount: totalItems,
        todayEventsCount: (calendarEvents || []).length,
        workTasksCount: tasksByContext.work.length,
        familyTasksCount: tasksByContext.family.length,
        personalTasksCount: tasksByContext.personal.length,
      },
      clarity: {
        score: clarityScore,
        maxPossible: 100,
        actions: clarityActions,
      },
    }

    console.log('Context snapshot generated:', {
      userId: user.id,
      clarityScore,
      stats: snapshot.stats,
    })

    return new Response(
      JSON.stringify(snapshot),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('get-context-snapshot error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
