// YearbookView — Per-person yearbook view with interactive entries

import { useHousehold } from '@/hooks/useHousehold'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useYearbook } from '@/hooks/useYearbook'
import { useEntries } from '@/hooks/useEntries'
import { EntryCard } from '@/components/entry/EntryCard'
import { GenerateButton } from './GenerateButton'
import { useState, useMemo, useCallback } from 'react'
import type { Entry, EntryType } from '@/types/entry'
import type { DomainId } from '@/types/manual'
import { DOMAIN_NAMES, DOMAIN_ORDER } from '@/types/manual'

const TYPE_FILTERS: { value: EntryType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'story', label: 'Stories' },
  { value: 'activity', label: 'Activities' },
  { value: 'goal', label: 'Goals' },
  { value: 'reflection', label: 'Reflections' },
  { value: 'checklist', label: 'Checklists' },
  { value: 'discussion', label: 'Discussions' },
  { value: 'task', label: 'Tasks' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'insight', label: 'Insights' },
]

export function YearbookView() {
  const { household } = useHousehold()
  const householdId = household?.id ?? null
  const { members } = useFamilyMembers()
  const { yearbooks, loading: ybLoading } = useYearbook(householdId)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<EntryType | 'all'>('all')
  const [domainFilter, setDomainFilter] = useState<DomainId | 'all'>('all')

  const currentYear = new Date().getFullYear()
  const activePerson = selectedPersonId || members[0]?.id || null
  const activeYearbook = yearbooks.find(
    y => y.person_id === activePerson && y.year === currentYear
  )
  const activeMember = members.find(m => m.id === activePerson)

  const entriesOptions = useMemo(
    () => ({
      ...(activeYearbook ? { yearbookId: activeYearbook.id } : {}),
      ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
      ...(domainFilter !== 'all' ? { domain: domainFilter } : {}),
    }),
    [activeYearbook, typeFilter, domainFilter]
  )
  const { entries, loading: entriesLoading, updateEntry } = useEntries(householdId, entriesOptions)

  const handleUpdateEntry = useCallback(
    (entryId: string) => (updates: Partial<Entry>) => {
      updateEntry(entryId, updates)
    },
    [updateEntry]
  )

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
        <p className="text-stone-500 mt-1">
          {activeMember ? `${activeMember.name}'s personalized entries` : 'Personalized entries for each family member'}
        </p>
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

      {/* Generate button */}
      {activePerson && activeMember && (
        <div className="mb-6">
          <GenerateButton personId={activePerson} personName={activeMember.name} />
        </div>
      )}

      {/* Filters */}
      {activeYearbook && entries.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {TYPE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  typeFilter === f.value
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setDomainFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                domainFilter === 'all'
                  ? 'bg-stone-800 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
              }`}
            >
              All Domains
            </button>
            {DOMAIN_ORDER.map(d => (
              <button
                key={d}
                onClick={() => setDomainFilter(d)}
                className={`text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                  domainFilter === d
                    ? 'bg-stone-800 text-white'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
                }`}
              >
                {DOMAIN_NAMES[d]}
              </button>
            ))}
          </div>
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
          <p className="text-stone-400">
            {typeFilter !== 'all' || domainFilter !== 'all'
              ? 'No entries match your filters.'
              : 'No entries yet.'}
          </p>
          <p className="text-sm text-stone-300 mt-1">
            Entries will be generated from your family manual.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onUpdate={handleUpdateEntry(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
