// NordicBookshelf — The identity centerpiece of the Relish home
// Horizontal scrollable shelf with manual spines + yearbook booklets

import type { Manual } from '@/types/manual'
import type { Yearbook } from '@/types/yearbook'
import type { FamilyMember } from '@/types/family'
import { NordicManualSpine } from './NordicManualSpine'
import { YearbookSpine } from './YearbookSpine'

interface NordicBookshelfProps {
  manuals: Manual[]
  yearbooks: Yearbook[]
  familyMembers: FamilyMember[]
  onOpenManual: (manualId: string) => void
  onOpenYearbook: (personId: string) => void
}

export function NordicBookshelf({
  manuals,
  yearbooks,
  familyMembers,
  onOpenManual,
  onOpenYearbook,
}: NordicBookshelfProps) {
  const currentYear = new Date().getFullYear()

  // Build yearbook items with person info
  const yearbookItems = yearbooks
    .filter(yb => yb.year === currentYear)
    .map(yb => {
      const member = familyMembers.find(m => m.id === yb.person_id)
      return member ? { yearbook: yb, member } : null
    })
    .filter(Boolean) as { yearbook: Yearbook; member: FamilyMember }[]

  const hasContent = manuals.length > 0 || yearbookItems.length > 0

  return (
    <div className="relative">
      {/* Shelf content */}
      <div className="flex items-end gap-3 px-6 md:px-8 pb-2 min-h-[200px] overflow-x-auto snap-x snap-mandatory
                      scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Manual spines */}
        {manuals.map(manual => (
          <NordicManualSpine
            key={manual.id}
            manual={manual}
            onClick={onOpenManual}
          />
        ))}

        {/* Yearbook booklets */}
        {yearbookItems.map(({ yearbook, member }) => (
          <YearbookSpine
            key={yearbook.id}
            personName={member.name}
            personInitial={member.initials || member.name.charAt(0).toUpperCase()}
            personColor={member.color || '#6b7280'}
            year={yearbook.year}
            onClick={() => onOpenYearbook(yearbook.person_id)}
          />
        ))}
      </div>

      {/* Shelf surface — warm wood grain edge */}
      <div className="nordic-shelf-surface mx-4" />

      {/* Empty state */}
      {!hasContent && (
        <div className="text-center py-6">
          <p className="text-sm text-neutral-400">
            Complete onboarding to start building your family's bookshelf.
          </p>
        </div>
      )}
    </div>
  )
}
