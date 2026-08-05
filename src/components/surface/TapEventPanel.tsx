import { useRef, useState } from 'react'
import { Check, MessageSquare, Video } from 'lucide-react'
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
import { PanelLocation } from './sections/PanelLocation'
import { locationLink } from '@/lib/locationLink'
import { ConceptIcon } from '@/lib/conceptIcons'
import { SchedulePopover } from '@/components/triage/SchedulePopover'
import { computeEventReschedule } from '@/components/planning/planningReschedule'

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
}

type AnyEvent = { start_time?: string; startTime?: string; end_time?: string; endTime?: string }

function getStartTime(event: CalendarEvent): string | undefined {
  return (event as AnyEvent).start_time || (event as AnyEvent).startTime
}

function getEndTime(event: CalendarEvent): string | undefined {
  return (event as AnyEvent).end_time || (event as AnyEvent).endTime
}

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120]

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
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

  return (
    // Same section rhythm as the task panel (TapContextPanel): hairline dividers
    // with even vertical padding, so grouped blocks never scrunch together.
    <article
      ref={panelRef}
      className="
        bg-bg-elevated max-w-md w-full
        rounded-2xl
        px-4 md:px-5 py-3 md:py-5
        divide-y divide-neutral-200/60
        [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0
      "
    >
      {/* Identity block: title, when, calendar, and the action chips read as one unit. */}
      <header>
        <PanelHeader
          title={event.title}
          onTitleChange={() => { /* event title is read-only from gcal */ }}
          onClose={props.onClose}
        />

        {/* When — the one fact that defines an event, stated plainly. */}
        {startTime && (
          <div className="mt-1.5 flex items-baseline gap-2 flex-wrap">
            <span className="text-[15px] font-medium text-neutral-800">{formatDayLabel(startTime)}</span>
            <span className="text-[15px] text-neutral-600 tabular-nums">
              {formatClock(startTime)}
              {endTime ? ` – ${formatClock(endTime)}` : ''}
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

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Mark done — same pill as the task panel (PanelActions): outline when
              open, greyed + checked when done (click to reopen). */}
          {props.onToggleComplete && (
            <button
              onClick={props.onToggleComplete}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                props.completed
                  ? 'border-neutral-200 bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                  : 'border-primary-600 text-primary-700 hover:bg-primary-50'
              }`}
            >
              {props.completed ? <><Check className="w-4 h-4" /> Completed</> : 'Complete'}
            </button>
          )}
          {/* Physical address → Directions toggle. Video meeting → Join link (or a
              non-clickable label when no join URL is known). Never offer directions
              to a Teams/Zoom/Meet "location". */}
          {event.location && isPhysicalLocation && (
            <button
              onClick={() => setShowDirections((v) => !v)}
              aria-expanded={showDirections}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors"
            >
              <ConceptIcon name="location" decorative /> Directions {showDirections ? '▾' : '▸'}
            </button>
          )}
          {event.location && joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <Video className="w-4 h-4" aria-hidden /> Join meeting
            </a>
          )}
          {event.location && isVirtualMeeting && !joinUrl && (
            <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-500">
              {event.location}
            </span>
          )}
          {canEdit && props.onReschedule && (
            <SchedulePopover
              value={startTime ? new Date(startTime) : undefined}
              onSchedule={handleReschedule}
              itemTitle={event.title}
              trigger={
                <button className="px-3 py-1.5 rounded-lg text-sm font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors">
                  <ConceptIcon name="when" decorative /> Reschedule
                </button>
              }
            />
          )}
          {canEdit && props.onReschedule && durationMinutes !== null && durationMinutes > 0 && (
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
                  {DURATION_PRESETS.map((m) => (
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
          )}
          {props.onToggleDiscussion && (
            <button
              onClick={() => props.onToggleDiscussion?.(!discussionFlagged)}
              aria-pressed={discussionFlagged}
              title={discussionFlagged
                ? 'Remove from the For Discussion list'
                : 'Flag to talk through together — shows on the For Discussion list'}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                discussionFlagged
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <MessageSquare className={`w-4 h-4 ${discussionFlagged ? 'text-amber-600' : ''}`} aria-hidden />
              {discussionFlagged ? 'To discuss' : 'Discuss'}
            </button>
          )}
        </div>
      </header>

      {/* Location editor: for physical addresses or to add one. A virtual
          meeting is handled by the Join/label chip above, not a Places field. */}
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
        <section>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
            For discussion
          </div>
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
        </section>
      )}

      {/* Prep tasks are the event's subtasks — real tasks linked to this event. */}
      <section>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
          Prep tasks
        </div>
        <div className="flex flex-col gap-1.5">
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100"><ConceptIcon name="list" decorative /></span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
          <input
            type="text"
            value={prepDraft}
            onChange={(e) => setPrepDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitPrepTask() }}
            onBlur={commitPrepTask}
            placeholder="+ Add a prep task…"
            className="text-sm px-2 py-1.5 rounded-md bg-transparent text-neutral-500 placeholder:text-neutral-400 focus:outline-none focus:bg-neutral-50 hover:bg-neutral-50"
          />
        </div>
      </section>

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

      <PanelMightBeRelevant items={[]} onOpen={props.onOpenRelated} />

      {/* Events carry no created/updated timestamps; show the start time when present. */}
      {startTime && (
        <PanelFooter
          createdAt={new Date(startTime)}
          updatedAt={new Date(startTime)}
        />
      )}
    </article>
  )
}
