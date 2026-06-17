// src/components/wall-v2/WallV2ScheduleBand.tsx
//
// The prioritized timed agenda at the top of the wall's center column.
// All-day commitments sit in a small strip; timed commitments render as
// time-led rows (large time gutter + reused event card). This is the wall's
// Level-1/2 information: "what's actually happening today and when."

import { CalendarClock, CalendarX2 } from 'lucide-react';
import { WallV2EventCard } from './WallV2EventCard';
import type { WallV2ScheduleBandData } from './types';

interface Props {
  band: WallV2ScheduleBandData;
  /** Calendar fetch failed (not merely empty) — show a reconnect hint, not "no appointments". */
  calendarUnavailable?: boolean;
  onTapEvent?: (id: string) => void;
  onToggleComplete?: (id: string, completed: boolean) => void;
}

export function WallV2ScheduleBand({ band, calendarUnavailable, onTapEvent, onToggleComplete }: Props) {
  const empty = band.allDay.length === 0 && band.timed.length === 0;

  return (
    <div className="rounded-3xl border-2 border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4 flex flex-col gap-3">
      <div className="text-[0.78rem] font-black uppercase tracking-[0.22em] text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
        <CalendarClock className="w-4 h-4" />
        Schedule
      </div>

      {empty && calendarUnavailable ? (
        <div className="flex items-center gap-2 text-[1rem] font-bold text-amber-700 dark:text-amber-400 py-2">
          <CalendarX2 className="w-5 h-5 shrink-0" />
          Calendar unavailable — reconnect Google Calendar
        </div>
      ) : empty ? (
        <div className="text-[1rem] font-bold text-stone-500 dark:text-stone-400 py-2">
          No appointments today
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {band.allDay.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                All day
              </div>
              {band.allDay.map((event) => (
                <WallV2EventCard
                  key={event.id}
                  event={event}
                  onTap={onTapEvent}
                  onToggleComplete={onToggleComplete}
                />
              ))}
            </div>
          )}

          {band.timed.map((event) => (
            <div key={event.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 items-center">
              <div className="text-right text-[1.05rem] font-black text-stone-700 dark:text-stone-200 tabular-nums leading-tight">
                {event.time ?? ''}
              </div>
              <WallV2EventCard
                event={event}
                onTap={onTapEvent}
                onToggleComplete={onToggleComplete}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
