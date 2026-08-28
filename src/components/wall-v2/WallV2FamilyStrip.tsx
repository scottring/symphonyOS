// Bottom band: one warm card per family member (watercolor portrait when the
// asset exists at /wall/portrait-<id>.png, monogram medallion otherwise, name
// in serif, their next thing today) + the 3×2 dock cluster on the right.
// Replaces WallV2ActionDock and the old WallV2AtAGlance strip.
//
// NOT CURRENTLY MOUNTED: grep the repo for `<WallV2FamilyStrip` and the only
// hit is this component's own test file. WallV2Shell.tsx imports just the
// WallDockActionId type. It is still the one production call site of
// adaptGlanceForMember, so its hideDailyRoutines plumbing below is correct —
// but inert until something renders this component again.

import { useState } from 'react';
import { ClipboardList, MessagesSquare, Phone, Plus, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FamilyMember } from '@/types/family';
import type { WallDayData } from '@/hooks/useWallData';
import { adaptGlanceForMember } from './wallV2Adapter';
import { WALL, personAccent } from './wallTheme';

export type WallDockActionId = 'task' | 'discuss' | 'list' | 'phone' | 'utilities';

const DOCK: { id: WallDockActionId; label: string; icon: LucideIcon }[] = [
  { id: 'task', label: 'Add a task', icon: Plus },
  { id: 'discuss', label: 'Discuss', icon: MessagesSquare },
  { id: 'list', label: 'Lists', icon: ClipboardList },
  { id: 'phone', label: 'Phone', icon: Phone },
  { id: 'utilities', label: 'Utilities', icon: Settings },
];

function Portrait({ member }: { member: FamilyMember }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="w-[60px] h-[60px] shrink-0 rounded-xl border-2 border-[#EEE1C7] dark:border-[#4A3D28] bg-[radial-gradient(circle_at_35%_28%,#F4E5CA,#DCC49A)] dark:bg-[radial-gradient(circle_at_35%_28%,#4A3D28,#332C22)] grid place-items-center font-display text-[1.4rem] text-[#6E5A3A] dark:text-[#D8BC85]">
        {/* Serif initial is per spec §7 — monogram medallion */}
        {member.name.charAt(0).toUpperCase() || '?'}
      </div>
    );
  }
  return (
    <img
      src={`/wall/portrait-${member.id}.png`}
      alt={member.name}
      onError={() => setFailed(true)}
      className="w-[60px] h-[60px] shrink-0 rounded-xl border-2 border-[#EEE1C7] dark:border-[#4A3D28] object-cover"
    />
  );
}

interface Props {
  familyMembers: FamilyMember[];
  today: WallDayData | undefined;
  now: Date;
  onDockAction: (id: WallDockActionId) => void;
  /** The wall's "hide daily routines" toggle — passed through to canHeadline. */
  hideDailyRoutines: boolean;
}

export function WallV2FamilyStrip({ familyMembers, today, now, onDockAction, hideDailyRoutines }: Props) {
  return (
    <div className="h-full flex gap-2.5">
      {familyMembers.slice(0, 5).map((member, i) => {
        const glance = adaptGlanceForMember(member, today, now, hideDailyRoutines);
        return (
          <div key={member.id} className={`${WALL.card} border-l-4 ${personAccent(i)} flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2`}>
            <Portrait member={member} />
            <div className="min-w-0">
              <div className={`font-display text-[1.1rem] leading-tight truncate ${WALL.inkStrong}`}>{member.name}</div>
              <div className={`text-[0.78rem] truncate ${WALL.muted}`}>
                {glance ? `${glance.primary}${glance.secondary ? ` · ${glance.secondary}` : ''}` : 'All clear today'}
              </div>
            </div>
          </div>
        );
      })}
      <div className={`${WALL.rail} rounded-2xl shrink-0 w-[182px] grid grid-cols-3 grid-rows-2 gap-1.5 p-1.5`}>
        {DOCK.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-label={label}
            onClick={() => onDockAction(id)}
            className={`${WALL.card} grid place-items-center text-[#2E4638] dark:text-[#4E7261] active:scale-95 transition-transform`}
          >
            <Icon className="w-5 h-5" />
          </button>
        ))}
      </div>
    </div>
  );
}
