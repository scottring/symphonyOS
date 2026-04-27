import { useMemo, useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { Task } from '@/types/task'
import type { TaskBucket } from '@/types/task'
import type { Project } from '@/types/project'
import { useScheduleActionsContext } from '@/contexts/ScheduleActionsContext'
import { useDomain } from '@/hooks/useDomain'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { InboxTaskCard } from './InboxTaskCard'

// ═══════════════════════════════════════════════════════════════
// Drop zone configuration
// ═══════════════════════════════════════════════════════════════

interface DropZoneConfig {
  id: string
  label: string
  sublabel: string
  icon: React.ReactNode
  accentClass: string      // border/ring when active
  hoverBgClass: string     // background when dragging over
  dotClass: string         // header dot color
}

const DROP_ZONES: DropZoneConfig[] = [
  {
    id: 'today',
    label: 'Today',
    sublabel: 'Do it now',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.828a1 1 0 101.415-1.414L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
    accentClass: 'border-primary-400 ring-primary-100',
    hoverBgClass: 'bg-primary-50/60',
    dotClass: 'bg-primary-400',
  },
  {
    id: 'week',
    label: 'This Week',
    sublabel: 'Soon',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
      </svg>
    ),
    accentClass: 'border-blue-400 ring-blue-100',
    hoverBgClass: 'bg-blue-50/60',
    dotClass: 'bg-blue-400',
  },
  {
    id: 'month',
    label: 'This Month',
    sublabel: 'Eventually',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
      </svg>
    ),
    accentClass: 'border-violet-400 ring-violet-100',
    hoverBgClass: 'bg-violet-50/60',
    dotClass: 'bg-violet-400',
  },
  {
    id: 'quarter',
    label: 'Someday',
    sublabel: 'No rush',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
      </svg>
    ),
    accentClass: 'border-amber-400 ring-amber-100',
    hoverBgClass: 'bg-amber-50/60',
    dotClass: 'bg-amber-400',
  },
]

// ═══════════════════════════════════════════════════════════════
// Draggable task card wrapper
// ═══════════════════════════════════════════════════════════════

function DraggableInboxCard({
  task,
  children,
}: {
  task: Task
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`touch-none transition-all duration-200 ${
        isDragging ? 'opacity-30 scale-[0.97]' : ''
      }`}
      style={{ WebkitTouchCallout: 'none' }}
    >
      {children}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Droppable bucket zone
// ═══════════════════════════════════════════════════════════════

function BucketDropZone({
  config,
  count,
  isDraggingActive,
  children,
}: {
  config: DropZoneConfig
  count: number
  isDraggingActive: boolean
  children?: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `bucket-${config.id}` })

  return (
    <div
      ref={setNodeRef}
      className={`
        rounded-2xl border-2 transition-all duration-300 ease-out min-h-[5rem]
        ${isOver
          ? `${config.accentClass} ${config.hoverBgClass} ring-4 scale-[1.01] shadow-lg border-solid`
          : isDraggingActive
            ? 'border-dashed border-neutral-300 bg-neutral-50/40 shadow-sm'
            : count > 0
              ? 'border-transparent bg-transparent'
              : 'border-transparent'
        }
      `}
    >
      {/* Zone header */}
      {(count > 0 || isDraggingActive) && (
        <div className={`
          flex items-center gap-2 px-3 pt-3 pb-1
          transition-colors duration-200
          ${isOver ? 'text-neutral-700' : 'text-neutral-400'}
        `}>
          <span className={`block w-2 h-2 rounded-full transition-colors ${isOver ? config.dotClass : count > 0 ? config.dotClass : 'bg-neutral-300'}`} />
          <h3 className="font-display text-xs tracking-wide uppercase font-medium">
            {config.label}
          </h3>
          {count > 0 && (
            <span className="text-xs text-neutral-400">({count})</span>
          )}
          {isOver && (
            <span className="ml-auto text-xs font-medium text-neutral-500 animate-pulse">
              Drop here
            </span>
          )}
        </div>
      )}

      {/* Empty drop target — shown when no items and currently dragging */}
      {count === 0 && isDraggingActive && (
        <div className={`flex flex-col items-center justify-center py-5 gap-1.5 transition-all duration-200 ${isOver ? '' : 'opacity-60'}`}>
          <span className={`rounded-full p-2 transition-colors ${isOver ? config.hoverBgClass : 'bg-neutral-100'}`}>
            <span className={isOver ? 'text-neutral-700' : 'text-neutral-400'}>{config.icon}</span>
          </span>
          <span className={`text-xs font-medium transition-colors ${isOver ? 'text-neutral-600' : 'text-neutral-400'}`}>{config.sublabel}</span>
        </div>
      )}

      {/* Existing items */}
      {count > 0 && (
        <div className="space-y-2 px-1 pb-2 pt-1">
          {children}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Inbox section as drop target (for dragging items back to inbox)
// ═══════════════════════════════════════════════════════════════

function InboxDropSection({
  isDraggingActive,
  children,
}: {
  isDraggingActive: boolean
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id: 'bucket-inbox' })

  return (
    <section
      ref={setNodeRef}
      className={`
        rounded-2xl transition-all duration-300 -mx-2 px-2 py-1
        ${isOver
          ? 'bg-neutral-100/60 ring-2 ring-neutral-300'
          : isDraggingActive
            ? 'bg-transparent'
            : ''
        }
      `}
    >
      {children}
    </section>
  )
}

// ═══════════════════════════════════════════════════════════════
// Main InboxView
// ═══════════════════════════════════════════════════════════════

interface InboxViewProps {
  tasks: Task[]
  projects: Project[]
  selectedItemId: string | null
  onSelectItem: (id: string | null) => void
  panelOpen: boolean
  onClosePanel: () => void
  currentUserMemberId?: string
}

export function InboxView({
  tasks,
  projects,
  selectedItemId,
  onSelectItem,
  panelOpen,
  onClosePanel,
  currentUserMemberId,
}: InboxViewProps) {
  const {
    onToggleWaiting, onUpdateTask, onPushTask,
    onAssignTaskAll,
    familyMembers = [],
    lists = [], listsByCategory, onSendToList, onCreateList,
    onOpenProject,
  } = useScheduleActionsContext()

  const { currentDomain } = useDomain()

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)

  // Sensors: require slight movement before drag starts (prevents accidental drags on tap)
  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 6 } })
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  const sensors = useSensors(mouseSensor, touchSensor)

  // Domain + privacy filtering
  const filteredByDomain = useMemo(() => {
    return tasks.filter(task => {
      if (currentUserMemberId && (task.context === 'work' || task.context === 'personal')) {
        const assignee = task.assignedTo || (task.assignedToAll?.[0])
        if (assignee && assignee !== currentUserMemberId) return false
      }
      if (currentDomain === 'universal') return true
      if (task.bucket === 'inbox' && !task.completed) return true
      return task.context === currentDomain
    })
  }, [tasks, currentDomain, currentUserMemberId])

  // Assignee filter
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])

  const filteredTasks = useMemo(() => {
    if (selectedAssignees.length === 0) return filteredByDomain
    return filteredByDomain.filter(task => {
      if (selectedAssignees.includes('unassigned')) {
        return !task.assignedTo && (!task.assignedToAll || task.assignedToAll.length === 0)
      }
      return selectedAssignees.some(id =>
        task.assignedTo === id || task.assignedToAll?.includes(id)
      )
    })
  }, [filteredByDomain, selectedAssignees])

  const hasUnassignedTasks = useMemo(() => {
    return filteredByDomain.some(t =>
      !t.completed && !t.assignedTo && (!t.assignedToAll || t.assignedToAll.length === 0)
    )
  }, [filteredByDomain])

  // Bucket task lists
  const sortByCreated = (a: Task, b: Task) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

  const inboxTasks = useMemo(() =>
    filteredTasks.filter(t => !t.completed && t.bucket === 'inbox').sort(sortByCreated),
    [filteredTasks])

  const weekTasks = useMemo(() =>
    filteredTasks.filter(t => !t.completed && t.bucket === 'week').sort(sortByCreated),
    [filteredTasks])

  const monthTasks = useMemo(() =>
    filteredTasks.filter(t => !t.completed && t.bucket === 'month').sort(sortByCreated),
    [filteredTasks])

  const quarterTasks = useMemo(() =>
    filteredTasks.filter(t => !t.completed && t.bucket === 'quarter').sort(sortByCreated),
    [filteredTasks])

  const bucketTasksMap: Record<string, Task[]> = {
    today: [], // "today" is not a stored bucket — it means schedule for today
    week: weekTasks,
    month: monthTasks,
    quarter: quarterTasks,
  }

  const handleSelectTask = useCallback((taskId: string) => {
    onSelectItem(`task-${taskId}`)
  }, [onSelectItem])

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = event
    if (!over || !onPushTask) return

    const taskId = active.id as string
    const dropTarget = (over.id as string).replace('bucket-', '')

    // Find which bucket this task currently lives in
    const task = filteredTasks.find(t => t.id === taskId)
    if (!task) return

    // Don't do anything if dropping back into same bucket
    const currentBucket = task.bucket || 'inbox'
    if (dropTarget === currentBucket) return
    // "today" means schedule for today as all-day
    if (dropTarget === 'today' && currentBucket === 'timed') return

    if (dropTarget === 'today') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      onPushTask(taskId, today)
    } else if (dropTarget === 'inbox') {
      // Return to inbox
      onUpdateTask?.(taskId, { bucket: 'inbox' as TaskBucket, scheduledFor: undefined })
    } else if (dropTarget === 'week' || dropTarget === 'month' || dropTarget === 'quarter') {
      onPushTask(taskId, dropTarget)
    }
  }, [onPushTask, onUpdateTask, filteredTasks])

  const handleDragCancel = useCallback(() => {
    setActiveId(null)
  }, [])

  // Find active task for DragOverlay
  const activeTask = activeId ? filteredTasks.find(t => t.id === activeId) : null

  const totalCount = inboxTasks.length + weekTasks.length + monthTasks.length + quarterTasks.length
  const isDragging = activeId !== null

  // Shared task card renderer.
  // `compact` is true when rendering inside narrow bucket drop-zones (This Week,
  // This Month, Someday) — hides triage actions and avatars so the title has room.
  const renderTaskCard = (task: Task, compact = false) => (
    <InboxTaskCard
      key={task.id}
      task={task}
      onUpdate={(updates) => onUpdateTask?.(task.id, updates)}
      onToggleWaiting={onToggleWaiting ? () => onToggleWaiting(task.id) : undefined}
      onSelect={() => handleSelectTask(task.id)}
      onDefer={(target) => onPushTask?.(task.id, target)}
      projects={projects}
      onOpenProject={onOpenProject}
      familyMembers={familyMembers}
      onAssignTaskAll={onAssignTaskAll ? (memberIds) => onAssignTaskAll(task.id, memberIds) : undefined}
      lists={lists}
      listsByCategory={listsByCategory}
      onSendToList={onSendToList ? (listId) => onSendToList(task.id, listId) : undefined}
      onCreateList={onCreateList}
      panelOpen={panelOpen && selectedItemId === `task-${task.id}`}
      onClosePanel={onClosePanel}
      compact={compact}
    />
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-full overflow-y-auto px-4 md:px-6 py-6">
        <header className="mb-6">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold text-neutral-800">Inbox</h1>
            {familyMembers.length > 0 && (
              <AssigneeFilter
                selectedAssignees={selectedAssignees}
                onSelectAssignees={setSelectedAssignees}
                assigneesWithTasks={familyMembers}
                hasUnassignedTasks={hasUnassignedTasks}
              />
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {totalCount === 0
              ? 'All clear — nothing to triage'
              : `${totalCount} item${totalCount !== 1 ? 's' : ''} to triage`
            }
          </p>
        </header>

        {totalCount === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="font-display text-xl text-neutral-700 mb-2">Inbox zero</p>
            <p className="text-neutral-500">Press <kbd className="px-2 py-1 bg-neutral-100 rounded-md text-xs font-mono">Cmd+K</kbd> to capture something</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* ─── Inbox: draggable source items (also a drop target for returning items) ─── */}
            {inboxTasks.length > 0 && (
              <InboxDropSection isDraggingActive={isDragging}>
                <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clipRule="evenodd" />
                  </svg>
                  New ({inboxTasks.length})
                  {isDragging && (
                    <span className="ml-2 text-[10px] text-neutral-300 font-normal normal-case tracking-normal animate-pulse">
                      drag to a bucket below
                    </span>
                  )}
                </h2>
                <div className="space-y-2">
                  {inboxTasks.map(task => (
                    <DraggableInboxCard key={task.id} task={task}>
                      {renderTaskCard(task)}
                    </DraggableInboxCard>
                  ))}
                </div>
              </InboxDropSection>
            )}

            {/* ─── Drop zone grid ─── */}
            {/* Show when: dragging OR any bucket has items */}
            {(isDragging || weekTasks.length > 0 || monthTasks.length > 0 || quarterTasks.length > 0) && (
              <>
                {isDragging && inboxTasks.length > 0 && (
                  <div className="h-px bg-gradient-to-r from-transparent via-neutral-200 to-transparent" />
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {DROP_ZONES.map(zone => (
                    <BucketDropZone
                      key={zone.id}
                      config={zone}
                      count={bucketTasksMap[zone.id]?.length ?? 0}
                      isDraggingActive={isDragging}
                    >
                      {(bucketTasksMap[zone.id] ?? []).map(task => (
                        <DraggableInboxCard key={task.id} task={task}>
                          {renderTaskCard(task, true)}
                        </DraggableInboxCard>
                      ))}
                    </BucketDropZone>
                  ))}
                </div>
              </>
            )}

            {/* ─── Non-dragging bucket lists (when not in grid layout) ─── */}
            {/* These show as traditional stacked sections when there are bucket items but no drag */}
          </div>
        )}
      </div>

      {/* ─── Drag overlay: floating card that follows cursor ─── */}
      <DragOverlay dropAnimation={{
        duration: 250,
        easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
      }}>
        {activeTask && (
          <div className="opacity-95 rotate-[1.5deg] scale-[1.03] shadow-xl rounded-xl pointer-events-none">
            {renderTaskCard(activeTask)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
