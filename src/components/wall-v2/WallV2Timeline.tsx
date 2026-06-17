// src/components/wall-v2/WallV2Timeline.tsx
//
// TODAY'S PLAN — sectioned vertical timeline. Each section has a label rail
// on the left (icon + Afternoon/Evening/Night) connected by a thin guide
// line, and a stack of event cards on the right.

import { CalendarDays, Coffee } from 'lucide-react';
import { TINTS } from './tints';
import { WallV2EventCard } from './WallV2EventCard';
import { WallV2ScheduleBand } from './WallV2ScheduleBand';
import { useDragScroll } from '@/hooks/useDragScroll';
import type { WallV2TimelineSection, WallV2ScheduleBandData } from './types';

interface Props {
  band: WallV2ScheduleBandData;
  calendarUnavailable?: boolean;
  sections: WallV2TimelineSection[];
  onTapEvent?: (id: string) => void;
  onToggleComplete?: (id: string, completed: boolean) => void;
  onTapFullDay?: () => void;
}

export function WallV2Timeline({ band, calendarUnavailable, sections, onTapEvent, onToggleComplete, onTapFullDay }: Props) {
  // The wall is a Pi touchscreen that delivers touch as mouse events, so native
  // touch scrolling never fires — drive scroll from pointer drag instead.
  const scrollRef = useDragScroll<HTMLDivElement>();
  const bandEmpty = band.allDay.length === 0 && band.timed.length === 0;
  // A failed calendar fetch must not read as the calm "nothing scheduled" state —
  // keep the band visible so its reconnect hint shows.
  const everythingEmpty = bandEmpty && sections.length === 0 && !calendarUnavailable;
  return (
    <div className="bg-white/70 dark:bg-stone-900/60 border border-stone-200/70 dark:border-stone-700/60 rounded-3xl p-5 flex flex-col gap-4 h-full min-h-0">
      <div className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400 shrink-0">
        Today's plan
      </div>

      {everythingEmpty ? (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-stone-500 dark:text-stone-400">
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200">
            <Coffee className="w-6 h-6" />
          </div>
          <div className="font-display text-[1.4rem] text-stone-700 dark:text-stone-200 mt-1">
            Nothing scheduled
          </div>
          <div className="text-[0.9rem] text-stone-500 dark:text-stone-400">
            Enjoy the calm — or capture something below.
          </div>
        </div>
      ) : (
      <div
        ref={scrollRef}
        className="flex flex-col gap-4 relative flex-1 min-h-0 overflow-y-auto pr-1 -mr-1"
        // Scroll is driven by useDragScroll (pointer-drag → scrollTop) because
        // the Pi kiosk delivers touch as mouse events, so native touch scroll
        // and `touch-action` never fire here. The touch-action/-webkit props are
        // kept as a no-cost fallback for any surface that *does* get real touch.
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Prioritized timed agenda — calendar events + timed tasks, separated
            from and above the home-rhythm sections below. */}
        <WallV2ScheduleBand
          band={band}
          calendarUnavailable={calendarUnavailable}
          onTapEvent={onTapEvent}
          onToggleComplete={onToggleComplete}
        />

        {sections.length > 0 && (
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 mt-1">
            Home rhythm
          </div>
        )}

        {sections.map((section, idx) => {
          const tint = TINTS[section.tint];
          const Icon = section.icon;
          const isLast = idx === sections.length - 1;

          return (
            <div key={section.id} className="grid grid-cols-[6rem_1fr] gap-4">
              {/* Rail */}
              <div className="relative flex flex-col items-center pt-1">
                <div
                  className={`grid place-items-center w-10 h-10 rounded-xl ${tint.bg} ${tint.fg}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400 mt-1.5">
                  {section.label}
                </div>
                {!isLast && (
                  <div
                    className="absolute top-12 bottom-[-1rem] left-1/2 -translate-x-1/2 w-px bg-stone-200 dark:bg-stone-700"
                    aria-hidden
                  />
                )}
              </div>

              {/* Events */}
              <div className="flex flex-col gap-2">
                {section.events.map((event) => (
                  <WallV2EventCard
                    key={event.id}
                    event={event}
                    onTap={onTapEvent}
                    onToggleComplete={onToggleComplete}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {onTapFullDay && sections.length > 0 && (
        <button
          type="button"
          onClick={onTapFullDay}
          className="self-center mt-1 shrink-0 inline-flex items-center gap-2 px-4 py-2 text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100 text-[0.9rem] font-bold"
        >
          <CalendarDays className="w-4 h-4" />
          View full day
        </button>
      )}
    </div>
  );
}
