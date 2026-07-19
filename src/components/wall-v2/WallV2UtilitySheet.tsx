//
// Bottom sheet for the four wall utilities (was: floating corner buttons).
// Touch-first: 80px rows, scrim tap closes, no fine targets.

import { Eye, EyeOff, ImageOff, Moon, RefreshCw, Sun, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WALL } from './wallTheme';

interface Props {
  hideRoutines: boolean;
  isDark: boolean;
  refreshing: boolean;
  onGuestMode: () => void;
  onRefresh: () => void;
  onToggleHideRoutines: () => void;
  onToggleTheme: () => void;
  onClose: () => void;
}

export function WallV2UtilitySheet({
  hideRoutines, isDark, refreshing,
  onGuestMode, onRefresh, onToggleHideRoutines, onToggleTheme, onClose,
}: Props) {
  const rows: { id: string; label: string; icon: LucideIcon; spin?: boolean; onTap: () => void }[] = [
    { id: 'guest', label: 'Guest mode', icon: ImageOff, onTap: onGuestMode },
    { id: 'refresh', label: 'Refresh', icon: RefreshCw, spin: refreshing, onTap: onRefresh },
    { id: 'routines', label: hideRoutines ? 'Show daily routines' : 'Hide daily routines', icon: hideRoutines ? Eye : EyeOff, onTap: onToggleHideRoutines },
    { id: 'theme', label: isDark ? 'Day theme' : 'Night theme', icon: isDark ? Sun : Moon, onTap: onToggleTheme },
  ];
  return (
    <div className="fixed inset-0 z-50">
      <div data-testid="utility-scrim" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className={`absolute bottom-0 inset-x-0 ${WALL.root} rounded-t-3xl p-5 pb-7`}>
        <div className="flex items-center justify-between mb-3">
          <div className={WALL.label}>Wall utilities</div>
          <button type="button" aria-label="Close" onClick={onClose} className={`${WALL.card} grid place-items-center w-12 h-12`}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {rows.map(({ id, label, icon: Icon, spin, onTap }) => (
            <button key={id} type="button" onClick={onTap} className={`${WALL.card} flex items-center gap-3 px-5 h-[80px] text-left`}>
              <Icon className={`w-6 h-6 shrink-0 ${spin ? 'animate-spin' : ''} ${WALL.muted}`} />
              <span className={`text-[1.05rem] font-semibold ${WALL.inkStrong}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
