// RelishHome — The Relish front door
// Renders the welcome header + bookshelf above the daily schedule

import { useMemo, useState } from 'react'
import type { Manual, DomainId } from '@/types/manual'
import { DOMAIN_NAMES, DOMAIN_ORDER } from '@/types/manual'
import type { Yearbook } from '@/types/yearbook'
import type { FamilyMember } from '@/types/family'
import { RelishWelcome } from './RelishWelcome'
import { NordicBookshelf } from './NordicBookshelf'
import { DeepeningPromptCard, pickDeepeningTarget } from '@/components/manual/DeepeningPromptCard'

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
  onStartDeepening?: (domainId: DomainId) => void
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
  onStartDeepening,
}: RelishHomeProps) {
  const [dismissed, setDismissed] = useState(false)

  const deepeningTarget = useMemo(() => {
    if (!manual || dismissed) return null
    const domains = (manual.domains ?? {}) as unknown as Record<string, unknown>
    const meta = (manual.domain_meta ?? {}) as Record<string, { updated_at?: string }>
    return pickDeepeningTarget(domains, DOMAIN_ORDER, meta)
  }, [manual, dismissed])

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

      {/* Zone 2.5: Deepening prompt — gentle nudge to fill in or refresh a domain */}
      {deepeningTarget && onStartDeepening && (
        <section className="px-4 pb-6 max-w-lg mx-auto">
          <DeepeningPromptCard
            domainId={deepeningTarget.domainId as DomainId}
            domainName={(DOMAIN_NAMES as Record<string, string>)[deepeningTarget.domainId] ?? deepeningTarget.domainId}
            promptType={deepeningTarget.promptType}
            onStart={() => onStartDeepening(deepeningTarget.domainId as DomainId)}
            onDismiss={() => setDismissed(true)}
          />
        </section>
      )}

      {/* Zone 3: existing HomeView renders below this in App.tsx */}
    </div>
  )
}
