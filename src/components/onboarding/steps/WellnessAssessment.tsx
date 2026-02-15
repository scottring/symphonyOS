// WellnessAssessment — Per-adult personal wellness form
// Captures exercise, nutrition, sleep, stress, and growth goals.
// This data drives the daily script's personal coaching.

import { useState, useCallback } from 'react'
import type { PersonalWellness } from '@/types/userProfile'

interface WellnessAssessmentProps {
  userName: string
  existingData?: PersonalWellness | null
  onSave: (data: PersonalWellness) => Promise<void>
  onSkip: () => void
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

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-xl text-neutral-800">{title}</h3>
      <p className="text-sm text-neutral-500">{subtitle}</p>
    </div>
  )
}

export function WellnessAssessment({
  userName,
  existingData,
  onSave,
  onSkip,
}: WellnessAssessmentProps) {
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<number>(0)

  // Form state
  const [exercise, setExercise] = useState({
    goals: existingData?.exercise.goals || '',
    current_habits: existingData?.exercise.current_habits || '',
    preferred_activities: existingData?.exercise.preferred_activities || [],
    schedule: existingData?.exercise.schedule || '',
  })

  const [nutrition, setNutrition] = useState({
    goals: existingData?.nutrition.goals || '',
    restrictions: existingData?.nutrition.restrictions || [],
    current_habits: existingData?.nutrition.current_habits || '',
    meal_preferences: existingData?.nutrition.meal_preferences || '',
  })

  const [sleep, setSleep] = useState({
    target_bedtime: existingData?.sleep.target_bedtime || '',
    target_waketime: existingData?.sleep.target_waketime || '',
    current_patterns: existingData?.sleep.current_patterns || '',
    challenges: existingData?.sleep.challenges || '',
  })

  const [stress, setStress] = useState({
    triggers: existingData?.stress.triggers || [],
    coping_strategies: existingData?.stress.coping_strategies || [],
    warning_signs: existingData?.stress.warning_signs || '',
  })

  const [growth, setGrowth] = useState({
    priorities: existingData?.growth.priorities || [],
    hobbies: existingData?.growth.hobbies || [],
    reading: existingData?.growth.reading || '',
    learning_goals: existingData?.growth.learning_goals || '',
  })

  const sections = [
    { title: 'Exercise', icon: '💪' },
    { title: 'Nutrition', icon: '🥗' },
    { title: 'Sleep', icon: '😴' },
    { title: 'Stress', icon: '🧘' },
    { title: 'Growth', icon: '📚' },
  ]

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await onSave({
        exercise,
        nutrition,
        sleep,
        stress,
        growth,
        assessed_at: new Date().toISOString(),
      })
    } finally {
      setSaving(false)
    }
  }, [exercise, nutrition, sleep, stress, growth, onSave])

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-12 pt-20">
      <div className="w-full max-w-lg">
        {/* Header */}
        <h1 className="font-display text-3xl md:text-4xl font-semibold text-neutral-800 text-center mb-2">
          Your personal wellness
        </h1>
        <p className="text-lg text-neutral-500 text-center mb-2">
          {userName}, tell us about your health and growth goals.
        </p>
        <p className="text-sm text-neutral-400 text-center mb-8">
          This powers your personal coaching in the daily script.
        </p>

        {/* Section tabs */}
        <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
          {sections.map((s, i) => (
            <button
              key={s.title}
              onClick={() => setActiveSection(i)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-all ${
                activeSection === i
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              <span>{s.icon}</span>
              {s.title}
            </button>
          ))}
        </div>

        {/* Exercise section */}
        {activeSection === 0 && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader title="Exercise & Movement" subtitle="How do you want to move your body?" />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">What are your exercise goals?</label>
              <textarea
                value={exercise.goals}
                onChange={(e) => setExercise(prev => ({ ...prev, goals: e.target.value }))}
                placeholder="e.g. Exercise 4x/week, run a half marathon, get back to CrossFit consistently"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Current habits</label>
              <textarea
                value={exercise.current_habits}
                onChange={(e) => setExercise(prev => ({ ...prev, current_habits: e.target.value }))}
                placeholder="e.g. CrossFit 2-3x/week, walk the dog daily, occasional weekend hike"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
            <TagInput
              label="Preferred activities"
              placeholder="e.g. CrossFit, running, hiking"
              tags={exercise.preferred_activities}
              onAdd={(tag) => setExercise(prev => ({ ...prev, preferred_activities: [...prev.preferred_activities, tag] }))}
              onRemove={(i) => setExercise(prev => ({ ...prev, preferred_activities: prev.preferred_activities.filter((_, idx) => idx !== i) }))}
            />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Ideal schedule</label>
              <input
                type="text"
                value={exercise.schedule}
                onChange={(e) => setExercise(prev => ({ ...prev, schedule: e.target.value }))}
                placeholder="e.g. M/W/F mornings, Sat long run"
                className="input-base w-full text-sm"
              />
            </div>
          </div>
        )}

        {/* Nutrition section */}
        {activeSection === 1 && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader title="Nutrition & Eating" subtitle="What does healthy eating look like for you?" />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Nutrition goals</label>
              <textarea
                value={nutrition.goals}
                onChange={(e) => setNutrition(prev => ({ ...prev, goals: e.target.value }))}
                placeholder="e.g. Stop skipping lunch, eat more vegetables, cook at home 5x/week"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
            <TagInput
              label="Dietary restrictions"
              placeholder="e.g. gluten-free, no dairy"
              tags={nutrition.restrictions}
              onAdd={(tag) => setNutrition(prev => ({ ...prev, restrictions: [...prev.restrictions, tag] }))}
              onRemove={(i) => setNutrition(prev => ({ ...prev, restrictions: prev.restrictions.filter((_, idx) => idx !== i) }))}
            />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Current eating habits</label>
              <textarea
                value={nutrition.current_habits}
                onChange={(e) => setNutrition(prev => ({ ...prev, current_habits: e.target.value }))}
                placeholder="e.g. Skip lunch most days, eat out 3x/week, good at breakfast"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Meal preferences</label>
              <input
                type="text"
                value={nutrition.meal_preferences}
                onChange={(e) => setNutrition(prev => ({ ...prev, meal_preferences: e.target.value }))}
                placeholder="e.g. Quick meals, batch cooking on Sunday"
                className="input-base w-full text-sm"
              />
            </div>
          </div>
        )}

        {/* Sleep section */}
        {activeSection === 2 && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader title="Sleep & Rest" subtitle="Your sleep patterns and goals." />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Target bedtime</label>
                <input
                  type="time"
                  value={sleep.target_bedtime}
                  onChange={(e) => setSleep(prev => ({ ...prev, target_bedtime: e.target.value }))}
                  className="input-base w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-600 mb-1">Target wake time</label>
                <input
                  type="time"
                  value={sleep.target_waketime}
                  onChange={(e) => setSleep(prev => ({ ...prev, target_waketime: e.target.value }))}
                  className="input-base w-full text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Current sleep patterns</label>
              <textarea
                value={sleep.current_patterns}
                onChange={(e) => setSleep(prev => ({ ...prev, current_patterns: e.target.value }))}
                placeholder="e.g. Usually up until midnight, phone in bed, wake at 6:30 groggy"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Sleep challenges</label>
              <textarea
                value={sleep.challenges}
                onChange={(e) => setSleep(prev => ({ ...prev, challenges: e.target.value }))}
                placeholder="e.g. Hard to wind down, kids wake me up, screen time before bed"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Stress section */}
        {activeSection === 3 && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader title="Stress & Self-Care" subtitle="What stresses you out and what helps?" />
            <TagInput
              label="Stress triggers"
              placeholder="e.g. work deadlines, morning chaos, clutter"
              tags={stress.triggers}
              onAdd={(tag) => setStress(prev => ({ ...prev, triggers: [...prev.triggers, tag] }))}
              onRemove={(i) => setStress(prev => ({ ...prev, triggers: prev.triggers.filter((_, idx) => idx !== i) }))}
            />
            <TagInput
              label="Coping strategies that work"
              placeholder="e.g. exercise, journaling, walks, music"
              tags={stress.coping_strategies}
              onAdd={(tag) => setStress(prev => ({ ...prev, coping_strategies: [...prev.coping_strategies, tag] }))}
              onRemove={(i) => setStress(prev => ({ ...prev, coping_strategies: prev.coping_strategies.filter((_, idx) => idx !== i) }))}
            />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Warning signs you're overwhelmed</label>
              <textarea
                value={stress.warning_signs}
                onChange={(e) => setStress(prev => ({ ...prev, warning_signs: e.target.value }))}
                placeholder="e.g. I get snappy with the kids, I stop exercising, I start doom-scrolling"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Growth section */}
        {activeSection === 4 && (
          <div className="space-y-4 animate-fade-in">
            <SectionHeader title="Personal Growth" subtitle="What are you working on for yourself?" />
            <TagInput
              label="Growth priorities"
              placeholder="e.g. patience, leadership, creativity"
              tags={growth.priorities}
              onAdd={(tag) => setGrowth(prev => ({ ...prev, priorities: [...prev.priorities, tag] }))}
              onRemove={(i) => setGrowth(prev => ({ ...prev, priorities: prev.priorities.filter((_, idx) => idx !== i) }))}
            />
            <TagInput
              label="Hobbies & interests"
              placeholder="e.g. woodworking, guitar, cooking"
              tags={growth.hobbies}
              onAdd={(tag) => setGrowth(prev => ({ ...prev, hobbies: [...prev.hobbies, tag] }))}
              onRemove={(i) => setGrowth(prev => ({ ...prev, hobbies: prev.hobbies.filter((_, idx) => idx !== i) }))}
            />
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">What are you reading or learning?</label>
              <input
                type="text"
                value={growth.reading}
                onChange={(e) => setGrowth(prev => ({ ...prev, reading: e.target.value }))}
                placeholder="e.g. Currently reading Atomic Habits, learning Spanish on Duolingo"
                className="input-base w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-600 mb-1">Learning goals</label>
              <textarea
                value={growth.learning_goals}
                onChange={(e) => setGrowth(prev => ({ ...prev, learning_goals: e.target.value }))}
                placeholder="e.g. Get better at cooking, learn photography, read 20 books this year"
                className="input-base w-full h-20 resize-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8">
          <button
            onClick={() => activeSection > 0 ? setActiveSection(activeSection - 1) : onSkip()}
            className="text-sm text-neutral-500 hover:text-neutral-700"
          >
            {activeSection > 0 ? 'Back' : 'Skip for now'}
          </button>

          {activeSection < sections.length - 1 ? (
            <button
              onClick={() => setActiveSection(activeSection + 1)}
              className="btn-primary px-6 py-2.5"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-primary px-6 py-2.5 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save wellness profile'}
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 mt-4">
          {sections.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === activeSection ? 'bg-primary-500 w-4' : i < activeSection ? 'bg-primary-300' : 'bg-neutral-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
