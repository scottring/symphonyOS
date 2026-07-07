import { useState } from 'react'
import { Video } from 'lucide-react'
import type { CalendarEvent } from '@/hooks/useGoogleCalendar'
import type { Task } from '@/types/task'
import { PanelHeader } from './sections/PanelHeader'
import { PanelMetaRow } from './sections/PanelMetaRow'
import { PanelWhy } from './sections/PanelWhy'
import { PanelLinks } from './sections/PanelLinks'
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
  allTasks: Task[]

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

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function TapEventPanel(props: TapEventPanelProps) {
  const { event, allTasks } = props
  const [showDirections, setShowDirections] = useState(false)
  const [showDurationMenu, setShowDurationMenu] = useState(false)

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

  return (
    <article className="bg-bg-elevated rounded-2xl p-5 max-w-md w-full">
      <PanelHeader
        title={event.title}
        onTitleChange={() => { /* event title is read-only from gcal */ }}
        onClose={props.onClose}
      />
      <PanelMetaRow
        bucket={formatTime(startTime)}
      />
      <div className="flex flex-wrap gap-2 pb-4 mb-4 border-b border-neutral-200">
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
        {props.onReschedule && (
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
        {props.onReschedule && durationMinutes !== null && durationMinutes > 0 && (
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
      </div>

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

      <PanelWhy
        key={event.id}
        notes={props.notes}
        onChange={props.onNotesChange}
        label="What to bring"
      />

      {relations.tasks.length > 0 && (
        <section className="mb-4">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">
            Prep tasks
          </div>
          {relations.tasks.map(t => (
            <button
              key={t.id}
              onClick={() => props.onOpenTask(t.id)}
              className="flex items-center gap-2 w-full text-left mb-1 py-1.5 px-2 rounded-md bg-white shadow-[inset_0_0_0_1px_#e5e7eb] hover:bg-neutral-50"
            >
              <span className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100"><ConceptIcon name="list" decorative /></span>
              <span className="text-sm text-neutral-800 flex-1">{t.title}</span>
            </button>
          ))}
        </section>
      )}

      <PanelLinks links={undefined} onAddLink={props.onAddLink} />

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
