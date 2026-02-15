// ChildProfileForm — Parents fill this out for each child during onboarding.
// Structured input (not AI conversation) about the child's needs, interests, and patterns.
// This data seeds the child's daily script and helps the AI understand each child.

import { useState, useCallback } from 'react'
import type { ChildProfile } from '@/types/userProfile'
import type { FamilyMember } from '@/types/family'

interface ChildProfileFormProps {
  child: FamilyMember
  existingProfile?: ChildProfile | null
  onSave: (childId: string, profile: ChildProfile) => Promise<void>
  onSkip: () => void
  onBack: () => void
  currentIndex: number
  totalChildren: number
}

function TagInput({
  label,
  placeholder,
  tags,
  onAdd,
  onRemove,
}: {
  label: string
  placeholder: string
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (index: number) => void
}) {
  const [input, setInput] = useState('')

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      onAdd(input.trim())
      setInput('')
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-neutral-600 mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 text-sm rounded-full"
          >
            {tag}
            <button onClick={() => onRemove(i)} className="hover:text-primary-900">
              &times;
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="input-base w-full text-sm"
      />
      <p className="text-xs text-neutral-400 mt-0.5">Press Enter to add</p>
    </div>
  )
}

function getColorClass(color: string): string {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500', purple: 'bg-purple-500', green: 'bg-green-500',
    orange: 'bg-orange-500', pink: 'bg-pink-500', teal: 'bg-teal-500',
  }
  return colorMap[color] || 'bg-neutral-400'
}

export function ChildProfileForm({
  child,
  existingProfile,
  onSave,
  onSkip,
  onBack,
  currentIndex,
  totalChildren,
}: ChildProfileFormProps) {
  const [saving, setSaving] = useState(false)

  const [profile, setProfile] = useState({
    developmental_needs: existingProfile?.developmental_needs || '',
    academic_focus: existingProfile?.academic_focus || [],
    social_needs: existingProfile?.social_needs || '',
    physical_activity: existingProfile?.physical_activity || [],
    screen_boundaries: existingProfile?.screen_boundaries || '',
    emotional_patterns: existingProfile?.emotional_patterns || '',
    routines_that_work: existingProfile?.routines_that_work || [],
    routines_that_dont: existingProfile?.routines_that_dont || [],
    special_interests: existingProfile?.special_interests || [],
    challenges: existingProfile?.challenges || [],
    parent_notes: existingProfile?.parent_notes || '',
  })

  const update = useCallback(
    <K extends keyof typeof profile>(key: K, value: (typeof profile)[K]) => {
      setProfile((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave(child.id, {
        ...profile,
        assessed_at: new Date().toISOString(),
        assessed_by: [], // Will be populated by the hook
      })
    } finally {
      setSaving(false)
    }
  }, [child.id, profile, onSave])

  const ageLabel =
    child.age_range === 'infant' ? 'infant'
      : child.age_range === 'toddler' ? 'toddler (2-4)'
        : child.age_range === 'child' ? 'child (5-12)'
          : child.age_range === 'teen' ? 'teen (13-17)'
            : ''

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg">
        {/* Header with child avatar */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div
            className={`w-12 h-12 rounded-full ${getColorClass(child.color)} flex items-center justify-center text-white font-medium text-lg`}
          >
            {child.initials}
          </div>
          <div>
            <h1 className="font-display text-3xl font-semibold text-neutral-800">
              About {child.name}
            </h1>
            {ageLabel && (
              <p className="text-sm text-neutral-400 capitalize">{ageLabel}</p>
            )}
          </div>
        </div>

        <p className="text-center text-neutral-500 mb-8">
          {totalChildren > 1
            ? `Child ${currentIndex + 1} of ${totalChildren} — help the AI understand ${child.name}.`
            : `Help the AI understand ${child.name} so their daily page is perfect.`}
        </p>

        {/* Form */}
        <div className="space-y-5">
          {/* Developmental needs */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              What does {child.name} need right now?
            </label>
            <textarea
              value={profile.developmental_needs}
              onChange={(e) => update('developmental_needs', e.target.value)}
              placeholder={`What's the most important thing for ${child.name}'s development right now? What should the family focus on?`}
              className="input-base w-full h-24 resize-none text-sm"
            />
          </div>

          {/* Academic focus */}
          <TagInput
            label="Academic or learning focus areas"
            placeholder="e.g. reading fluency, math facts, science fair"
            tags={profile.academic_focus}
            onAdd={(tag) => update('academic_focus', [...profile.academic_focus, tag])}
            onRemove={(i) => update('academic_focus', profile.academic_focus.filter((_, idx) => idx !== i))}
          />

          {/* Social needs */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Social life & friendships
            </label>
            <textarea
              value={profile.social_needs}
              onChange={(e) => update('social_needs', e.target.value)}
              placeholder={`How is ${child.name} doing socially? Any friendship dynamics, shyness, or social goals?`}
              className="input-base w-full h-20 resize-none text-sm"
            />
          </div>

          {/* Physical activity */}
          <TagInput
            label="Sports & physical activities"
            placeholder="e.g. soccer, swimming, dance"
            tags={profile.physical_activity}
            onAdd={(tag) => update('physical_activity', [...profile.physical_activity, tag])}
            onRemove={(i) => update('physical_activity', profile.physical_activity.filter((_, idx) => idx !== i))}
          />

          {/* Screen boundaries */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Screen time boundaries
            </label>
            <textarea
              value={profile.screen_boundaries}
              onChange={(e) => update('screen_boundaries', e.target.value)}
              placeholder="e.g. 45 min/day after homework, no screens before school, educational apps only on weekdays"
              className="input-base w-full h-20 resize-none text-sm"
            />
          </div>

          {/* Emotional patterns */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Emotional patterns & regulation
            </label>
            <textarea
              value={profile.emotional_patterns}
              onChange={(e) => update('emotional_patterns', e.target.value)}
              placeholder={`How does ${child.name} handle big emotions? What works to help them calm down? Any patterns to watch for?`}
              className="input-base w-full h-20 resize-none text-sm"
            />
          </div>

          {/* Routines */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TagInput
              label="Routines that work"
              placeholder="e.g. visual schedule, timer for transitions"
              tags={profile.routines_that_work}
              onAdd={(tag) => update('routines_that_work', [...profile.routines_that_work, tag])}
              onRemove={(i) => update('routines_that_work', profile.routines_that_work.filter((_, idx) => idx !== i))}
            />
            <TagInput
              label="Routines that don't"
              placeholder="e.g. rushing in the morning, open-ended screen time"
              tags={profile.routines_that_dont}
              onAdd={(tag) => update('routines_that_dont', [...profile.routines_that_dont, tag])}
              onRemove={(i) => update('routines_that_dont', profile.routines_that_dont.filter((_, idx) => idx !== i))}
            />
          </div>

          {/* Special interests */}
          <TagInput
            label="Special interests & passions"
            placeholder="e.g. dinosaurs, Minecraft, drawing, cooking"
            tags={profile.special_interests}
            onAdd={(tag) => update('special_interests', [...profile.special_interests, tag])}
            onRemove={(i) => update('special_interests', profile.special_interests.filter((_, idx) => idx !== i))}
          />

          {/* Challenges */}
          <TagInput
            label="Current challenges"
            placeholder="e.g. bedtime resistance, homework battles, sibling conflict"
            tags={profile.challenges}
            onAdd={(tag) => update('challenges', [...profile.challenges, tag])}
            onRemove={(i) => update('challenges', profile.challenges.filter((_, idx) => idx !== i))}
          />

          {/* Parent notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-600 mb-1">
              Anything else the AI should know?
            </label>
            <textarea
              value={profile.parent_notes}
              onChange={(e) => update('parent_notes', e.target.value)}
              placeholder={`Anything about ${child.name} that doesn't fit above — medical needs, upcoming events, personality traits, etc.`}
              className="input-base w-full h-24 resize-none text-sm"
            />
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button onClick={onBack} className="text-sm text-neutral-500 hover:text-neutral-700">
            Back
          </button>

          <div className="flex gap-3">
            <button onClick={onSkip} className="text-sm text-neutral-500 hover:text-neutral-700">
              Skip
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-6 py-2.5 disabled:opacity-50"
            >
              {saving
                ? 'Saving...'
                : currentIndex < totalChildren - 1
                  ? `Save & next child`
                  : 'Save & continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
