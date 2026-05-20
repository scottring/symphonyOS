// src/components/wall-v2/WallV2ActionDock.tsx
//
// Bottom action dock — six equal-width quick-action buttons. Each button is a
// soft-tinted icon chip stacked above a two-line label/caption. Touch target
// is the whole tile (well over the 80×80 minimum per kiosk-design skill).

import { TINTS } from './tints';
import type { WallV2ActionDef } from './types';

interface Props {
  actions: WallV2ActionDef[];
  onTap?: (id: string) => void;
}

export function WallV2ActionDock({ actions, onTap }: Props) {
  return (
    <div className="grid grid-cols-6 gap-3">
      {actions.map((a) => {
        const tint = TINTS[a.tint];
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onTap?.(a.id)}
            className="group flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl bg-white/85 border border-stone-200/70 hover:bg-white transition-colors min-h-[7rem]"
          >
            <div
              className={`grid place-items-center w-14 h-14 rounded-full ${tint.bg} ${tint.fg}`}
              aria-hidden
            >
              <Icon className="w-7 h-7" />
            </div>
            <div className="text-[0.95rem] font-bold text-stone-800 leading-tight">
              {a.label}
            </div>
            <div className="text-[0.78rem] text-stone-500 leading-tight">
              {a.caption}
            </div>
          </button>
        );
      })}
    </div>
  );
}
