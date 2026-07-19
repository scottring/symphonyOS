//
// "Keep Moving" — today's open family tasks in a fixed-height card at the
// bottom of the center column. Rows drag-scroll (Pi sends mouse events).

import { useDragScroll } from '@/hooks/useDragScroll';
import { WALL } from './wallTheme';
import { TINTS } from './tints';
import type { WallV2TimelineEvent } from './types';

interface Props {
  tasks: WallV2TimelineEvent[];
  onToggleComplete: (id: string, completed: boolean) => void;
  onTapTask: (id: string) => void;
}

export function WallV2KeepMoving({ tasks, onToggleComplete, onTapTask }: Props) {
  const scrollRef = useDragScroll<HTMLDivElement>();
  return (
    <div className={`${WALL.card} h-full min-h-0 flex flex-col px-4 py-3`}>
      <div className={WALL.label}>Keep moving</div>
      {tasks.length === 0 ? (
        <div className={`flex-1 grid place-items-center text-[0.9rem] ${WALL.muted}`}>
          Nothing pressing — enjoy the day.
        </div>
      ) : (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto mt-1">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 min-h-[48px]">
              <button
                type="button"
                role="checkbox"
                aria-checked={!!t.completed}
                aria-label={t.title}
                onClick={() => onToggleComplete(t.id, !t.completed)}
                className="shrink-0 w-12 h-12 grid place-items-center"
                // pan-y: button declines vertical drag so the parent column
                // scrolls instead. Tap (down + up, no movement) still fires
                // onClick normally. Without this, dragging a finger that
                // starts on the checkbox is captured as a button press and
                // the wall's column never scrolls.
                style={{ touchAction: 'pan-y' }}
              >
                <span className={`w-[18px] h-[18px] rounded-full border-2 ${t.completed ? 'bg-[#2E4638] border-[#2E4638] dark:bg-[#4E7261] dark:border-[#4E7261]' : 'border-[#B9AB90] dark:border-[#6B5F4A]'}`} />
              </button>
              <button
                type="button"
                onClick={() => onTapTask(t.id)}
                className={`flex-1 min-w-0 self-stretch flex items-center text-left text-[0.95rem] font-semibold truncate ${t.completed ? `line-through ${WALL.muted}` : WALL.inkStrong}`}
                // Same rationale as the checkbox above: this row body is a full
                // <button> and the wall's scroll column can only scroll if the
                // button explicitly delegates vertical pan to its ancestor.
                // touch-action does NOT inherit — each element must opt in.
                style={{ touchAction: 'pan-y' }}
              >
                {t.title}
              </button>
              {t.chips?.[0] && (
                <span className={`shrink-0 text-[0.65rem] font-bold tracking-[0.06em] px-2 py-0.5 rounded-md ${TINTS[t.chips[0].tint ?? 'sage'].bg} ${TINTS[t.chips[0].tint ?? 'sage'].fg}`}>
                  {t.chips[0].label.toUpperCase()}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
