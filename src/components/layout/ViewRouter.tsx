import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { HomeView } from '@/components/home'
import { MeetingNotesView } from '@/components/meeting/MeetingNotesView'
import { ActionQueueBar } from '@/components/actions/ActionQueueBar'
import { ScheduleActionsProvider, type ScheduleActionsValue } from '@/contexts/ScheduleActionsContext'
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
import type { GoalArea, Goal, GoalAction, GoalMilestone, Quarter, ConversationMessage, GoalPlanningResult } from '@/types/goal'
import type { FamilyMember } from '@/types/family'
import type { List, ListItem, ListCategory, ListVisibility } from '@/types/list'
import type { Note, DisplayNote, NoteEntityType, NoteTopic, NoteEntityLink, CreateNoteInput, UpdateNoteInput, CreateNoteTopicInput, CreateEntityLinkInput } from '@/types/note'
import type { MeetingState } from '@/hooks/useMeetingNotes'
import type { TaskLink } from '@/types/task'
import type { PinnableEntityType } from '@/types/pin'

export interface ViewRouterProps {
  activeView: ViewType
  onViewChange: (view: ViewType) => void

  // Today view
  tasks: Task[]
  events: CalendarEvent[]
  filteredEvents: CalendarEvent[]
  filteredRoutines: Routine[]
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

  // Contacts view
  onDeleteContact: (id: string) => Promise<void>
  onUpdateContact: (id: string, updates: Partial<Contact>) => Promise<void>

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

  // Goals view
  goalAreas: GoalArea[]
  goals: Goal[]
  getCurrentQuarter: () => Quarter
  selectedGoalId: string | null
  getGoalById: (id: string) => Goal | undefined
  planningGoalId: string | null
  onSetPlanningGoalId: (id: string | null) => void
  onAddGoalArea: (name: string) => Promise<GoalArea | null>
  onDeleteGoalArea: (id: string) => Promise<void>
  onAddGoal: (areaId: string, name: string, context?: 'work' | 'family' | 'personal') => Promise<Goal | null>
  onUpdateGoal: (id: string, updates: Partial<Pick<Goal, 'name' | 'notes' | 'status' | 'areaId' | 'sortOrder' | 'strategy' | 'domainSlug' | 'layerId' | 'context'>>) => Promise<void>
  onDeleteGoal: (id: string) => Promise<void>
  onAddGoalAction: (goalId: string, description: string, quarter: Quarter) => Promise<GoalAction | null>
  onUpdateGoalAction: (id: string, updates: Partial<Pick<GoalAction, 'description' | 'completed' | 'notes' | 'sortOrder'>>) => Promise<void>
  onToggleGoalAction: (id: string) => Promise<void>
  onDeleteGoalAction: (id: string) => Promise<void>
  onAddGoalMilestone: (goalId: string, title: string, opts?: { description?: string; targetDate?: string; targetValue?: number; unit?: string; sortOrder?: number }) => Promise<GoalMilestone | null>
  onUpdateGoalMilestone: (id: string, updates: Partial<Pick<GoalMilestone, 'title' | 'description' | 'targetDate' | 'targetValue' | 'currentValue' | 'unit' | 'status' | 'sortOrder'>>) => Promise<void>
  onUpdateMilestoneProgress: (id: string, currentValue: number, milestoneTargetValue?: number) => Promise<void>
  onDeleteGoalMilestone: (id: string) => Promise<void>
  goalPlanning: {
    messages: ConversationMessage[]
    loading: boolean
    readyToFinish: boolean
    planningResult: GoalPlanningResult | null
    error: string | null
    startPlanning: (goalId: string, goalName: string, goalNotes?: string, areaName?: string) => Promise<void>
    sendMessage: (message: string) => Promise<void>
    finishPlanning: () => Promise<void>
    reset: () => void
  }

  // Routines view
  allRoutines: Routine[]
  selectedRoutineId: string | null
  selectedRoutine: Routine | null
  creatingRoutine: boolean
  onAddRoutine: (input: CreateRoutineInput) => Promise<Routine | null>
  onUpdateRoutine: (id: string, input: UpdateRoutineInput) => Promise<boolean>
  onDeleteRoutine: (id: string) => Promise<boolean>
  onToggleRoutineVisibility: (id: string) => Promise<boolean>

  // Lists view
  lists: List[]
  listsByCategory: Record<ListCategory, List[]>
  selectedListId: string | null
  onSelectList: (id: string | null) => void
  selectedList: List | null
  listItems: ListItem[]
  onAddList: (list: { title: string; icon?: string; category?: ListCategory; visibility?: ListVisibility; hiddenFrom?: string[] }) => Promise<List | null>
  onUpdateList: (id: string, updates: Partial<List>) => Promise<void>
  onDeleteList: (id: string) => Promise<void>
  onAddListItem: (item: { text: string; note?: string }) => Promise<ListItem | null>
  onUpdateListItem: (id: string, updates: Partial<ListItem>) => Promise<void>
  onDeleteListItem: (id: string) => Promise<void>
  onReorderListItems: (itemIds: string[]) => Promise<void>

  // History view
  projectsMap: Map<string, Project>

  // Notes view
  notes: Note[]
  notesByDate: { date: string; label: string; notes: DisplayNote[] }[]
  activeTopics: NoteTopic[]
  topicsMap: Map<string, NoteTopic>
  notesLoading: boolean
  onAddNote: (input: CreateNoteInput) => Promise<Note | null>
  onUpdateNoteContent: (id: string, updates: UpdateNoteInput) => Promise<void>
  onDeleteNote: (id: string) => Promise<void>
  onAddTopic: (input: CreateNoteTopicInput) => Promise<NoteTopic | null>
  getEntityLinks: (noteId: string) => Promise<NoteEntityLink[]>
  onAddEntityLink: (noteId: string, input: CreateEntityLinkInput) => Promise<NoteEntityLink | null>
  onRemoveEntityLink: (linkId: string) => Promise<void>
  getVaultNoteContent: (noteId: string) => Promise<string | null>

  // Settings
  refetchFamilyMembers: () => void
}

export function ViewRouter(props: ViewRouterProps) {
  const navigate = useNavigate()

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
              {!props.isConnected && (
                <div className="p-4 border-b border-neutral-100 shrink-0">
                  <Suspense fallback={<LoadingFallback />}>
                    <CalendarConnect />
                  </Suspense>
                </div>
              )}

              <ScheduleActionsProvider value={props.scheduleActionsValue}>
                <div className="px-4 pt-2 shrink-0">
                  <ActionQueueBar />
                </div>
                <HomeView
                  tasks={props.tasks}
                  events={props.filteredEvents}
                  routines={props.filteredRoutines}
                  projects={props.projects}
                  dateInstances={props.dateInstances}
                  selectedItemId={props.selectedItemId}
                  onSelectItem={props.onSelectItem}
                  loading={props.tasksLoading || props.eventsFetching || props.routinesLoading}
                  viewedDate={props.viewedDate}
                  onDateChange={props.onDateChange}
                  currentUserMemberId={props.currentUserMemberId}
                />
              </ScheduleActionsProvider>
            </>
          )}
        </div>
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

      {props.activeView === 'goals' && !props.selectedGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalsList
            areas={props.goalAreas}
            goals={props.currentDomain === 'universal' ? props.goals : props.goals.filter(g => g.context === props.currentDomain)}
            currentQuarter={props.getCurrentQuarter()}
            year={new Date().getFullYear()}
            onSelectGoal={(id) => navigate(`/goals/${id}`)}
            onAddArea={props.onAddGoalArea}
            onAddGoal={(areaId, name) => props.onAddGoal(areaId, name, props.currentDomain !== 'universal' ? props.currentDomain : undefined)}
            onToggleAction={props.onToggleGoalAction}
            onDeleteArea={props.onDeleteGoalArea}
          />
        </Suspense>
      )}

      {props.activeView === 'goals' && props.selectedGoalId && props.getGoalById(props.selectedGoalId) && !props.planningGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalView
            goal={props.getGoalById(props.selectedGoalId)!}
            area={props.goalAreas.find(a => a.id === props.getGoalById(props.selectedGoalId!)!.areaId)}
            currentQuarter={props.getCurrentQuarter()}
            onBack={() => navigate('/goals')}
            onUpdateGoal={props.onUpdateGoal}
            onDeleteGoal={props.onDeleteGoal}
            onAddAction={props.onAddGoalAction}
            onUpdateAction={props.onUpdateGoalAction}
            onToggleAction={props.onToggleGoalAction}
            onDeleteAction={props.onDeleteGoalAction}
            onStartPlanning={() => {
              props.onSetPlanningGoalId(props.selectedGoalId)
              const g = props.getGoalById(props.selectedGoalId!)
              if (g) {
                const areaName = props.goalAreas.find(a => a.id === g.areaId)?.name
                props.goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
              }
            }}
            onAddMilestone={props.onAddGoalMilestone}
            onUpdateMilestone={props.onUpdateGoalMilestone}
            onUpdateMilestoneProgress={props.onUpdateMilestoneProgress}
            onDeleteMilestone={props.onDeleteGoalMilestone}
          />
        </Suspense>
      )}

      {props.activeView === 'goals' && props.planningGoalId && (
        <Suspense fallback={<LoadingFallback />}>
          <GoalPlanningChat
            goalName={props.getGoalById(props.planningGoalId)?.name ?? 'Goal'}
            messages={props.goalPlanning.messages}
            loading={props.goalPlanning.loading}
            readyToFinish={props.goalPlanning.readyToFinish}
            planningResult={props.goalPlanning.planningResult}
            error={props.goalPlanning.error}
            onStart={() => {
              const g = props.getGoalById(props.planningGoalId!)
              if (g) {
                const areaName = props.goalAreas.find(a => a.id === g.areaId)?.name
                props.goalPlanning.startPlanning(g.id, g.name, g.notes, areaName)
              }
            }}
            onSend={props.goalPlanning.sendMessage}
            onFinish={props.goalPlanning.finishPlanning}
            onBack={() => {
              props.onSetPlanningGoalId(null)
              props.goalPlanning.reset()
            }}
            onDone={() => {
              props.onSetPlanningGoalId(null)
              props.goalPlanning.reset()
            }}
          />
        </Suspense>
      )}

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

      {props.activeView === 'lists' && !props.selectedListId && (
        <Suspense fallback={<LoadingFallback />}>
          <ListsList
            lists={props.lists}
            listsByCategory={props.listsByCategory}
            onSelectList={props.onSelectList}
            onAddList={props.onAddList}
          />
        </Suspense>
      )}

      {props.activeView === 'lists' && props.selectedList && (
        <Suspense fallback={<LoadingFallback />}>
          <ListView
            list={props.selectedList}
            items={props.listItems}
            onBack={() => props.onSelectList(null)}
            onUpdateList={props.onUpdateList}
            onDeleteList={props.onDeleteList}
            onAddItem={props.onAddListItem}
            onUpdateItem={props.onUpdateListItem}
            onDeleteItem={props.onDeleteListItem}
            onReorderItems={props.onReorderListItems}
            isPinned={props.pinnedItems.isPinned('list', props.selectedList.id)}
            canPin={props.pinnedItems.canPin()}
            onPin={() => props.pinnedItems.pin('list', props.selectedList!.id)}
            onUnpin={() => props.pinnedItems.unpin('list', props.selectedList!.id)}
          />
        </Suspense>
      )}

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

      {props.activeView === 'notes' && (
        <Suspense fallback={<LoadingFallback />}>
          <NotesPage
            notes={props.notes}
            notesByDate={props.notesByDate}
            topics={props.activeTopics}
            topicsMap={props.topicsMap}
            loading={props.notesLoading}
            tasks={props.tasks}
            projects={props.projects}
            contacts={props.contacts}
            onAddNote={async (content, topicId) => {
              return props.onAddNote({ content, topicId })
            }}
            onUpdateNote={async (id, updates) => {
              await props.onUpdateNoteContent(id, updates)
            }}
            onDeleteNote={props.onDeleteNote}
            onAddTopic={async (name) => {
              return props.onAddTopic({ name })
            }}
            getEntityLinks={props.getEntityLinks}
            onAddEntityLink={async (noteId, entityType, entityId) => {
              await props.onAddEntityLink(noteId, { entityType, entityId })
            }}
            onRemoveEntityLink={props.onRemoveEntityLink}
            getVaultNoteContent={props.getVaultNoteContent}
            onNavigateToTask={(taskId) => props.onSelectItem(`task-${taskId}`)}
          />
        </Suspense>
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
    </SectionErrorBoundary>
  )
}
