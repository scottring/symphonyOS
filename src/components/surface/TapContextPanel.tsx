import { useState } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelActions } from './sections/PanelActions'
import { PanelWhy } from './sections/PanelWhy'
import { PanelSubtasks } from './sections/PanelSubtasks'
import { PanelPeople } from './sections/PanelPeople'
import { PanelLinked } from './sections/PanelLinked'
import { PanelLinks } from './sections/PanelLinks'
import { PanelLocation } from './sections/PanelLocation'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useLinkedEntities } from './hooks/useLinkedEntities'
import { useMightBeRelevant } from './hooks/useMightBeRelevant'
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
  onAddLink: (url: string) => void
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
}

function contextToDomain(ctx: TaskContext | null | undefined): 'work' | 'family' | 'personal' | undefined {
  if (ctx === 'work' || ctx === 'family' || ctx === 'personal') return ctx
  return undefined
}

export function TapContextPanel(props: TapContextPanelProps) {
  const { task, allTasks, createdByName } = props

  const [showDirections, setShowDirections] = useState(false)

  // Collapse the directions builder when switching to a different task
  // (React-recommended "adjust state during render" pattern, not an effect).
  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setShowDirections(false)
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
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={task.title}
        onTitleChange={props.onTitleChange}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={task.bucket || 'inbox'}
        assigneeName={linked.assignee?.name}
        createdByName={createdByName}
        domain={contextToDomain(task.context)}
      />
      <PanelActions
        completed={task.completed}
        phoneNumber={task.phoneNumber || linked.contact?.phone}
        location={task.location}
        onShowDirections={() => setShowDirections((v) => !v)}
        scheduledFor={task.scheduledFor || undefined}
        isAllDay={task.isAllDay}
        isPinned={props.isPinned}
        onToggleComplete={props.onToggleComplete}
        onSchedule={props.onSchedule}
        onClearSchedule={props.onClearSchedule}
        onTogglePin={props.onTogglePin}
        onDelete={props.onDelete}
      />
      <PanelLocation
        location={task.location}
        locationPlaceId={task.locationPlaceId}
        title={task.title}
        showDirections={showDirections}
        onUpdateLocation={props.onUpdateLocation}
        onClearLocation={props.onClearLocation}
      />
      <PanelWhy key={task.id} label="Notes" notes={task.notes} onChange={props.onNotesChange} onSaveToVault={props.onSaveNoteToVault} />
      <PanelSubtasks
        subtasks={task.subtasks ?? []}
        onToggleSubtask={props.onToggleSubtask}
        onAddSubtask={props.onAddSubtask}
      />
      <PanelPeople
        contact={linked.contact}
        assignee={linked.assignee}
        onOpenContact={props.onOpenContact}
        onOpenMember={props.onOpenMember}
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
    </article>
  )
}
