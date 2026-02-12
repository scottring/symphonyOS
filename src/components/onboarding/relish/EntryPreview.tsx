// EntryPreview — Shows preview cards of entries that will be generated from phase data
// These are locally generated (no AI call) to give users a "so what" moment during onboarding

import type { OnboardingPhaseId, DomainId } from '@/types/manual'
import { DOMAIN_NAMES } from '@/types/manual'

interface PreviewEntry {
  type: string
  domain: DomainId
  title: string
  description: string
}

const TYPE_ICONS: Record<string, string> = {
  discussion: 'Discussion',
  story: 'Story',
  checklist: 'Checklist',
  reflection: 'Reflection',
  activity: 'Activity',
  goal: 'Goal',
}

const TYPE_COLORS: Record<string, string> = {
  discussion: 'bg-indigo-50 text-indigo-600',
  story: 'bg-rose-50 text-rose-600',
  checklist: 'bg-teal-50 text-teal-600',
  reflection: 'bg-amber-50 text-amber-700',
  activity: 'bg-green-50 text-green-600',
  goal: 'bg-purple-50 text-purple-600',
}

function generatePreviewEntries(
  structuredData: Record<string, unknown>,
  phaseId: OnboardingPhaseId
): PreviewEntry[] {
  const previews: PreviewEntry[] = []

  if (phaseId === 'foundation') {
    const values = structuredData.values as Record<string, unknown> | undefined
    const comm = structuredData.communication as Record<string, unknown> | undefined

    // If they have values, preview a discussion prompt
    const valueList = (values?.values as Array<{ name: string; description: string }>) || []
    if (valueList.length > 0) {
      const topValue = valueList[0]
      previews.push({
        type: 'discussion',
        domain: 'values',
        title: `"What does ${topValue.name.toLowerCase()} look like this week?"`,
        description: `A family discussion prompt built around your core value of ${topValue.name.toLowerCase()}.`,
      })
    }

    // If they have identity statements, preview a story
    const identityStatements = (values?.identityStatements as string[]) || []
    if (identityStatements.length > 0) {
      previews.push({
        type: 'story',
        domain: 'values',
        title: 'A story about who you are',
        description: `A personalized story woven from your identity: "${identityStatements[0].slice(0, 60)}..."`,
      })
    }

    // If they have repair strategies, preview a checklist
    const repairs = (comm?.repairStrategies as string[]) || []
    if (repairs.length > 0) {
      previews.push({
        type: 'checklist',
        domain: 'communication',
        title: 'After a tough moment',
        description: `A repair checklist based on your strategies: ${repairs.slice(0, 2).join(', ')}.`,
      })
    }
  }

  if (phaseId === 'relationships') {
    const connection = structuredData.connection as Record<string, unknown> | undefined
    const roles = structuredData.roles as Record<string, unknown> | undefined

    // Preview based on rituals
    const rituals = (connection?.rituals as Array<{ name: string }>) || []
    if (rituals.length > 0) {
      previews.push({
        type: 'activity',
        domain: 'connection',
        title: `Deepen "${rituals[0].name}"`,
        description: `An activity to make your ritual of ${rituals[0].name.toLowerCase()} even more meaningful.`,
      })
    }

    // Preview based on role pain points
    const painPoints = (roles?.painPoints as string[]) || []
    if (painPoints.length > 0) {
      previews.push({
        type: 'reflection',
        domain: 'roles',
        title: 'The invisible load',
        description: `A reflection prompt about: "${painPoints[0].slice(0, 60)}..."`,
      })
    }

    // Connection goal
    const connGoals = (connection?.goals as string[]) || []
    if (connGoals.length > 0) {
      previews.push({
        type: 'goal',
        domain: 'connection',
        title: connGoals[0],
        description: 'A tracked goal with milestones to get there.',
      })
    }
  }

  if (phaseId === 'operations') {
    const org = structuredData.organization as Record<string, unknown> | undefined
    const adapt = structuredData.adaptability as Record<string, unknown> | undefined

    // Preview based on routines
    const routines = (org?.routines as Array<{ name: string; frequency: string }>) || []
    if (routines.length > 0) {
      previews.push({
        type: 'checklist',
        domain: 'organization',
        title: `${routines[0].name} checklist`,
        description: `A ${routines[0].frequency} checklist to make "${routines[0].name}" consistent.`,
      })
    }

    // Preview based on stressors
    const stressors = (adapt?.stressors as string[]) || []
    if (stressors.length > 0) {
      previews.push({
        type: 'reflection',
        domain: 'adaptability',
        title: 'When plans fall apart',
        description: `A reflection on how you handled: "${stressors[0].slice(0, 50)}..."`,
      })
    }

    // Organization goals
    const orgGoals = (org?.goals as string[]) || []
    if (orgGoals.length > 0) {
      previews.push({
        type: 'goal',
        domain: 'organization',
        title: orgGoals[0],
        description: 'A concrete goal with weekly action steps.',
      })
    }
  }

  if (phaseId === 'strategy') {
    const ps = structuredData.problemSolving as Record<string, unknown> | undefined
    const res = structuredData.resources as Record<string, unknown> | undefined

    // Preview based on conflict patterns
    const patterns = (ps?.conflictPatterns as string[]) || []
    if (patterns.length > 0) {
      previews.push({
        type: 'discussion',
        domain: 'problemSolving',
        title: 'Breaking the pattern',
        description: `A guided conversation about your dynamic: "${patterns[0].slice(0, 50)}..."`,
      })
    }

    // Preview based on resource tensions
    const tensions = (res?.tensions as string[]) || []
    if (tensions.length > 0) {
      previews.push({
        type: 'reflection',
        domain: 'resources',
        title: 'Where does it really go?',
        description: `A reflection on the tension: "${tensions[0].slice(0, 50)}..."`,
      })
    }

    // Resource goals
    const resGoals = (res?.goals as string[]) || []
    if (resGoals.length > 0) {
      previews.push({
        type: 'goal',
        domain: 'resources',
        title: resGoals[0],
        description: 'A goal cascading from yearly targets to weekly actions.',
      })
    }
  }

  return previews.slice(0, 3)
}

interface EntryPreviewProps {
  phaseId: OnboardingPhaseId
  structuredData: Record<string, unknown>
}

export function EntryPreview({ phaseId, structuredData }: EntryPreviewProps) {
  const previews = generatePreviewEntries(structuredData, phaseId)

  if (previews.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-stone-400 uppercase tracking-wider">
        Here's what we'll build from this...
      </h3>
      <div className="space-y-2">
        {previews.map((preview, i) => (
          <div
            key={i}
            className="flex items-start gap-3 bg-stone-50 rounded-xl p-4 border border-stone-100"
          >
            <div className="shrink-0 mt-0.5">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[preview.type] || 'bg-stone-100 text-stone-500'}`}>
                {TYPE_ICONS[preview.type] || preview.type}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">{preview.title}</p>
              <p className="text-xs text-stone-500 mt-0.5">{preview.description}</p>
              <span className="text-[10px] text-stone-400 mt-1 inline-block">
                {DOMAIN_NAMES[preview.domain]}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-400 italic">
        These are just a preview — the full set will be generated when onboarding is complete.
      </p>
    </div>
  )
}
