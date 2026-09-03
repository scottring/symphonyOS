// src/components/wall-v2/wallQuestions.ts
//
// The questions the wall asks the household. Today there is one kind: a
// HANDOFF nobody has claimed — "Walk Ella & Kaleb to school" with no parent
// on it. The board draws it on the Everyone row; this turns it into words the
// strip can ask ("Who's walking Ella & Kaleb to school?") and a face can
// answer.
//
// Two windows, on purpose. Today's unclaimed handoffs that have not started
// yet — at 7am the morning still needs an answer. And tomorrow's, from the
// same evening hour Needed Today uses to start showing tomorrow, so "who's
// walking tomorrow?" is asked the night before, when it can still be talked
// about, and again in the morning if it wasn't.
//
// PURE: `now` is passed in. The list is built so it can grow — a second kind
// of question (an unclaimed dinner, an unsigned form) is a second builder
// pushing onto the same array.

import type { WallDayData } from '@/hooks/useWallData';
import type { FamilyMember } from '@/types/family';
import type { TimelineItem } from '@/types/timeline';
import type { DaySection } from '@/lib/timeUtils';
import { neededWindow } from '@/lib/today/neededToday';
import { isSameDay } from '@/lib/dateUtils';
import { attributeEvent, handoffQuestion, HOUSEHOLD_ID } from './wallEventAttribution';

export interface HandoffQuestion {
  /** The timeline id (`event-<instance id>`), for matching a tapped bar. */
  itemId: string;
  /** The Google event INSTANCE id — where the answer is written. */
  eventKey: string;
  title: string;
  /** "Who's walking Ella & Kaleb to school?" */
  prompt: string;
  when: 'today' | 'tomorrow';
  /** "7:15a" */
  time: string;
  start: Date;
}

const SECTIONS: DaySection[] = ['earlyMorning', 'morning', 'afternoon', 'evening', 'night'];

function clockLabel(d: Date): string {
  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const m = d.getMinutes();
  return `${h}${m ? ':' + String(m).padStart(2, '0') : ''}${h24 < 12 ? 'a' : 'p'}`;
}

function eventKeyOf(item: TimelineItem): string {
  return item.originalEvent?.google_event_id || item.originalEvent?.id || item.id.replace(/^event-/, '');
}

function unclaimedHandoffs(day: WallDayData, members: FamilyMember[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const section of SECTIONS) {
    for (const it of day.items[section] ?? []) {
      if (it.type !== 'event' || !it.startTime || it.allDay) continue;
      const prompt = handoffQuestion(it.title);
      if (!prompt) continue;
      const owners = attributeEvent(
        { title: it.title, calendar_id: it.originalEvent?.calendar_id, calendarId: it.originalEvent?.calendarId },
        members,
        it.assignedTo,
      );
      if (!owners.includes(HOUSEHOLD_ID)) continue; // claimed, or kept off the wall
      out.push(it);
    }
  }
  return out;
}

export function openHandoffQuestions(days: WallDayData[], members: FamilyMember[], now: Date): HandoffQuestion[] {
  const today = days.find((d) => isSameDay(d.date, now));
  if (!today) return [];
  const window = neededWindow(today.date, now);
  const tomorrow = window.tomorrow ? days.find((d) => isSameDay(d.date, window.tomorrow!)) : undefined;

  const build = (day: WallDayData, when: HandoffQuestion['when']): HandoffQuestion[] =>
    unclaimedHandoffs(day, members)
      .filter((it) => when === 'tomorrow' || it.startTime!.getTime() > now.getTime())
      .map((it) => ({
        itemId: it.id,
        eventKey: eventKeyOf(it),
        title: it.title,
        prompt: handoffQuestion(it.title)!,
        when,
        time: clockLabel(it.startTime!),
        start: it.startTime!,
      }));

  const questions = [...build(today, 'today'), ...(tomorrow ? build(tomorrow, 'tomorrow') : [])];
  questions.sort((a, b) => a.start.getTime() - b.start.getTime());
  return questions;
}
