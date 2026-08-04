import { useMemo } from 'react'
import {
  Phone,
  MapPin,
  Video,
  Link as LinkIcon,
  Check,
  ArrowRight,
  Calendar,
  Repeat,
  CircleDot,
  FolderKanban,
} from 'lucide-react'
import type { Moment } from '@/lib/thread/types'
import type { Project } from '@/types/project'
import type { TimelineItem } from '@/types/timeline'

export type MomentSize = 'now' | 'next' | 'loose'

interface MomentCardProps {
  moment: Moment
  size: MomentSize
  project?: Project
  onComplete?: (moment: Moment) => void
  onPush?: (moment: Moment) => void
}

function mapsHref(item: TimelineItem): string | null {
  if (!item.location && !item.locationPlaceId) return null
  const query = encodeURIComponent(item.location ?? '')
  const placeId = item.locationPlaceId ? `&query_place_id=${item.locationPlaceId}` : ''
  return `https://www.google.com/maps/search/?api=1&query=${query}${placeId}`
}

function excerpt(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`
}

const TYPE_ICON = {
  task: CircleDot,
  event: Calendar,
  routine: Repeat,
  'routine-collection': Repeat,
} as const

/**
 * One moment, with its context already on the card.
 *
 * The premise of the thread is that you never click through to find the phone
 * number — so every affordance the item carries (phone, address, meeting link,
 * saved links, its project's latest note) renders here, at the size the band
 * calls for. Now cards are large enough to read at 8 feet; Loose cards are
 * dense enough to triage in a scroll.
 */
export function MomentCard({ moment, size, project, onComplete, onPush }: MomentCardProps) {
  const { item, reason } = moment

  const maps = useMemo(() => mapsHref(item), [item])
  const links = item.links ?? []
  const TypeIcon = TYPE_ICON[item.type] ?? CircleDot

  const isNow = size === 'now'
  const isLoose = size === 'loose'

  // Events have no completion state of their own — offering a checkbox on one
  // would be a lie about what it does.
  const canComplete = item.type !== 'event' && !!onComplete
  const canPush = item.type === 'task' && !!onPush

  const titleClass = isNow
    ? 'text-[28px] leading-tight font-display'
    : isLoose
      ? 'text-[16px] leading-snug'
      : 'text-[19px] leading-snug'

  const chip =
    'inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-neutral-50 ' +
    'px-3 py-1.5 text-[14px] text-neutral-700 hover:bg-neutral-100 transition-colors'

  return (
    <article
      className={[
        'rounded-2xl border bg-[var(--color-bg-elevated)] transition-shadow',
        isNow
          ? 'border-primary-200 shadow-[0_2px_16px_-6px_rgba(40,30,20,0.25)] p-6'
          : 'border-neutral-200/70 p-4',
      ].join(' ')}
    >
      <div className="flex items-start gap-4">
        <TypeIcon
          className={isNow ? 'mt-1.5 h-5 w-5 text-primary-500' : 'mt-1 h-4 w-4 text-neutral-400'}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className={`${titleClass} text-neutral-900`}>{item.title}</h3>
            {/* The composer's reasoning, stated out loud. A wrong composer
                should look wrong rather than merely feel wrong. */}
            <span
              className={[
                'shrink-0 rounded-full px-2.5 py-0.5 tabular-nums',
                isNow
                  ? 'bg-accent-100 text-accent-500 text-[14px] font-medium'
                  : 'bg-neutral-100 text-neutral-500 text-[12px]',
              ].join(' ')}
            >
              {reason}
            </span>
          </div>

          {item.waitingFor && (
            <p className="mt-1 text-[14px] italic text-neutral-500">waiting on {item.waitingFor}</p>
          )}

          {/* Context, inlined. This is the whole bet. */}
          {(item.phoneNumber || maps || item.meetingUrl || links.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {item.phoneNumber && (
                <a href={`tel:${item.phoneNumber.replace(/[^\d+]/g, '')}`} className={chip}>
                  <Phone className="h-4 w-4" aria-hidden />
                  {item.phoneNumber}
                </a>
              )}
              {maps && (
                <a href={maps} target="_blank" rel="noreferrer" className={chip}>
                  <MapPin className="h-4 w-4" aria-hidden />
                  {excerpt(item.location ?? 'Directions', 40)}
                </a>
              )}
              {item.meetingUrl && (
                <a href={item.meetingUrl} target="_blank" rel="noreferrer" className={chip}>
                  <Video className="h-4 w-4" aria-hidden />
                  Join
                </a>
              )}
              {links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className={chip}
                >
                  <LinkIcon className="h-4 w-4" aria-hidden />
                  {excerpt(link.label || link.url, 36)}
                </a>
              ))}
            </div>
          )}

          {!isLoose && item.notes && (
            <p className="mt-3 text-[15px] leading-relaxed text-neutral-600">
              {excerpt(item.notes, isNow ? 240 : 120)}
            </p>
          )}

          {/* A project isn't a place you go — its current state comes to you. */}
          {project && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-neutral-50 px-3 py-2">
              <FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-neutral-700">{project.name}</p>
                {project.notes && (
                  <p className="mt-0.5 text-[13px] leading-relaxed text-neutral-500">
                    {excerpt(project.notes, 160)}
                  </p>
                )}
              </div>
            </div>
          )}

          {item.attendees && item.attendees.length > 0 && (
            <p className="mt-2 text-[13px] text-neutral-500">
              {item.attendees
                .filter((a) => !a.self)
                .slice(0, 4)
                .map((a) => a.displayName || a.email)
                .join(', ')}
            </p>
          )}
        </div>

        {(canComplete || canPush) && (
          <div className="flex shrink-0 items-center gap-2">
            {canPush && (
              <button
                type="button"
                onClick={() => onPush?.(moment)}
                aria-label={`Push ${item.title} to tomorrow`}
                className="rounded-full border border-neutral-200 p-2.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 transition-colors"
              >
                <ArrowRight className={isNow ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
              </button>
            )}
            {canComplete && (
              <button
                type="button"
                onClick={() => onComplete?.(moment)}
                aria-label={`Complete ${item.title}`}
                className="rounded-full border border-primary-200 bg-primary-50 p-2.5 text-primary-600 hover:bg-primary-100 transition-colors"
              >
                <Check className={isNow ? 'h-5 w-5' : 'h-4 w-4'} aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
