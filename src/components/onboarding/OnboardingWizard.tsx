import { useOnboarding, type OnboardingStep } from '@/hooks/useOnboarding'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { useProjects } from '@/hooks/useProjects'
import { useRoutines, type CreateRoutineInput } from '@/hooks/useRoutines'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { OnboardingProgress } from './OnboardingProgress'
import { WelcomeStep } from './steps/WelcomeStep'
import { BuildingBlocksStep } from './steps/BuildingBlocksStep'
import { BrainDumpTasks } from './steps/BrainDumpTasks'
import { BrainDumpProjects } from './steps/BrainDumpProjects'
import { BrainDumpRoutines } from './steps/BrainDumpRoutines'
import { FamilySetup } from './steps/FamilySetup'
import { AssignRoutines } from './steps/AssignRoutines'
import { TriageDemo } from './steps/TriageDemo'
import { TodayPreview } from './steps/TodayPreview'
import { ReviewIntro } from './steps/ReviewIntro'
import { PlanningIntro } from './steps/PlanningIntro'
import { CompleteStep } from './steps/CompleteStep'

interface OnboardingWizardProps {
  onComplete: () => void
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const {
    currentStep,
    loading,
    progress,
    nextStep,
    data,
    addTaskId,
    addProjectId,
    addRoutineId,
    setFamilyMemberIds,
    completeOnboarding,
  } = useOnboarding()

  const { tasks, addTask, updateTask } = useSupabaseTasks()
  const { addProject } = useProjects()
  const { routines, addRoutine, updateRoutine } = useRoutines()
  const { members: familyMembers, addMember, updateMember, deleteMember, refetch: refetchFamily } = useFamilyMembers()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="animate-pulse text-neutral-400">Loading...</div>
      </div>
    )
  }

  const handleAddTask = async (title: string): Promise<string | null> => {
    const id = await addTask(title)
    if (id) {
      addTaskId(id)
      return id
    }
    return null
  }

  const handleAddProject = async (name: string) => {
    const project = await addProject({ name })
    if (project) {
      addProjectId(project.id)
    }
    return project?.id ?? null
  }

  const handleAddRoutine = async (input: CreateRoutineInput) => {
    const routine = await addRoutine(input)
    if (routine) {
      addRoutineId(routine.id)
    }
    return routine?.id ?? null
  }

  const handleComplete = async () => {
    await completeOnboarding()
    onComplete()
  }

  const renderStep = (step: OnboardingStep) => {
    switch (step) {
      case 'welcome':
        return <WelcomeStep onContinue={nextStep} />
      case 'building_blocks':
        return <BuildingBlocksStep onContinue={nextStep} />
      case 'tasks':
        return (
          <BrainDumpTasks
            onAddTask={handleAddTask}
            onContinue={nextStep}
            taskCount={data.taskIds.length}
          />
        )
      case 'projects':
        return (
          <BrainDumpProjects
            onAddProject={handleAddProject}
            onContinue={nextStep}
            onSkip={nextStep}
            projectCount={data.projectIds.length}
          />
        )
      case 'routines':
        return (
          <BrainDumpRoutines
            onAddRoutine={handleAddRoutine}
            onContinue={nextStep}
            onSkip={nextStep}
            routineCount={data.routineIds.length}
          />
        )
      case 'family':
        return (
          <FamilySetup
            members={familyMembers}
            onAddMember={async (member) => {
              const newMember = await addMember(member)
              await refetchFamily()
              setFamilyMemberIds(familyMembers.map(m => m.id))
              return newMember
            }}
            onUpdateMember={updateMember}
            onDeleteMember={deleteMember}
            onContinue={nextStep}
          />
        )
      case 'assign':
        return (
          <AssignRoutines
            routines={routines.filter(r => data.routineIds.includes(r.id))}
            familyMembers={familyMembers}
            onAssign={async (routineId, memberId) => {
              await updateRoutine(routineId, { assigned_to: memberId })
            }}
            onContinue={nextStep}
            onSkip={nextStep}
          />
        )
      case 'triage': {
        // Get first task created during onboarding
        const firstTaskId = data.taskIds[0]
        const firstTask = tasks.find(t => t.id === firstTaskId)
        return (
          <TriageDemo
            task={firstTask ?? null}
            onUpdateTask={updateTask}
            onContinue={nextStep}
          />
        )
      }
      case 'today':
        return <TodayPreview onContinue={nextStep} />
      case 'review':
        return <ReviewIntro onContinue={nextStep} />
      case 'plan':
        return <PlanningIntro onContinue={nextStep} />
      case 'complete':
        return <CompleteStep onComplete={handleComplete} />
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {currentStep !== 'welcome' && currentStep !== 'complete' && (
        <OnboardingProgress progress={progress} currentStep={currentStep} />
      )}
      <div className="animate-fade-in-up">
        {renderStep(currentStep)}
      </div>
    </div>
  )
}
