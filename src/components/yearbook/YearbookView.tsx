// YearbookView — Weekly progress journal for each family member
// Organized by week with progress summaries, entries, and harmony tracking

import { useHousehold } from '@/hooks/useHousehold'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useYearbook } from '@/hooks/useYearbook'
import { useEntries } from '@/hooks/useEntries'
import { useManual } from '@/hooks/useManual'
import { YearbookCover } from './YearbookCover'
import { ChapterNav } from './ChapterNav'
import { WeekSection } from './WeekSection'
import { GenerateButton } from './GenerateButton'
import { useState, useMemo, useCallback } from 'react'
import { getWeekNumber } from '@/types/yearbook'
import type { Entry } from '@/types/entry'
import type { YearbookChapter } from '@/types/yearbook'

export function YearbookView() {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { members } = useFamilyMembers()
  const { yearbooks, loading: ybLoading } = useYearbook(householdId)
  const { manuals } = useManual(householdId)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  const currentYear = new Date().getFullYear()
  const currentWeek = getWeekNumber(new Date())
  const activePerson = selectedPersonId || members[0]?.id || null
  const activeYearbook = yearbooks.find(
    y => y.person_id === activePerson && y.year === currentYear
  )
  const activeMember = members.find(m => m.id === activePerson)

  const entriesOptions = useMemo(
    () => (activeYearbook ? { yearbookId: activeYearbook.id } : {}),
    [activeYearbook]
  )
  const { entries, loading: entriesLoading, updateEntry } = useEntries(householdId, entriesOptions)

  const handleUpdateEntry = useCallback(
    (entryId: string, updates: Partial<Entry>) => {
      updateEntry(entryId, updates)
    },
    [updateEntry]
  )

  // Get identity statement from the household manual
  const identityStatement = useMemo(() => {
    const manual = manuals.find(m => m.type === 'household')
    const valuesData = manual?.domains?.values?.data as Record<string, unknown> | undefined
    const statements = valuesData?.identityStatements as string[] | undefined
    return statements?.[0] || undefined
  }, [manuals])

  // Build weekly chapters: use yearbook chapters if they have weekNumber, otherwise group by creation week
  const weeks = useMemo((): YearbookChapter[] => {
    if (activeYearbook?.chapters && activeYearbook.chapters.length > 0) {
      const sorted = [...activeYearbook.chapters].sort((a, b) => {
        const aWeek = a.weekNumber ?? 0
        const bWeek = b.weekNumber ?? 0
        return bWeek - aWeek
      })
      return sorted
    }
    // Fallback: group entries by creation week
    if (entries.length > 0) {
      const weekMap = new Map<number, string[]>()
      for (const entry of entries) {
        const wk = getWeekNumber(new Date(entry.created_at))
        if (!weekMap.has(wk)) weekMap.set(wk, [])
        weekMap.get(wk)!.push(entry.id)
      }
      return Array.from(weekMap.entries())
        .sort(([a], [b]) => b - a)
        .map(([wk, ids]) => ({
          id: `week-${wk}`,
          title: `Week ${wk}`,
          entryIds: ids,
          weekNumber: wk,
          isActive: wk === currentWeek,
        }))
    }
    return []
  }, [activeYearbook, entries, currentWeek])

  // Map entries to weeks
  const weekEntries = useMemo(() => {
    const entryMap = new Map(entries.map(e => [e.id, e]))
    return weeks.map(week => ({
      chapter: week,
      entries: week.entryIds
        .map(id => entryMap.get(id))
        .filter((e): e is Entry => !!e),
    }))
  }, [weeks, entries])

  const totalEntryCount = entries.length
  const weekCount = weeks.length

  if (ybLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Loading journal...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-8">
      {/* Person selector tabs */}
      {members.length > 1 && (
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {members.map(member => (
            <button
              key={member.id}
              onClick={() => setSelectedPersonId(member.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activePerson === member.id
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {member.name}
            </button>
          ))}
        </div>
      )}

      {/* No yearbook state */}
      {!activeYearbook ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-semibold text-stone-900 mb-2">
            No journal yet for {currentYear}
          </h2>
          <p className="text-stone-400 mb-6">
            Generate this week's entries from your family manual and assessment data.
          </p>
          {activePerson && activeMember && (
            <GenerateButton personId={activePerson} personName={activeMember.name} />
          )}
        </div>
      ) : entriesLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-neutral-400">Loading entries...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20">
          <h2 className="font-display text-2xl font-semibold text-stone-900 mb-2">
            {activeMember?.name}'s journal is empty
          </h2>
          <p className="text-stone-400 mb-6">
            Generate personalized weekly entries from your manual and assessments.
          </p>
          {activePerson && activeMember && (
            <GenerateButton personId={activePerson} personName={activeMember.name} />
          )}
        </div>
      ) : (
        <>
          {/* Cover */}
          {activeMember && activeYearbook && (
            <YearbookCover
              member={activeMember}
              yearbook={activeYearbook}
              entryCount={totalEntryCount}
              chapterCount={weekCount}
              identityStatement={identityStatement}
            />
          )}

          {/* Generate this week's content */}
          {activePerson && activeMember && (
            <div className="mb-8">
              <GenerateButton personId={activePerson} personName={activeMember.name} />
            </div>
          )}

          {/* Week navigation */}
          <ChapterNav chapters={weeks} />

          {/* Weekly sections */}
          <div className="mt-8">
            {weekEntries.map(({ chapter, entries: weekEnts }) => (
              <WeekSection
                key={chapter.id}
                chapter={chapter}
                entries={weekEnts}
                onUpdateEntry={handleUpdateEntry}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
