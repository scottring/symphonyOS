import type { TodayItem } from './today/todayItem'
import type { FamilyMember } from '@/types/family'
import type { WallDayData } from '@/hooks/useWallData'
import type { TimelineItem } from '@/types/timeline'
import { Eye, EyeOff } from 'lucide-react'
import { WallFamilyFilter } from './WallFamilyFilter'
import { WallTodayList } from './WallTodayList'
import { WallDiscussList } from './WallDiscussList'
import { WallLookAhead } from './WallLookAhead'

interface WallRightColumnProps {
  todayItems: TodayItem[]
  discussItems: TodayItem[]
  upcomingDays: WallDayData[]
  members: FamilyMember[]
  selectedOwnerId: string | null
  onSelectOwner: (id: string | null) => void
  onCheckItem: (id: string, completed: boolean) => void
  onTapEvent: (id: string) => void
  onResolveDiscussion: (id: string) => void
  onTapUpcoming?: (item: TimelineItem) => void
  hideDaily?: boolean
  onToggleHideDaily?: () => void
}

export function WallRightColumn({
  todayItems, discussItems, upcomingDays, members,
  selectedOwnerId, onSelectOwner,
  onCheckItem, onTapEvent, onResolveDiscussion, onTapUpcoming, hideDaily, onToggleHideDaily,
}: WallRightColumnProps) {
  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4 flex flex-col gap-2 h-full overflow-y-auto">
      <WallFamilyFilter
        members={members}
        selectedId={selectedOwnerId}
        onSelect={onSelectOwner}
      />

      <div className="flex items-center justify-between px-1">
        <div className="text-[10px] uppercase tracking-widest text-white/50">Today</div>
        {onToggleHideDaily && (
          <button
            type="button"
            onClick={onToggleHideDaily}
            aria-label={hideDaily ? 'Show daily routines' : 'Hide daily routines'}
            title={hideDaily ? 'Show daily routines' : 'Hide daily routines'}
            className={`w-11 h-11 -my-2 flex items-center justify-center rounded-md transition-colors ${
              hideDaily ? 'text-white/70' : 'text-white/35 hover:text-white/60'
            }`}
          >
            {hideDaily ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      <WallTodayList
        items={todayItems}
        members={members}
        onCheckItem={onCheckItem}
        onTapEvent={onTapEvent}
      />

      <WallDiscussList items={discussItems} onResolve={onResolveDiscussion} />

      <div className="text-[10px] uppercase tracking-widest text-white/50 mt-4 px-1">Coming up</div>
      <WallLookAhead
        days={upcomingDays}
        familyMembers={members}
        onItemTap={onTapUpcoming}
        compressed
      />
    </div>
  )
}
