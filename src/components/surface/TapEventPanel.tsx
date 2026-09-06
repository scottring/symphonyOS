import { useRef, useState, useEffect } from 'react'

import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task, TaskLink } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelNotes } from './sections/PanelNotes'
import { PanelLinks } from './sections/PanelLinks'
import { PanelPhotos } from './sections/PanelPhotos'
import { PanelMightBeRelevant } from './sections/PanelMightBeRelevant'
import { PanelFooter } from './sections/PanelFooter'
import { useEntityRelations } from './hooks/useEntityRelations'
import type { MightBeRelevantItem } from './types'
import { PanelShell } from './PanelShell'
import { PanelActions, type PanelAction } from './sections/PanelActions'
import { PanelSection } from './sections/PanelSection'
import { PanelRow } from './sections/PanelRow'
import { SchedulePicker } from '@/components/schedule/SchedulePicker'
import { useDayLoads } from './hooks/useDayLoads'
import { PanelLocation } from './sections/PanelLocation'
import { locationLink } from '@/lib/locationLink'
import { ConceptIcon } from '@/lib/conceptIcons'
import { computeEventReschedule } from '@/lib/planning/planningReschedule'
import { AssistDrawer } from '@/components/assist/AssistDrawer'
import { useThreadUnread } from '@/hooks/useThreadUnread'
import { getRecurringBaseId } from '@/hooks/useHiddenCalendarEvents'
import { scopeForCalendarEvent } from '@/lib/scope'

interface TapEventPanelProps {
  event: CalendarEvent
  /** User's notes for the event (from event_notes table). */
  notes: string | undefined
  /** Links saved on this event (from event_notes table). */
  links?: TaskLink[]
  allTasks: Task[]

  /** Whether the event is marked done (actionable_instances, Symphony-side). */
  completed?: boolean
  /**
   * Toggle done/undone. Completion is Symphony state, not a Google write, so
   * it's offered even on read-only calendars. When omitted, the pill hides.
   */
  onToggleComplete?: () => void

  onClose: () => void
  onNotesChange: (next: string) => void
  onAddPrepTask: (title: string) => void
  onAddLink: (url: string) => void
  onOpenTask: (id: string) => void
  onOpenProject: (id: string) => void
  onOpenRelated: (kind: MightBeRelevantItem['kind'], id: string) => void
  /** Set/change/clear the event's location, syncing back to Google Calendar. */
  onUpdateEventLocation?: (googleEventId: string, location: string | null, calendarId?: string) => void
  /**
   * Rename the event, syncing back to Google Calendar (this instance only for
   * a recurring series). When omitted — or the calendar is read-only — the
   * title stays read-only and an edit attempt reverts.
   */
  onRenameEvent?: (nextTitle: string) => void
  /**
   * Move the event to a new start, keeping its original duration. Pushes back to
   * Google Calendar (this instance only for a recurring series). When omitted,
   * the Reschedule control is hidden.
   */
  onReschedule?: (startTime: Date, endTime: Date) => void
  /** The event's calendar, resolved by the caller from the Google calendar list.
   *  readOnly=true means Google will refuse writes — edit affordances hide. */
  calendarAccess?: { name: string | null; readOnly: boolean }
  /** Calendars this account can write to (for "Move to calendar"). */
  writableCalendars?: { id: string; summary: string }[]
  /** Move the event onto another (writable) calendar. */
  onMoveToCalendar?: (destinationCalendarId: string) => void
  /** Needs-discussion flag — surfaces on the family kiosk's For Discussion list. */
  discussion?: { flagged: boolean; note?: string }
  /** Flag/unflag this event for discussion. When omitted, the Discuss chip hides. */
  onToggleDiscussion?: (flagged: boolean) => void
  /** Save the discussion note ("what's the question?"). */
  onDiscussionNoteChange?: (note: string) => void
  /** Open the Discussion on mount (deep link from the Discussions inbox). */
  autoOpenDiscussion?: boolean
  /** Informational-only "free" flag: the kids just show up, nothing for a
   *  parent to do. When set, the Complete pill and prep-task input hide. */
  free?: boolean
  /** Toggle the free flag. When omitted, the Free pill hides. */
  onToggleFree?: (free: boolean) => void
  /** True when this event is part of a recurring series — toggling free
   *  writes the series note, so the pill's title says it applies to every occurrence. */
  freeAppliesToSeries?: boolean
}

type AnyEvent = { start_time?: string; startTime?: string; end_time?: string; endTime?: string }

function getStartTime(event: CalendarEvent): string | undefined {
  return (event as AnyEvent).start_time || (event as AnyEvent).startTime
}

function getEndTime(event: CalendarEvent): string | undefined {
  return (event as AnyEvent).end_time || (event as AnyEvent).endTime
}

const MINUTES_PER_DAY = 1440

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]
/**
 * A boarding stay or a trip is measured in days. Offering only 15–120 MINUTES
 * for one meant the menu's every option silently collapsed a five-day booking
 * to at most two hours — the control could destroy the event but never express
 * it.
 */
const MULTI_DAY_PRESETS = [1, 2, 3, 4, 5, 7].map((d) => d * MINUTES_PER_DAY)

function formatDuration(minutes: number): string {
  if (minutes >= MINUTES_PER_DAY) {
    const days = Math.floor(minutes / MINUTES_PER_DAY)
    const hours = Math.round((minutes % MINUTES_PER_DAY) / 60)
    const d = `${days} day${days === 1 ? '' : 's'}`
    return hours === 0 ? d : `${d} ${hours} hr`
  }
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/** Short day label for the far end of an event that crosses midnight. */
function formatDayShort(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Does this event end on a different calendar day than it starts? */
function spansDays(start?: string, end?: string): boolean {
  if (!start || !end) return false
  return new Date(start).toDateString() !== new Date(end).toDateString()
}

function formatDayLabel(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return 'Today'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function formatClock(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function TapEventPanel(props: TapEventPanelProps) {
  const { event, allTasks } = props
  const [showDirections, setShowDirections] = useState(false)
  const [showDurationMenu, setShowDurationMenu] = useState(false)
  const [prepDraft, setPrepDraft] = useState('')
  const [assistOpen, setAssistOpen] = useState(props.autoOpenDiscussion === true)
  useEffect(() => { if (props.autoOpenDiscussion) setAssistOpen(true) }, [props.autoOpenDiscussion])

  const relations = useEntityRelations({
    kind: 'event',
    entity: event,
    allTasks,
    allEvents: [],
    allProjects: [],
  })

  const startTime = getStartTime(event)
  const endTime = getEndTime(event)
  const eventId = event.google_event_id ?? event.id
  // One thread per series, not per instance — the same key the wall flag uses.
  const discussionBaseId = getRecurringBaseId(eventId)
  const discussionUnread = useThreadUnread('event', discussionBaseId)
  const calendarId = event.calendar_id ?? event.calendarId

  // Google refuses writes to view-only calendars — don't offer them.
  const readOnlyCalendar = props.calendarAccess?.readOnly === true
  const canEdit = !readOnlyCalendar
  const moveTargets = (props.writableCalendars ?? []).filter((c) => c.id !== (calendarId ?? ''))

  const discussionFlagged = props.discussion?.flagged === true

  // Current duration in minutes, when both ends are known.
  const durationMinutes =
    startTime && endTime
      ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
      : null

  // Keep the start, move the end. This pushes to Google Calendar via the same
  // channel a reschedule uses.
  const handleDurationChange = (minutes: number) => {
    if (!startTime) return
    const start = new Date(startTime)
    props.onReschedule?.(start, new Date(start.getTime() + minutes * 60000))
    setShowDurationMenu(false)
  }

  // Classify the location so a video meeting (Teams/Zoom/Meet) never renders
  // as a physical address with a Directions/Maps affordance.
  const locLink = locationLink(event.location, undefined, event.meeting_url ?? event.meetingUrl)
  const isPhysicalLocation = locLink.kind === 'maps'
  const joinUrl = locLink.kind === 'url' ? locLink.href : null
  const isVirtualMeeting = locLink.kind === 'url' || locLink.kind === 'virtual'

  // SchedulePopover yields the new start as a full Date; reuse the planning
  // reschedule math so the event keeps its original duration.
  const handleReschedule = (date: Date) => {
    const { startTime: newStart, endTime: newEnd } = computeEventReschedule(event, {
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
    })
    props.onReschedule?.(newStart, newEnd)
  }

  const commitPrepTask = () => {
    const title = prepDraft.trim()
    if (!title) return
    props.onAddPrepTask(title)
    setPrepDraft('')
  }

  // The whole panel accepts file drops — same reason as the task panel: the
  // Photos & files section alone is a small target and a miss navigates away.
  const panelRef = useRef<HTMLElement>(null)

  const dayLoads = useDayLoads({ tasks: props.allTasks ?? [], enabled: true })

  // The duration control owns its own popover, so it arrives as a rendered node
  // rather than a plain chip. Extracted verbatim from the old hand-built header.
  const durationMenu = durationMinutes === null ? null : (
            <div className="relative">
              <button
                onClick={() => setShowDurationMenu((v) => !v)}
                aria-expanded={showDurationMenu}
                aria-label="Change duration"
                className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
              >
                <ConceptIcon name="time" decorative /> {formatDuration(durationMinutes)} {showDurationMenu ? '▾' : '▸'}
              </button>
              {showDurationMenu && (
                <div className="absolute left-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-neutral-100 py-1 min-w-[7rem]">
                  {(durationMinutes >= MINUTES_PER_DAY ? MULTI_DAY_PRESETS : DURATION_PRESETS).map((m) => (
                    <button
                      key={m}
                      onClick={() => handleDurationChange(m)}
                      className={`block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-neutral-50 ${
                        m === durationMinutes ? 'text-primary-700 font-medium' : 'text-neutral-700'
                      }`}
                    >
                      {formatDuration(m)}
                    </button>
                  ))}
                </div>
              )}
            </div>
  )

  const actions: PanelAction[] = [
    ...(props.onToggleComplete && !props.free
      ? [{
          id: 'complete',
          label: props.completed ? 'Completed' : 'Complete',
          kind: (props.completed ? 'completed' : 'primary') as PanelAction['kind'],
          onClick: props.onToggleComplete,
        }]
      : []),
    ...(event.location && joinUrl
      ? [{ id: 'join', label: 'Join meeting', icon: 'video' as const, href: joinUrl }]
      : []),
    ...(event.location && isPhysicalLocation
      ? [{
          id: 'directions',
          label: 'Directions',
          icon: 'location' as const,
          onClick: () => setShowDirections((v) => !v),
        }]
      : []),
    ...(canEdit && props.onReschedule
      ? [{
          id: 'reschedule',
          label: 'Reschedule',
          render: () => (
            <SchedulePicker
              label="Reschedule"
              scheduledFor={startTime ? new Date(startTime) : undefined}
              onSchedule={(date) => handleReschedule(date)}
              loads={dayLoads}
            />
          ),
        }]
      : []),
    ...(canEdit && props.onReschedule && durationMinutes !== null && durationMinutes > 0
      ? [{ id: 'duration', label: formatDuration(durationMinutes), render: () => durationMenu }]
      : []),
    {
      id: 'discussion',
      label: 'Discussion',
      icon: 'discussion' as const,
      dot: discussionUnread,
      onClick: () => setAssistOpen(true),
    },
    ...(props.onToggleDiscussion
      ? [{
          id: 'discuss',
          label: discussionFlagged ? 'On the list' : 'Bring up',
          kind: (discussionFlagged ? 'flagged' : 'default') as PanelAction['kind'],
          pressed: discussionFlagged,
          title: discussionFlagged
            ? "Take it off the wall's For Discussion list"
            : "Bring up in person — adds it to the wall's For Discussion list",
          onClick: () => props.onToggleDiscussion?.(!discussionFlagged),
        }]
      : []),
    ...(props.onToggleFree
      ? [{
          id: 'free',
          label: 'Free',
          kind: (props.free ? 'flagged' : 'default') as PanelAction['kind'],
          pressed: !!props.free,
          title: 'The kids just show up — no prep, no handoff, nothing for a parent to do.'
            + (props.freeAppliesToSeries ? ' Applies to every occurrence.' : ''),
          onClick: () => props.onToggleFree?.(!props.free),
        }]
      : []),
  ]

  return (
    <PanelShell
      innerRef={panelRef}
      identity={
        // One wrapper, not a fragment: title, when-line and calendar row are a
        // single statement of what this event IS. As separate zone children the
        // shell's rhythm would rule between them and read as three facts.
        <div>
        <PanelHeader
          title={event.title}
          // Renames write through to Google, so they're only offered where
          // Google will accept the write; on a view-only calendar (or a host
          // that didn't wire renames) the edit reverts, matching the pill.
          onTitleChange={
            props.onRenameEvent && !readOnlyCalendar
              ? props.onRenameEvent
              : () => { /* event title is read-only */ }
          }
          onClose={props.onClose}
        />

        {/* When — the one fact that defines an event, stated plainly. */}
        {startTime && (
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-[15px] font-medium text-neutral-800">{formatDayLabel(startTime)}</span>
            {/* A multi-day event must name the day it ends on. Without it a
                five-day boarding stay read "8:00 AM – 8:00 AM", which looks
                like a bug rather than a fact about the event. */}
            <span className="text-[15px] text-neutral-600 tabular-nums">
              {formatClock(startTime)}
              {endTime
                ? spansDays(startTime, endTime)
                  ? ` – ${formatDayShort(endTime)}, ${formatClock(endTime)}`
                  : ` – ${formatClock(endTime)}`
                : ''}
            </span>
            {durationMinutes !== null && durationMinutes > 0 && (
              <span className="text-[13px] text-neutral-400">· {formatDuration(durationMinutes)}</span>
            )}
          </div>
        )}

        {/* Which calendar this event lives on + move / view-only affordance */}
        {props.calendarAccess && (
          <div className="mt-2 flex items-center gap-2 flex-wrap text-[13px]">
            <span className="text-neutral-500">
              {props.calendarAccess.name ?? 'Primary calendar'}
            </span>
            {readOnlyCalendar ? (
              <span
                className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-[11px] font-medium"
                title="This calendar is shared with you view-only — Google doesn't allow Symphony (or you) to change its events"
              >
                view-only
              </span>
            ) : (
              props.onMoveToCalendar && moveTargets.length > 0 && (
                <select
                  aria-label="Move to calendar"
                  value=""
                  onChange={(e) => { if (e.target.value) props.onMoveToCalendar?.(e.target.value) }}
                  className="text-[12px] text-neutral-500 bg-transparent border border-neutral-200 rounded-md px-1.5 py-0.5 hover:border-neutral-300 focus:outline-none"
                >
                  <option value="">Move to…</option>
                  {moveTargets.map((c) => (
                    <option key={c.id} value={c.id}>{c.summary}</option>
                  ))}
                </select>
              )
            )}
          </div>
        )}

          {event.location && isVirtualMeeting && !joinUrl && (
            <div className="mt-2 text-[13px] text-neutral-500">{event.location}</div>
          )}
        </div>
      }
      act={<PanelActions actions={actions} />}
      details={
        <>
          {/* Location editor: for physical addresses or to add one. A virtual
              meeting is handled by the Join chip above, not a Places field. */}
          {!isVirtualMeeting && (
            <PanelLocation
              location={event.location ?? undefined}
              title={event.title}
              showDirections={isPhysicalLocation && showDirections}
              onUpdateLocation={(addr) => props.onUpdateEventLocation?.(eventId, addr, calendarId)}
              onClearLocation={() => props.onUpdateEventLocation?.(eventId, null, calendarId)}
            />
          )}

          <PanelNotes
            key={event.id}
            notes={props.notes}
            onChange={props.onNotesChange}
            label="What to bring"
            id="what-to-bring"
          />

          {discussionFlagged && props.onDiscussionNoteChange && (
            <PanelSection
              id="for-discussion"
              label="For discussion"
              preview={props.discussion?.note || undefined}
            >
              <textarea
                key={eventId}
                defaultValue={props.discussion?.note ?? ''}
                onBlur={(e) => {
                  if ((e.target.value || '') !== (props.discussion?.note ?? '')) {
                    props.onDiscussionNoteChange?.(e.target.value)
                  }
                }}
                placeholder="What's the question?"
                rows={2}
                className="w-full px-2 py-1.5 text-sm rounded-md bg-white text-neutral-700 placeholder:text-neutral-400 shadow-[inset_0_0_0_1px_#e5e7eb] focus:outline-none focus:shadow-[inset_0_0_0_1px_#d97706] resize-none"
              />
            </PanelSection>
          )}

          {/* Prep tasks are the event's subtasks — real tasks linked to this event. */}
          <PanelSection
            id="prep-tasks"
            label="Prep tasks"
            preview={relations.tasks.length ? `${relations.tasks.length} task${relations.tasks.length === 1 ? '' : 's'}` : undefined}
          >
            <div className="flex flex-col gap-1.5">
              {relations.tasks.map((t) => (
                <PanelRow
                  key={t.id}
                  onClick={() => props.onOpenTask(t.id)}
                  icon={<span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100"><ConceptIcon name="list" decorative /></span>}
                >
                  <span className="block text-sm text-neutral-800">{t.title}</span>
                </PanelRow>
              ))}
              {!props.free && (
                <input
                  type="text"
                  value={prepDraft}
                  onChange={(e) => setPrepDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitPrepTask() }}
                  onBlur={commitPrepTask}
                  placeholder="+ Add a prep task…"
                  className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
                />
              )}
            </div>
          </PanelSection>

          {/* Attachments key on the stable Google event id (the same key event
              notes use), under the 'event_note' entity type the table allows. */}
          <PanelPhotos
            entityType="event_note"
            entityId={eventId}
            dropZoneRef={panelRef}
            entityContext={[event.title, startTime && new Date(startTime).toLocaleString(), event.location].filter(Boolean).join(' — ')}
            promotions={{
              onAddPrepTask: props.onAddPrepTask,
              onAddLink: props.onAddLink,
              onUseLocation: props.onUpdateEventLocation && canEdit
                ? (address) => props.onUpdateEventLocation!(eventId, address, calendarId)
                : undefined,
            }}
          />

          <PanelLinks links={props.links} onAddLink={props.onAddLink} />
        </>
      }
      related={<PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />}
      footer={
        /* Events carry no created/updated timestamps; show the start time. */
        startTime ? <PanelFooter createdAt={new Date(startTime)} updatedAt={new Date(startTime)} /> : undefined
      }
    >
      {assistOpen && (
        <AssistDrawer
          item={{ id: eventId, title: event.title, notes: props.notes ?? null }}
          discuss={{ type: 'event', id: discussionBaseId, title: event.title, scope: scopeForCalendarEvent() }}
          onClose={() => setAssistOpen(false)}
        />
      )}
    </PanelShell>
  )
}
