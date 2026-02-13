// YearbookCover — Hero cover section for a person's yearbook
// Shows avatar, name, year, identity statement, and summary counts

import type { FamilyMember } from '@/types/family'
import type { Yearbook } from '@/types/yearbook'

interface YearbookCoverProps {
  member: FamilyMember
  yearbook: Yearbook
  entryCount: number
  chapterCount: number
  identityStatement?: string
}

export function YearbookCover({ member, yearbook, entryCount, chapterCount, identityStatement }: YearbookCoverProps) {
  // Generate initials for avatar
  const initials = member.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-50 via-white to-stone-50 border border-stone-200 px-8 py-12 md:px-12 md:py-16 mb-10">
      {/* Subtle decorative circles */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-stone-100/40" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-stone-100/30" />

      <div className="relative flex flex-col items-center text-center">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-full bg-stone-200 flex items-center justify-center mb-6 ring-4 ring-white shadow-sm">
          <span className="font-display text-2xl text-stone-500">{initials}</span>
        </div>

        {/* Name + Year */}
        <h1 className="font-display text-4xl md:text-5xl font-semibold text-stone-900 leading-tight mb-2">
          {member.name}
        </h1>
        <p className="font-display text-lg text-stone-400 mb-6">{yearbook.year}</p>

        {/* Identity statement */}
        {identityStatement && (
          <p className="font-display text-xl md:text-2xl text-stone-600 italic leading-relaxed max-w-lg mb-8">
            &ldquo;{identityStatement}&rdquo;
          </p>
        )}

        {/* Summary counts */}
        <div className="flex items-center gap-6 text-sm text-stone-400">
          <span>
            <span className="font-medium text-stone-600">{entryCount}</span> entries
          </span>
          {chapterCount > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-stone-300" />
              <span>
                <span className="font-medium text-stone-600">{chapterCount}</span> chapters
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
