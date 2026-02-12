// RelishHome — The Relish front door
// Renders the welcome header + bookshelf above the daily schedule

import type { Manual } from '@/types/manual'
import type { Yearbook } from '@/types/yearbook'
import type { FamilyMember } from '@/types/family'
import { RelishWelcome } from './RelishWelcome'
import { NordicBookshelf } from './NordicBookshelf'

interface RelishHomeProps {
  userName: string
  householdName: string
  manual: Manual | null
  manuals: Manual[]
  yearbooks: Yearbook[]
  familyMembers: FamilyMember[]
  hasCheckedInThisWeek: boolean
  driftSignalCount: number
  onStartCheckin: () => void
  onOpenManual: (manualId: string) => void
  onOpenYearbook: (personId: string) => void
}

export function RelishHome({
  userName,
  householdName,
  manual,
  manuals,
  yearbooks,
  familyMembers,
  hasCheckedInThisWeek,
  driftSignalCount,
  onStartCheckin,
  onOpenManual,
  onOpenYearbook,
}: RelishHomeProps) {
  return (
    <div className="animate-fade-in">
      {/* Zone 1: Welcome */}
      <RelishWelcome
        userName={userName}
        householdName={householdName}
        manual={manual}
        hasCheckedInThisWeek={hasCheckedInThisWeek}
        driftSignalCount={driftSignalCount}
        onStartCheckin={onStartCheckin}
      />

      {/* Zone 2: Bookshelf */}
      <section className="pb-4">
        <NordicBookshelf
          manuals={manuals}
          yearbooks={yearbooks}
          familyMembers={familyMembers}
          onOpenManual={onOpenManual}
          onOpenYearbook={onOpenYearbook}
        />
      </section>

      {/* Zone 3: existing HomeView renders below this in App.tsx */}
    </div>
  )
}
