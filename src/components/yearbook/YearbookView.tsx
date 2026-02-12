// YearbookView — Per-person yearbook view with entry list

import { useHousehold } from '@/hooks/useHousehold'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useYearbook } from '@/hooks/useYearbook'
import { useEntries } from '@/hooks/useEntries'
import { EntryCard } from '@/components/entry/EntryCard'
import { useState, useMemo } from 'react'

export function YearbookView() {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { members } = useFamilyMembers()
  const { yearbooks, loading: ybLoading } = useYearbook(householdId)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  // Find yearbook for selected person (or first person)
  const currentYear = new Date().getFullYear()
  const activePerson = selectedPersonId || members[0]?.id || null
  const activeYearbook = yearbooks.find(
    y => y.person_id === activePerson && y.year === currentYear
  )

  const entriesOptions = useMemo(
    () => (activeYearbook ? { yearbookId: activeYearbook.id } : {}),
    [activeYearbook]
  )
  const { entries, loading: entriesLoading } = useEntries(householdId, entriesOptions)

  if (ybLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-neutral-400">Loading yearbooks...</div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-stone-900">Yearbooks</h1>
        <p className="text-stone-500 mt-1">Personalized entries for each family member</p>
      </div>

      {/* Person selector */}
      {members.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
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

      {/* Entries */}
      {!activeYearbook ? (
        <div className="text-center py-16">
          <p className="text-stone-400">No yearbook yet for {currentYear}.</p>
          <p className="text-sm text-stone-300 mt-1">
            Yearbook entries will appear here after generation.
          </p>
        </div>
      ) : entriesLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-neutral-400">Loading entries...</div>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-400">No entries yet.</p>
          <p className="text-sm text-stone-300 mt-1">
            Entries will be generated from your family manual.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <EntryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  )
}
