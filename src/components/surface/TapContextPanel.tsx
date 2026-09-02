import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Task, TaskContext } from '@/types/task'
import type { Contact } from '@/types/contact'
import type { Project } from '@/types/project'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { FamilyMember } from '@/types/family'
import { PanelShell } from './PanelShell'
import { PanelHeader } from './sections/PanelHeader'
import { PanelActions, type PanelAction } from './sections/PanelActions'
import { PanelMoreMenu } from './sections/PanelMoreMenu'
import { SchedulePicker } from '@/components/schedule/SchedulePicker'
import { useDayLoads } from './hooks/useDayLoads'
import { PanelAssistant } from './sections/PanelAssistant'
import { PanelNotes } from './sections/PanelNotes'
import { PanelSubtasks } from './sections/PanelSubtasks'
import { PanelPeople } from './sections/PanelPeople'
import { PanelLinked } from './sections/PanelLinked'
import { PanelLinks } from './sections/PanelLinks'
import { PanelPhotos } from './sections/PanelPhotos'
import { PanelConversations } from './sections/PanelConversations'
import { PanelLocation } from './sections/PanelLocation'
import { PanelAddRow, type AddableField } from './sections/PanelAddRow'
import { PanelReach } from './sections/PanelReach'
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
  /** Set/clear the tap-to-call number carried by this task. */
  onPhoneChange: (next: string | undefined) => void
  /** Set/clear the tap-to-mail address carried by this task. */
  onEmailChange: (next: string | undefined) => void
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
  /** Persist the task's route (origin/stops/mode). Omit to keep directions ephemeral. */
  onDirectionsChange?: (directions: import('@/types/directions').TaskDirections) => void
  onContextChange: (context: TaskContext | undefined) => void
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

  // Which empty fields the user asked to fill in. Cleared when the panel
  // switches tasks — revealing Notes on one task shouldn't open it on the next.
  const [revealed, setRevealed] = useState<Set<AddableField>>(() => new Set())
  // Attachments are fetched inside PanelPhotos; it reports up so the Add row
  // knows whether to offer "Photo".
  const [photosHaveContent, setPhotosHaveContent] = useState(false)
  const reveal = useCallback((field: AddableField) => {
    setRevealed((prev) => new Set(prev).add(field))
  }, [])

  // Reset per-task panel state when switching tasks (React-recommended
  // "adjust state during render" pattern, not an effect).
  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setShowDirections(false)
    setAssistOpen(false)
    setRevealed(new Set())
    setPhotosHaveContent(false)
  }

  const linked = useLinkedEntities(task, {
    contacts: props.contacts,
    projects: props.projects,
    events: props.events,
    familyMembers: props.familyMembers,
    siblingTaskCandidates: props.siblingTaskCandidates,
  })

  const mightBeRelevant = useMightBeRelevant(task, { allTasks })

  // A section earns its header by having something in it. Everything else
  // collapses into the single Add row near the bottom.
  const has = {
    phone: !!task.phoneNumber,
    email: !!task.email,
    location: !!(task.location || task.locationPlaceId),
    notes: !!task.notes?.trim(),
    subtask: (task.subtasks?.length ?? 0) > 0,
    link: (task.links?.length ?? 0) > 0,
    person: !!linked.contact,
    // Photos load inside PanelPhotos, so emptiness isn't knowable here — that
    // section hides itself and reports back.
    photo: photosHaveContent,
  }
  const show = (field: AddableField): boolean => has[field] || revealed.has(field)
  const addable = (['phone', 'email', 'location', 'notes', 'photo', 'subtask', 'link', 'person'] as const)
    .filter((f) => !show(f))

  // The whole panel accepts file drops, not just the Photos & files section
  // — that section was 16% of the panel, and a miss navigated the tab to
  // the file instead of attaching it.
  const panelRef = useRef<HTMLElement>(null)

  const dayLoads = useDayLoads({ tasks: allTasks, enabled: true })

  const phone = task.phoneNumber || linked.contact?.phone || linked.project?.phoneNumber
  const hasGroup = (task.subtasks?.length ?? 0) > 0

  // Fixed order — complete, then how to reach it, then when, then help. The
  // renderer folds anything past the fifth into its overflow menu.
  const actions: PanelAction[] = [
    {
      id: 'complete',
      label: task.completed ? 'Completed' : 'Complete',
      kind: task.completed ? 'completed' : 'primary',
      onClick: props.onToggleComplete,
    },
    ...(phone ? [{ id: 'call', label: phone, icon: 'call' as const, href: `tel:${phone}` }] : []),
    ...(task.location
      ? [{
          id: 'directions',
          label: 'Directions',
          icon: 'location' as const,
          onClick: () => setShowDirections((v) => !v),
        }]
      : []),
    {
      id: 'schedule',
      label: 'Schedule',
      render: () => (
        <SchedulePicker
          scheduledFor={task.scheduledFor || undefined}
          onSchedule={props.onSchedule}
          onReschedule={props.onReschedule}
          onClearSchedule={props.onClearSchedule}
          loads={dayLoads}
        />
      ),
    },
    ...(props.onAssistMutate
      ? [{
          id: 'assist',
          label: 'Help me plan',
          icon: 'ai' as const,
          onClick: () => setAssistOpen(true),
        }]
      : []),
  ]

  return (
    <PanelShell
      innerRef={panelRef}
      identity={
        <>
          <PanelHeader
            title={task.title}
            onTitleChange={props.onTitleChange}
            onClose={props.onClose}
          />
          {/* The read-only "FAMILY · timed · for Iris" meta row was removed — it
              duplicated (in jargon) the interactive context chooser + who-picker
              below. The why-chain stays. */}
          {props.whyChain}
        </>
      }
      act={
        <>
          <PanelActions
            actions={actions}
            overflow={
              <PanelMoreMenu
                isPinned={props.isPinned}
                onTogglePin={props.onTogglePin}
                onDelete={props.onDelete}
                onUngroup={hasGroup ? props.onUngroup : undefined}
                onDeleteGroup={hasGroup ? props.onDeleteGroup : undefined}
              />
            }
          />
          <PanelAssistant taskId={task.id} />
        </>
      }
      classify={
        <PanelClassify
          context={task.context}
          onContextChange={props.onContextChange}
          members={props.familyMembers}
          selectedAssigneeIds={task.assignedToAll ?? (task.assignedTo ? [task.assignedTo] : [])}
          onAssigneesChange={props.onAssigneesChange}
        />
      }
      details={
        <>
          {show('phone') && (
            <PanelReach
              kind="phone"
              value={task.phoneNumber}
              onChange={props.onPhoneChange}
              autoFocus={revealed.has('phone')}
              asLink={false}
            />
          )}
          {show('email') && (
            <PanelReach
              kind="email"
              value={task.email}
              onChange={props.onEmailChange}
              autoFocus={revealed.has('email')}
            />
          )}
          {show('location') && (
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
          )}
          {show('notes') && (
            <PanelNotes
              key={task.id}
              label="Notes"
              notes={task.notes}
              onChange={props.onNotesChange}
              onSaveToVault={props.onSaveNoteToVault}
            />
          )}
          <PanelPhotos
            hideWhenEmpty={!revealed.has('photo')}
            onContentChange={setPhotosHaveContent}
            entityType="task"
            entityId={task.id}
            dropZoneRef={panelRef}
            entityContext={[task.title, task.notes?.split('\n')[0]].filter(Boolean).join(' — ')}
            promotions={{
              onAddPrepTask: props.onAddSubtask,
              onAddLink: props.onAddLink,
              onUseLocation: (address) => props.onUpdateLocation(address),
            }}
          />
          <PanelConversations taskId={task.id} />
          {show('subtask') && (
            <PanelSubtasks
              subtasks={task.subtasks ?? []}
              onToggleSubtask={props.onToggleSubtask}
              onAddSubtask={props.onAddSubtask}
              onOpenSubtask={props.onOpenTask}
              onRemoveSubtask={props.onRemoveSubtask}
              onRescheduleSubtask={props.onRescheduleSubtask}
              onScheduleSubtask={props.onScheduleSubtask}
            />
          )}
          {show('person') && (
            <PanelPeople
              contact={linked.contact}
              onOpenContact={props.onOpenContact}
              contacts={props.contacts}
              onContactChange={props.onContactChange}
              onSearchContacts={props.onSearchContacts}
              onAddContact={props.onAddContact}
            />
          )}
          {show('link') && <PanelLinks links={task.links} onAddLink={props.onAddLink} />}
          {/* The tail of the details list, not a zone of its own: every field
              the task doesn't carry yet, as one quiet row. */}
          <PanelAddRow fields={addable} onReveal={reveal} />
        </>
      }
      related={
        <>
          <PanelLinked
            linkedEvent={linked.linkedEvent}
            siblingTasks={linked.siblingTasks}
            onOpenEvent={props.onOpenEvent}
            onOpenTask={props.onOpenTask}
          />
          <PanelMightBeRelevant items={mightBeRelevant} onOpen={props.onOpenRelated} />
        </>
      }
      footer={
        <PanelFooter
          createdAt={task.createdAt}
          updatedAt={task.updatedAt}
          createdByName={createdByName}
        />
      }
    >
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
    </PanelShell>
  )
}
