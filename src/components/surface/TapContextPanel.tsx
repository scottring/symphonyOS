import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelActions } from './sections/PanelActions'
import { PanelWhy } from './sections/PanelWhy'
import { PanelPeople } from './sections/PanelPeople'
import { PanelLinked } from './sections/PanelLinked'
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
}

function contextToDomain(ctx: TaskContext | null | undefined): 'work' | 'family' | 'personal' | undefined {
  if (ctx === 'work' || ctx === 'family' || ctx === 'personal') return ctx
  return undefined
}

export function TapContextPanel(props: TapContextPanelProps) {
  const { task, allTasks, createdByName } = props

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
        scheduledFor={task.scheduledFor || undefined}
        isAllDay={task.isAllDay}
        isPinned={props.isPinned}
        onToggleComplete={props.onToggleComplete}
        onSchedule={props.onSchedule}
        onClearSchedule={props.onClearSchedule}
        onTogglePin={props.onTogglePin}
        onDelete={props.onDelete}
      />
      <PanelWhy notes={task.notes} onChange={props.onNotesChange} />
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
      <PanelMightBeRelevant items={mightBeRelevant} onOpen={props.onOpenRelated} />
      <PanelFooter
        createdAt={task.createdAt}
        updatedAt={task.updatedAt}
        createdByName={createdByName}
      />
    </article>
  )
}
