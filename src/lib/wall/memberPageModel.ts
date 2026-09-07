// src/lib/wall/memberPageModel.ts
//
// Pure page model for the ADULT shape of the wall's person page, plus the
// two rules both shapes share (which shape, and the "Next:" line). The kid
// shape is kidDayModel's MemberDayModel; this file adds what a parent wants
// from their own page — appointments, chores, the kids — without touching the
// checklist model a kid's page is built on.
//
// PURE: no React, no clock reads beyond the `now` passed in.

import type { FamilyMember } from '@/types/family'
import type { TimelineItem } from '@/types/timeline'
import type { DaySection } from '@/lib/timeUtils'
import type { MemberDayModel, KidRow } from './kidDayModel'
import { routineEarnsTheWall } from '@/lib/routineUtils'
import { ownersOf } from '@/components/wall-v2/wallLanes'
import {
  isHandoffEvent, matchesName, titleForMember, hasPerPersonSegments, withoutMemberList,
} from '@/components/wall-v2/wallEventAttribution'

export type MemberShape = 'kid' | 'adult'

/**
 * The Shell's rule for "a parent" (its parents roster), reused so the page
 * and the wall never disagree about who is grown. Kids carry role_label
 * 'family' in real data — never test for 'child'.
 */
export function memberShape(m: FamilyMember): MemberShape {
  return m.role_label === 'parent' || m.is_full_user ? 'adult' : 'kid'
}

export interface AppointmentRow {
  id: string
  /** "4:00" — the hour large on the page; am/pm is obvious on a wall. */
  time: string
  title: string
  /** Location, or nothing. */
  detail: string | null
  past: boolean
  free: boolean
}

function clock(d: Date): string {
  const h24 = d.getHours()
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h}:${String(d.getMinutes()).padStart(2, '0')}`
}

function all(items: Record<DaySection, TimelineItem[]>): TimelineItem[] {
  return (Object.values(items) as TimelineItem[][]).flat()
}

/** Who an item belongs to — attribution first, the legacy single column as the floor. */
function ownersOrAssignee(it: TimelineItem, members: FamilyMember[]): string[] {
  const owners = ownersOf(it, members)
  if (owners.length > 0) return owners
  return it.assignedTo ? [it.assignedTo] : []
}

/**
 * Timed items on this person's day, clock order. Rhythm routines never
 * qualify (a 7am "Brush teeth" is not an appointment), nor does a
 * collection step, an all-day item, or anything already done.
 */
export function appointmentsFor(
  member: FamilyMember,
  members: FamilyMember[],
  todayItems: Record<DaySection, TimelineItem[]>,
  now: Date,
): AppointmentRow[] {
  return all(todayItems)
    .filter((it) => !!it.startTime && !it.allDay && !it.completed)
    .filter((it) => it.type !== 'routine' || (
      it.originalRoutine?.parent_routine_id == null && routineEarnsTheWall(it.recurrencePattern)
    ))
    .filter((it) => ownersOrAssignee(it, members).includes(member.id))
    .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())
    .map((it) => ({
      id: it.id,
      time: clock(it.startTime!),
      title: withoutMemberList(titleForMember(it.title, member.name), members),
      detail: it.location?.trim() || null,
      past: (it.endTime ?? it.startTime!).getTime() <= now.getTime(),
      free: !!it.isFree,
    }))
}

/** "Next: Dentist 4:00 · then FFG 6:30" — the header's one line. */
export function nextLine(appointments: AppointmentRow[]): string | null {
  const ahead = appointments.filter((a) => !a.past)
  if (ahead.length === 0) return null
  const first = `Next: ${ahead[0].title} ${ahead[0].time}`
  return ahead.length > 1 ? `${first} · then ${ahead[1].title} ${ahead[1].time}` : first
}

const BAND_ORDER = ['morning', 'afternoon', 'evening', 'anytime'] as const

/**
 * An adult's Chores: the routine rows the day model already resolved for
 * them (rare or not — a parent's own checklist is theirs to keep) plus their
 * untimed tasks. A timed task is an appointment and lives in that column.
 */
export function choresFor(model: MemberDayModel): KidRow[] {
  const out: KidRow[] = []
  for (const band of BAND_ORDER) {
    for (const row of model.bands[band]) {
      if (row.entityType === 'task' && row.timeOfDay) continue
      out.push(row)
    }
  }
  return out
}

export interface KidLine {
  id: string
  name: string
  special: string | null
  /** "6:30 Drop off Ella & Kaleb at FFG" when this adult is driving a handoff naming the kid. */
  handoff: string | null
}

const SPECIALS = /^specials?\b/i

/** What an adult wants to know about each child today: the special, and any handoff that is theirs to drive. */
export function kidsFor(
  adult: FamilyMember,
  members: FamilyMember[],
  todayItems: Record<DaySection, TimelineItem[]>,
): KidLine[] {
  const items = all(todayItems)
  return members
    .filter((m) => memberShape(m) === 'kid')
    .map((kid) => {
      const rotation = items.find((it) =>
        it.type === 'event' && !!it.allDay
        && (SPECIALS.test(it.title) || hasPerPersonSegments(it.title, members))
        && matchesName(it.title, kid.name))
      const drive = items
        .filter((it) => it.type === 'event' && !!it.startTime && !it.allDay && !it.completed
          && isHandoffEvent(it.title) && matchesName(it.title, kid.name)
          && ownersOrAssignee(it, members).includes(adult.id))
        .sort((a, b) => a.startTime!.getTime() - b.startTime!.getTime())[0]
      return {
        id: kid.id,
        name: kid.name,
        special: rotation ? titleForMember(rotation.title, kid.name) : null,
        handoff: drive ? `${clock(drive.startTime!)} ${drive.title}` : null,
      }
    })
}
