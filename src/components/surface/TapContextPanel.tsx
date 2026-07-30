import { useState, type ReactNode } from 'react'
import type { Task, TaskContext, Scope } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelActions } from './sections/PanelActions'
import { PanelAssistant } from './sections/PanelAssistant'
import { PanelWhy } from './sections/PanelWhy'
import { PanelSubtasks } from './sections/PanelSubtasks'
import { PanelPeople } from './sections/PanelPeople'
import { PanelLinked } from './sections/PanelLinked'
import { PanelLinks } from './sections/PanelLinks'
import { PanelPhotos } from './sections/PanelPhotos'
import { PanelConversations } from './sections/PanelConversations'
import { PanelLocation } from './sections/PanelLocation'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelClassify } from './sections/PanelClassify'
import { PanelFooter } from './sections/PanelFooter'
import { useLinkedEntities } from './hooks/useLinkedEntities'
import { useMightBeRelevant } from './hooks/useMightBeRelevant'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import type { MightBeRelevantItem } from './types'

interface TapContextPanelProps {
  task: Task
  // Reference data (Plan 1: passed in by caller — Plan 2 may push into context)
  contacts: Contact[]
  projects: Project[]
  events: CalendarEvent[]
  familyMembers: FamilyMember[]
  siblingTaskCandidates: Task[]
  allTasks: Task[]
  /** Optional why-chain (Task → Project → Goal), rendered under the title. */
  whyChain?: ReactNode
  /** Optional creator name for the meta row + footer. */
  createdByName?: string

  // Handlers
  onClose: () => void
  onTitleChange: (next: string) => void
  onNotesChange: (next: string) => void
  /** Promote the task's notes into a persisting vault note linked to the task. */
  onSaveNoteToVault?: (content: string) => Promise<{ ok: boolean; url?: string }>
  onToggleComplete: () => void
  onSchedule: (date: Date, isAllDay: boolean) => void
  onReschedule?: (when: import('@/components/schedule/TriageWhenMenu').TriageWhen) => void
  onClearSchedule?: () => void
  isPinned: boolean
  onTogglePin: () => void
  onDelete: () => void
  onOpenContact: (id: string) => void
  onOpenMember: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenEvent: (id: string) => void
  onOpenTask: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
  onToggleSubtask: (id: string) => void
  onAddSubtask: (title: string) => void
  /** Detach a subtask from this group (becomes standalone). Group management only. */
  onRemoveSubtask?: (id: string) => void
  /** Triage a single subtask (relative when). */
  onRescheduleSubtask?: (id: string, when: import('@/components/schedule/TriageWhenMenu').TriageWhen) => void
  /** Triage a single subtask to a specific date/time. */
  onScheduleSubtask?: (id: string, date: Date, isAllDay: boolean) => void
  /** Dissolve this group, keeping the tasks. Present only when the task has subtasks. */
  onUngroup?: () => void
  /** Delete this group and all its tasks. Present only when the task has subtasks. */
  onDeleteGroup?: () => void
  onAddLink: (url: string) => void
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
  /** Persist the task's route (origin/stops/mode). Omit to keep directions ephemeral. */
  onDirectionsChange?: (directions: import('@/types/directions').TaskDirections) => void
  onContextChange: (context: TaskContext | undefined) => void
  /** Change who can see the task (individual/couple/compound). Optional. */
  onScopeChange?: (scope: Scope) => void
  onAssigneesChange: (ids: string[]) => void
  /** Link/change/clear the task's related contact. When omitted, the People section is read-only. */
  onContactChange?: (contactId: string | undefined) => void
  onSearchContacts?: (query: string) => Contact[]
  onAddContact?: (name: string, details?: { phone?: string; category?: import('@/types/contact').ContactCategory; placeId?: string }) => Promise<Contact | null>
  /** Refetch after the planning assistant writes (enables the Help-me-plan action). */
  onAssistMutate?: () => void
}

export function TapContextPanel(props: TapContextPanelProps) {
  const { task, allTasks, createdByName } = props

  const [showDirections, setShowDirections] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)

  // Collapse the directions builder when switching to a different task
  // (React-recommended "adjust state during render" pattern, not an effect).
  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setShowDirections(false)
    setAssistOpen(false)
  }

  const linked = useLinkedEntities(task, {
    contacts: props.contacts,
    projects: props.projects,
    events: props.events,
    familyMembers: props.familyMembers,
    siblingTaskCandidates: props.siblingTaskCandidates,
  })

  const mightBeRelevant = useMightBeRelevant(task, { allTasks })

  return (
    <article
      className="
        bg-bg-elevated max-w-md w-full
        rounded-2xl
        px-4 md:px-5 py-3 md:py-5
        divide-y divide-neutral-200/60
        [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
      "
    >
      <PanelHeader
        title={task.title}
        onTitleChange={props.onTitleChange}
        onClose={props.onClose}
      />
      {/* The read-only "FAMILY · timed · for Iris" meta row was removed — it
          duplicated (in jargon) the interactive context chooser + who-picker
          below. The why-chain stays. */}
      {props.whyChain && <div>{props.whyChain}</div>}
      <PanelActions
        completed={task.completed}
        phoneNumber={task.phoneNumber || linked.contact?.phone || linked.project?.phoneNumber}
        location={task.location}
        onShowDirections={() => setShowDirections((v) => !v)}
        scheduledFor={task.scheduledFor || undefined}
        isAllDay={task.isAllDay}
        isPinned={props.isPinned}
        onToggleComplete={props.onToggleComplete}
        onSchedule={props.onSchedule}
        onReschedule={props.onReschedule}
        onClearSchedule={props.onClearSchedule}
        onTogglePin={props.onTogglePin}
        onDelete={props.onDelete}
        onUngroup={(task.subtasks?.length ?? 0) > 0 ? props.onUngroup : undefined}
        onDeleteGroup={(task.subtasks?.length ?? 0) > 0 ? props.onDeleteGroup : undefined}
        onAssist={props.onAssistMutate ? () => setAssistOpen(true) : undefined}
      />
      <PanelAssistant taskId={task.id} />
      <PanelClassify
        context={task.context}
        onContextChange={props.onContextChange}
        scope={task.scope}
        onScopeChange={props.onScopeChange}
        members={props.familyMembers}
        selectedAssigneeIds={task.assignedToAll ?? (task.assignedTo ? [task.assignedTo] : [])}
        onAssigneesChange={props.onAssigneesChange}
      />
      <PanelLocation
        location={task.location}
        locationPlaceId={task.locationPlaceId}
        title={task.title}
        showDirections={showDirections}
        onUpdateLocation={props.onUpdateLocation}
        onClearLocation={props.onClearLocation}
        directions={task.directions}
        onDirectionsChange={props.onDirectionsChange}
      />
      <PanelWhy key={task.id} label="Notes" notes={task.notes} onChange={props.onNotesChange} onSaveToVault={props.onSaveNoteToVault} />
      <PanelPhotos
        entityType="task"
        entityId={task.id}
        entityContext={[task.title, task.notes?.split('\n')[0]].filter(Boolean).join(' — ')}
        promotions={{
          onAddPrepTask: props.onAddSubtask,
          onAddLink: props.onAddLink,
          onUseLocation: (address) => props.onUpdateLocation(address),
        }}
      />
      <PanelConversations taskId={task.id} />
      <PanelSubtasks
        subtasks={task.subtasks ?? []}
        onToggleSubtask={props.onToggleSubtask}
        onAddSubtask={props.onAddSubtask}
        onOpenSubtask={props.onOpenTask}
        onRemoveSubtask={props.onRemoveSubtask}
        onRescheduleSubtask={props.onRescheduleSubtask}
        onScheduleSubtask={props.onScheduleSubtask}
      />
      <PanelPeople
        contact={linked.contact}
        assignee={linked.assignee}
        onOpenContact={props.onOpenContact}
        onOpenMember={props.onOpenMember}
        contacts={props.contacts}
        onContactChange={props.onContactChange}
        onSearchContacts={props.onSearchContacts}
        onAddContact={props.onAddContact}
      />
      <PanelLinked
        project={linked.project}
        linkedEvent={linked.linkedEvent}
        siblingTasks={linked.siblingTasks}
        onOpenProject={props.onOpenProject}
        onOpenEvent={props.onOpenEvent}
        onOpenTask={props.onOpenTask}
      />
      <PanelLinks
        links={task.links}
        onAddLink={props.onAddLink}
      />
      <PanelMightBeRelevant items={mightBeRelevant} onOpen={props.onOpenRelated} />
      <PanelFooter
        createdAt={task.createdAt}
        updatedAt={task.updatedAt}
        createdByName={createdByName}
      />
      {assistOpen && (
        <AssistDrawer
          item={{
            id: task.id,
            title: task.title,
            notes: task.notes ?? null,
            projectName: linked.project?.name ?? null,
          }}
          onClose={() => setAssistOpen(false)}
          onMutate={props.onAssistMutate}
        />
      )}
    </article>
  )
}
