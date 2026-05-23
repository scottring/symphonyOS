import { Suspense, useMemo } from 'react'
import { useLocation, useNavigate, useParams, Navigate } from 'react-router-dom'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { AgentHomeView } from '@/components/agent/AgentHomeView'
import {
  MemoryShelfPage, PlannerPage, TodayPage, StandingHabitsPage,
  DayDetailPage, CookPage, GramTrackingPage, TonightPage,
} from '@/components/meals'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { HomeView } from '@/components/home'
import { MemberView } from '@/components/family/MemberView'
import { HomeApp } from '@/apps/home'
import { MorningPage } from '@/pages/MorningPage'
import { BedtimePage } from '@/pages/BedtimePage'
import { MeetingNotesView } from '@/components/meeting/MeetingNotesView'
import { ActionQueueBar } from '@/components/actions/ActionQueueBar'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
import { InboxView } from '@/components/schedule/InboxView'
import { useGoalsContext } from '@/contexts/GoalsContext'
import { useListsContext } from '@/contexts/ListsContext'
import { useNotesContext } from '@/contexts/NotesContext'
import {
  ProjectsList,
  ProjectView,
  RoutinesList,
  RoutineForm,
  RoutineInput,
  TaskView,
  ContactView,
  ContactsList,
  CalendarConnect,
  SettingsPage,
  GoalsList,
  GoalView,
  GoalPlanningChat,
  PlanningSession,
  WeeklyPlanningSession,
  ListsList,
  ListView,
  NotesPage,
  CompletedTasksView,
} from '@/components/lazy'

import type { ViewType } from '@/components/layout/Sidebar'
import type { Task, TaskContext } from '@/types/task'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { ActionableInstance, Routine } from '@/types/actionable'
import type { CreateRoutineInput, UpdateRoutineInput } from '@/hooks/useRoutines'
import type { EventNote } from '@/hooks/useEventNotes'
import type { Contact, ContactCategory } from '@/types/contact'
import type { Project } from '@/types/project'
import type { FamilyMember } from '@/types/family'
import type { Note, NoteEntityType } from '@/types/note'
import type { MeetingState } from '@/hooks/useMeetingNotes'
import type { TaskLink } from '@/types/task'
import type { PinnableEntityType } from '@/types/pin'
import type { GoalAction } from '@/types/goal'

export interface ViewRouterProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void

  // Today view
  tasks: Task[]
  events: CalendarEvent[]
  filteredEvents: CalendarEvent[]
  filteredRoutines: Routine[]
  activeRoutines: Routine[]
  projects: Project[]
  dateInstances: ActionableInstance[]
  selectedItemId: string | null
  onSelectItem: (itemId: string | null) => void
  tasksLoading: boolean
  eventsFetching: boolean
  routinesLoading: boolean
  viewedDate: Date
  onDateChange: (date: Date) => void
  currentUserMemberId: string | undefined
  bothPanelsOpen?: boolean
  isConnected: boolean
  scheduleActionsValue: ScheduleActionsValue
  meetingNotes: {
    isInMeeting: boolean
    meeting: MeetingState | null
    saveMeetingNote: (content: string) => void
    endMeeting: () => Promise<void>
  }

  // Planning session
  planningOpen: boolean
  onClosePlanning: () => void
  onUpdateTask: (id: string, updates: Partial<Task>) => Promise<void>
  pushTask: (id: string, target: Date | 'week' | 'month' | 'quarter') => Promise<void>
  familyMembers: FamilyMember[]
  eventNotesMap: Map<string, EventNote>

  // Task detail view
  selectedTask: Task | null
  onBackFromTask: () => void
  onDeleteTaskAndBack: (id: string) => void
  onToggleTask: (taskId: string) => Promise<void>
  selectedTaskContact: Contact | null
  contacts: Contact[]
  onSearchContacts: (query: string) => Contact[]
  onAddContact: (contact: { name: string; phone?: string; email?: string; notes?: string; category?: ContactCategory; birthday?: string; relationship?: string; preferences?: string }) => Promise<Contact | null>
  onOpenContact: (contactId: string) => void
  selectedTaskProject: Project | null
  onSearchProjects: (query: string) => Project[]
  onOpenProject: (projectId: string) => void
  onAddProject: (project: { name: string; notes?: string; links?: TaskLink[]; phoneNumber?: string; parentId?: string; context?: 'work' | 'family' | 'personal' }) => Promise<Project | null>
  onAddSubtask: (parentId: string, title: string, options?: { defaultAssigneeId?: string }) => Promise<string | undefined>
  selectedTaskNotes: Note[]
  selectedTaskNotesLoading: boolean
  onAddTaskNote: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>
  onSaveTaskNoteToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>

  // Contacts view
  onDeleteContact: (id: string) => Promise<void>
  onUpdateContact: (id: string, updates: Partial<Contact>) => Promise<void>

  // Family member detail view
  selectedMember: FamilyMember | null
  onEditMemberInSettings: () => void

  // Contact detail view
  selectedContactForView: Contact | null
  selectedContactId: string | null
  onSelectTaskFromContact: (taskId: string) => void
  pinnedItems: {
    isPinned: (entityType: PinnableEntityType, entityId: string) => boolean
    canPin: () => boolean
    pin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
    unpin: (entityType: PinnableEntityType, entityId: string) => Promise<boolean>
  }
  selectedContactNotes: Note[]
  selectedContactNotesLoading: boolean
  onAddContactNote: (content: string, entityType: NoteEntityType, entityId: string) => Promise<void>

  // Projects view
  selectedProjectId: string | null
  selectedProject: Project | null
  currentDomain: TaskContext | 'universal'
  contactsMap: Map<string, Contact>
  onUpdateProject: (id: string, updates: Partial<Project>) => Promise<void>
  onDeleteProject: (id: string) => Promise<void>
  onAddTaskToProject: (title: string, projectId: string) => Promise<string | undefined>
  onDeleteTask: (id: string) => Promise<void>
  onToggleTaskForProject: (taskId: string) => Promise<void>
  onUpdateTaskWithToast: (id: string, updates: Partial<Task>) => Promise<void>
  linkedEventsForProject: EventNote[]

  // Routines view
  allRoutines: Routine[]
  selectedRoutineId: string | null
  selectedRoutine: Routine | null
  creatingRoutine: boolean
  onAddRoutine: (input: CreateRoutineInput) => Promise<Routine | null>
  onUpdateRoutine: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  onDeleteRoutine: (id: string) => Promise<boolean>
  onToggleRoutineVisibility: (id: string) => Promise<boolean>

  // History view
  projectsMap: Map<string, Project>

  // Settings
  refetchFamilyMembers: () => void

  // Weekly planning session
  onSaveWeeklyPlanToVault: (input: { weekId: string; priorities: Task[]; concerns: string }) => Promise<{ ok: boolean }>
  weeklyGoalActions: GoalAction[]
  onAddGoalActionToWeek: (action: GoalAction) => void
  onOpenWeeklyPlanning: () => void
}

export function ViewRouter(props: ViewRouterProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const initialNlInput = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('initial') ?? ''
  }, [location.search])

  return (
    <SectionErrorBoundary sectionName="Content" onReset={() => props.onViewChange('today')}>
      {props.activeView === 'today' && (
        <div className="h-full flex flex-col overflow-hidden">
          {props.meetingNotes.isInMeeting && props.meetingNotes.meeting ? (
            <MeetingNotesView
              meeting={props.meetingNotes.meeting}
              onSaveNote={props.meetingNotes.saveMeetingNote}
              onEndMeeting={props.meetingNotes.endMeeting}
            />
          ) : (
            <>
              <ScheduleActionsProvider value={props.scheduleActionsValue}>
                <div className="px-4 pt-2 shrink-0">
                  <ActionQueueBar />
                </div>
                {!props.isConnected && (
                  <div className="px-4 pt-1 shrink-0">
                    <Suspense fallback={<LoadingFallback />}>
                      <CalendarConnect />
                    </Suspense>
                  </div>
                )}
                <HomeView
                  tasks={props.tasks}
                  events={props.filteredEvents}
                  routines={props.filteredRoutines}
                  allActiveRoutines={props.activeRoutines}
                  projects={props.projects}
                  dateInstances={props.dateInstances}
                  selectedItemId={props.selectedItemId}
                  onSelectItem={props.onSelectItem}
                  loading={props.tasksLoading || props.eventsFetching || props.routinesLoading}
                  viewedDate={props.viewedDate}
                  onDateChange={props.onDateChange}
                  currentUserMemberId={props.currentUserMemberId}
                  bothPanelsOpen={props.bothPanelsOpen}
                  onOpenWeeklyPlanning={props.onOpenWeeklyPlanning}
                />
              </ScheduleActionsProvider>
            </>
          )}
        </div>
      )}

      {props.activeView === 'inbox' && (
        <ScheduleActionsProvider value={props.scheduleActionsValue}>
          <InboxView
            tasks={props.tasks}
            projects={props.projects}
            selectedItemId={props.selectedItemId}
            onSelectItem={props.onSelectItem}
            panelOpen={props.selectedItemId !== null}
            onClosePanel={() => props.onSelectItem(null)}
            currentUserMemberId={props.currentUserMemberId}
          />
        </ScheduleActionsProvider>
      )}

      {props.planningOpen && (
        <Suspense fallback={<LoadingFallback />}>
          <PlanningSession
            tasks={props.tasks}
            events={props.events}
            routines={props.filteredRoutines}
            initialDate={props.viewedDate}
            onClose={props.onClosePlanning}
            onUpdateTask={props.onUpdateTask}
            onPushTask={props.pushTask}
            familyMembers={props.familyMembers}
            eventNotesMap={props.eventNotesMap}
          />
        </Suspense>
      )}

      {props.activeView === 'weekly-planning' && (
        <Suspense fallback={<LoadingFallback />}>
          <WeeklyPlanningSession
            tasks={props.tasks}
            events={props.events}
            routines={props.filteredRoutines}
            initialDate={props.viewedDate}
            onClose={() => props.onViewChange('today')}
            onUpdateTask={props.onUpdateTask}
            onPushTask={props.pushTask}
            onSavePlanToVault={props.onSaveWeeklyPlanToVault}
            goalActions={props.weeklyGoalActions}
            onAddGoalAction={props.onAddGoalActionToWeek}
            onSelectDay={(date) => { props.onDateChange(date); props.onViewChange('today') }}
          />
        </Suspense>
      )}

      {props.activeView === 'task-detail' && props.selectedTask && (
        <Suspense fallback={<LoadingFallback />}>
          <TaskView
            task={props.selectedTask}
            onBack={props.onBackFromTask}
            onUpdate={props.onUpdateTask}
            onDelete={props.onDeleteTaskAndBack}
            onToggleComplete={props.onToggleTask}
            onPush={props.pushTask}
            contact={props.selectedTaskContact}
            contacts={props.contacts}
            onSearchContacts={props.onSearchContacts}
            onAddContact={props.onAddContact}
            onOpenContact={props.onOpenContact}
            project={props.selectedTaskProject}
            projects={props.projects}
            onSearchProjects={props.onSearchProjects}
            onOpenProject={props.onOpenProject}
            onAddProject={props.onAddProject}
            onAddSubtask={props.onAddSubtask}
            entityNotes={props.selectedTaskNotes}
            entityNotesLoading={props.selectedTaskNotesLoading}
            onAddEntityNote={props.onAddTaskNote}
            onSaveNoteToVault={props.onSaveTaskNoteToVault}
          />
        </Suspense>
      )}

      {props.activeView === 'contacts' && (
        <Suspense fallback={<LoadingFallback />}>
          <ContactsList
            contacts={props.contacts}
            onSelectContact={(contactId) => navigate(`/contacts/${contactId}`)}
            onBack={() => navigate('/')}
            onAddContact={props.onAddContact}
            onDeleteContact={props.onDeleteContact}
          />
        </Suspense>
      )}

      {props.activeView === 'contact-detail' && props.selectedContactForView && (
        <Suspense fallback={<LoadingFallback />}>
          <ContactView
            contact={props.selectedContactForView}
            onBack={() => {
              navigate('/contacts')
            }}
            onUpdate={props.onUpdateContact}
            onDelete={async (id) => {
              await props.onDeleteContact(id)
              navigate('/contacts')
            }}
            tasks={props.tasks}
            onSelectTask={props.onSelectTaskFromContact}
            isPinned={props.pinnedItems.isPinned('contact', props.selectedContactForView.id)}
            canPin={props.pinnedItems.canPin()}
            onPin={() => props.pinnedItems.pin('contact', props.selectedContactForView!.id)}
            onUnpin={() => props.pinnedItems.unpin('contact', props.selectedContactForView!.id)}
            entityNotes={props.selectedContactNotes}
            entityNotesLoading={props.selectedContactNotesLoading}
            onAddEntityNote={props.onAddContactNote}
          />
        </Suspense>
      )}

      {props.activeView === 'family-member' && props.selectedMember && (
        <MemberView
          member={props.selectedMember}
          tasks={props.tasks}
          onBack={() => navigate('/')}
          onSelectTask={(taskId) => props.onSelectItem(`task-${taskId}`)}
          onEditInSettings={props.onEditMemberInSettings}
        />
      )}

      {props.activeView === 'projects' && !props.selectedProjectId && (
        <Suspense fallback={<LoadingFallback />}>
          <ProjectsList
            projects={props.currentDomain === 'universal' ? props.projects : props.projects.filter(p => p.context === props.currentDomain)}
            tasks={props.tasks}
            onSelectProject={(id) => navigate(`/projects/${id}`)}
            onAddProject={(project) => props.onAddProject({ ...project, context: props.currentDomain !== 'universal' ? props.currentDomain : undefined })}
          />
        </Suspense>
      )}

      {props.activeView === 'projects' && props.selectedProject && (
        <Suspense fallback={<LoadingFallback />}>
          <ProjectView
            project={props.selectedProject}
            tasks={props.tasks}
            contactsMap={props.contactsMap}
            onBack={() => navigate('/projects')}
            onUpdateProject={props.onUpdateProject}
            onDeleteProject={props.onDeleteProject}
            onAddTask={props.onAddTaskToProject}
            onDeleteTask={props.onDeleteTask}
            onSelectTask={props.onSelectItem}
            onToggleTask={props.onToggleTaskForProject}
            onUpdateTask={props.onUpdateTaskWithToast}
            familyMembers={props.familyMembers}
            selectedTaskId={props.selectedItemId}
            linkedEvents={props.linkedEventsForProject}
            isPinned={props.pinnedItems.isPinned('project', props.selectedProject.id)}
            canPin={props.pinnedItems.canPin()}
            onPin={() => props.pinnedItems.pin('project', props.selectedProject!.id)}
            onUnpin={() => props.pinnedItems.unpin('project', props.selectedProject!.id)}
          />
        </Suspense>
      )}

      {props.activeView === 'goals' && <GoalsSection currentDomain={props.currentDomain} />}

      {props.activeView === 'routines' && !props.selectedRoutineId && !props.creatingRoutine && (
        <Suspense fallback={<LoadingFallback />}>
          <RoutinesList
            routines={props.currentDomain === 'universal' ? props.allRoutines : props.allRoutines.filter(r => r.context === props.currentDomain)}
            contacts={props.contacts}
            familyMembers={props.familyMembers}
            onSelectRoutine={(routine) => navigate(`/routines/${routine.id}`)}
            onCreateRoutine={() => navigate('/routines/new')}
            onUpdateRoutine={props.onUpdateRoutine}
          />
        </Suspense>
      )}

      {props.activeView === 'routines' && props.creatingRoutine && (
        <div className="h-full overflow-auto">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 p-6 pb-0">
              <button
                onClick={() => navigate('/routines')}
                className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-neutral-800">New Routine</h1>
            </div>
            <Suspense fallback={<LoadingFallback />}>
              <RoutineInput
                contacts={props.contacts}
                initialValue={initialNlInput}
                onSave={async (input) => {
                  await props.onAddRoutine({ ...input, context: props.currentDomain !== 'universal' ? props.currentDomain : undefined })
                  navigate('/routines')
                }}
                onCancel={() => navigate('/routines')}
              />
            </Suspense>
          </div>
        </div>
      )}

      {props.activeView === 'routines' && props.selectedRoutine && (
        <Suspense fallback={<LoadingFallback />}>
          <RoutineForm
            key={props.selectedRoutine.id}
            routine={props.selectedRoutine}
            contacts={props.contacts}
            familyMembers={props.familyMembers}
            onBack={() => navigate('/routines')}
            onUpdate={props.onUpdateRoutine}
            onDelete={props.onDeleteRoutine}
            onToggleVisibility={props.onToggleRoutineVisibility}
            isPinned={props.pinnedItems.isPinned('routine', props.selectedRoutine.id)}
            canPin={props.pinnedItems.canPin()}
            onPin={() => props.pinnedItems.pin('routine', props.selectedRoutine!.id)}
            onUnpin={() => props.pinnedItems.unpin('routine', props.selectedRoutine!.id)}
          />
        </Suspense>
      )}

      {props.activeView === 'lists' && <ListsSection pinnedItems={props.pinnedItems} />}

      {props.activeView === 'history' && (
        <Suspense fallback={<LoadingFallback />}>
          <CompletedTasksView
            tasks={props.tasks}
            contactsMap={props.contactsMap}
            projectsMap={props.projectsMap}
            onSelectTask={(taskId) => props.onSelectItem(`task-${taskId}`)}
            onBack={() => props.onViewChange('today')}
          />
        </Suspense>
      )}

      {props.activeView === 'notes' && <NotesSection tasks={props.tasks} projects={props.projects} contacts={props.contacts} onSelectItem={props.onSelectItem} />}

      {props.activeView === 'agent' && (
        <AgentHomeView />
      )}

      {props.activeView === 'settings' && (
        <Suspense fallback={<LoadingFallback />}>
          <SettingsPage
            onBack={() => {
              props.refetchFamilyMembers()
              props.onViewChange('today')
            }}
            onFamilyMembersChanged={props.refetchFamilyMembers}
          />
        </Suspense>
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/shelf') && (
        <MemoryShelfPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/today') && (
        <TodayPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/brief') && (
        <Navigate to="/meals/plan#brief" replace />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/habits') && (
        <StandingHabitsPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/day/') && (
        <DayDetailPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/cook/') && (
        <CookPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/grams') && (
        <GramTrackingPage />
      )}

      {props.activeView === 'meals' && location.pathname.startsWith('/meals/tonight') && (
        <TonightPage />
      )}

      {props.activeView === 'meals'
        && !location.pathname.startsWith('/meals/shelf')
        && !location.pathname.startsWith('/meals/today')
        && !location.pathname.startsWith('/meals/habits')
        && !location.pathname.startsWith('/meals/day/')
        && !location.pathname.startsWith('/meals/cook/')
        && !location.pathname.startsWith('/meals/grams')
        && !location.pathname.startsWith('/meals/tonight') && (
        <PlannerPage />
      )}

      {props.activeView === 'home-app' && <HomeApp />}

      {props.activeView === 'morning' && <MorningPage />}
      {props.activeView === 'bedtime' && <BedtimePage />}
    </SectionErrorBoundary>
  )
}

function GoalsSection({ currentDomain }: { currentDomain: TaskContext | 'universal' }) {
  const navigate = useNavigate()
  const params = useParams<{ goalId?: string }>()
  const selectedGoalId = params.goalId || null
  const {
    areas, goals, getCurrentQuarter, getGoalById,
    addArea, deleteArea, addGoal, updateGoal, deleteGoal,
    addAction, updateAction, toggleAction, deleteAction,
    addMilestone, updateMilestone, updateMilestoneProgress, deleteMilestone,
    planningGoalId, setPlanningGoalId, goalPlanning,
  } = useGoalsContext()

  const filteredGoals = currentDomain === 'universal' ? goals : goals.filter(g => g.context === currentDomain)

  return (
    <>
      {!selectedGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalsList
            areas={areas}
            goals={filteredGoals}
            currentQuarter={getCurrentQuarter()}
            year={new Date().getFullYear()}
            onSelectGoal={(id) => navigate(`/goals/${id}`)}
            onAddArea={addArea}
            onAddGoal={(areaId, name) => addGoal(areaId, name, currentDomain !== 'universal' ? currentDomain : undefined)}
            onToggleAction={toggleAction}
            onDeleteArea={deleteArea}
          />
        </Suspense>
      )}

      {selectedGoalId && getGoalById(selectedGoalId) && !planningGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalView
            goal={getGoalById(selectedGoalId)!}
            area={areas.find(a => a.id === getGoalById(selectedGoalId!)!.areaId)}
            currentQuarter={getCurrentQuarter()}
            onBack={() => navigate('/goals')}
            onUpdateGoal={updateGoal}
            onDeleteGoal={deleteGoal}
            onAddAction={addAction}
            onUpdateAction={updateAction}
            onToggleAction={toggleAction}
            onDeleteAction={deleteAction}
            onStartPlanning={() => {
              setPlanningGoalId(selectedGoalId)
              const g = getGoalById(selectedGoalId!)
              if (g) {
                const areaName = areas.find(a => a.id === g.areaId)?.name
                goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
              }
            }}
            onAddMilestone={addMilestone}
            onUpdateMilestone={updateMilestone}
            onUpdateMilestoneProgress={updateMilestoneProgress}
            onDeleteMilestone={deleteMilestone}
          />
        </Suspense>
      )}

      {planningGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalPlanningChat
            goalName={getGoalById(planningGoalId)?.name ?? 'Goal'}
            messages={goalPlanning.messages}
            loading={goalPlanning.loading}
            readyToFinish={goalPlanning.readyToFinish}
            planningResult={goalPlanning.planningResult}
            error={goalPlanning.error}
            onStart={() => {
              const g = getGoalById(planningGoalId!)
              if (g) {
                const areaName = areas.find(a => a.id === g.areaId)?.name
                goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
              }
            }}
            onSend={goalPlanning.sendMessage}
            onFinish={goalPlanning.finishPlanning}
            onBack={() => { setPlanningGoalId(null); goalPlanning.reset() }}
            onDone={() => { setPlanningGoalId(null); goalPlanning.reset() }}
          />
        </Suspense>
      )}
    </>
  )
}

function ListsSection({ pinnedItems }: { pinnedItems: ViewRouterProps['pinnedItems'] }) {
  const { lists, listsByCategory, selectedListId, setSelectedListId, selectedList, listItems, addList, updateList, deleteList, addItem, updateItem, deleteItem, reorderItems } = useListsContext()

  return (
    <>
      {!selectedListId && (
        <Suspense fallback={<LoadingFallback />}>
          <ListsList
            lists={lists}
            listsByCategory={listsByCategory}
            onSelectList={setSelectedListId}
            onAddList={addList}
          />
        </Suspense>
      )}

      {selectedList && (
        <Suspense fallback={<LoadingFallback />}>
          <ListView
            list={selectedList}
            items={listItems}
            onBack={() => setSelectedListId(null)}
            onUpdateList={updateList}
            onDeleteList={deleteList}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onReorderItems={reorderItems}
            isPinned={pinnedItems.isPinned('list', selectedList.id)}
            canPin={pinnedItems.canPin()}
            onPin={() => pinnedItems.pin('list', selectedList!.id)}
            onUnpin={() => pinnedItems.unpin('list', selectedList!.id)}
          />
        </Suspense>
      )}
    </>
  )
}

function NotesSection({ tasks, projects, contacts, onSelectItem }: { tasks: Task[]; projects: Project[]; contacts: Contact[]; onSelectItem: (id: string | null) => void }) {
  const { notes, notesByDate, loading, addNote, updateNote, deleteNote, activeTopics, topicsMap, addTopic, getEntityLinks, addEntityLink, removeEntityLink, getVaultNoteContent } = useNotesContext()

  return (
    <Suspense fallback={<LoadingFallback />}>
      <NotesPage
        notes={notes}
        notesByDate={notesByDate}
        topics={activeTopics}
        topicsMap={topicsMap}
        loading={loading}
        tasks={tasks}
        projects={projects}
        contacts={contacts}
        onAddNote={async (content, topicId) => addNote({ content, topicId })}
        onUpdateNote={async (id, updates) => { await updateNote(id, updates) }}
        onDeleteNote={deleteNote}
        onAddTopic={async (name) => addTopic({ name })}
        getEntityLinks={getEntityLinks}
        onAddEntityLink={async (noteId, entityType, entityId) => {
          await addEntityLink(noteId, { entityType, entityId })
        }}
        onRemoveEntityLink={removeEntityLink}
        getVaultNoteContent={getVaultNoteContent}
        onNavigateToTask={(taskId) => onSelectItem(`task-${taskId}`)}
      />
    </Suspense>
  )
}
