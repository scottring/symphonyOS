// The wall's single unprompted line — the assistant saying one thing you didn't
// ask for, in the zone that already answers "what matters right now".
//
// Exactly one line, never a stack: this is the surface where the user didn't ask,
// so the interruption policy gives it the highest urgency floor (70) and a
// concurrency of 1. Actions are limited to what a Pi kiosk can actually perform
// (see wallAssistantAdapter) — a dead tap on a wall-mounted screen is worse than
// no chip at all.
//
// Sized for 8-foot viewing with kiosk-scale touch targets. Touch reports as MOUSE
// on this device, so plain onClick is correct.

import { Sparkles, X } from 'lucide-react';
import { WALL } from './wallTheme';
import type { UnpromptedItem, UnpromptedDecisionLog } from '@/hooks/useUnpromptedSuggestions';
import { toWallAction, wallActionLabel, type WallAction } from './wallAssistantAdapter';

interface Props {
  item: UnpromptedItem | null;
  onAct: (action: WallAction, item: UnpromptedItem) => void;
  onSnooze: (id: string) => void;
  /** Populated only under ?why=1. */
  decisions?: UnpromptedDecisionLog[];
  showWhy?: boolean;
}

export function WallV2AssistantLine({ item, onAct, onSnooze, decisions, showWhy }: Props) {
  if (!item && !showWhy) return null;

  return (
    <>
      {item && (
        <div
          data-testid="wall-assistant-line"
          className={`${WALL.cardInset} flex items-center gap-3 px-4 py-3`}
        >
          <Sparkles className={`w-5 h-5 shrink-0 ${WALL.muted}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className={`text-[1.05rem] font-semibold truncate ${WALL.inkStrong}`}>
              {item.suggestion.title}
            </p>
            {item.suggestion.detail && (
              <p className={`text-[0.85rem] truncate ${WALL.muted}`}>{item.suggestion.detail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => onAct(toWallAction(item.suggestion), item)}
            className={`${WALL.prepChip} shrink-0 min-h-[60px] min-w-[104px]`}
          >
            {wallActionLabel(toWallAction(item.suggestion))}
          </button>
          <button
            type="button"
            aria-label="Not now"
            onClick={() => onSnooze(item.suggestion.id)}
            className={`shrink-0 min-h-[60px] min-w-[60px] flex items-center justify-center rounded-lg ${WALL.muted}`}
          >
            <X className="w-6 h-6" aria-hidden />
          </button>
        </div>
      )}

      {showWhy && decisions && decisions.length > 0 && (
        <div className={`${WALL.cardInset} px-3 py-2 font-mono text-[0.7rem] ${WALL.muted}`}>
          {decisions.map((d) => (
            <div key={d.id} className="truncate">
              {d.title} — urgency {d.urgency} — {d.reason}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
