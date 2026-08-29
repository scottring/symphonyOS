import { Suspense, useCallback, useMemo, useState, lazy } from 'react'
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation,
  Navigate,
} from 'react-router-dom'
import type { RecurrencePattern } from '@/types/actionable'
import { useRoutines } from '@/hooks/useRoutines'
import { useContacts } from '@/hooks/useContacts'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useDomain } from '@/hooks/useDomain'
import { matchesLayers } from '@/lib/today/domainFilter'
import { RoutinesList, RoutineForm, RoutineInput } from '@/components/lazy'
import { groupRoutineSteps } from '@/lib/today/routineCollections'
import { nextStepOrder } from '@/lib/today/stepOrdering'
import { LoadingFallback } from '@/components/layout/LoadingFallback'

const RoutineBuilderModal = lazy(() =>
  import('@/components/routine/RoutineBuilderModal').then(m => ({ default: m.RoutineBuilderModal }))
)

/**
 * Routines surface, mounted by the Shell at /routines/*. The inner <Routes>
 * match segments relative to /routines (the parent route ends in /*):
 *   index        -> RoutinesList
 *   new          -> RoutineInput (natural-language create)
 *   :routineId   -> RoutineForm (edit)
 *
 * Mirrors the legacy ViewRouter `routines` branch. The list + create are domain
 * filtered/tagged using useDomain (the legacy `currentDomain` prop). The new
 * routine create reads the `?initial=` query param like ViewRouter did.
 */
function RoutinesIndex() {
  const navigate = useNavigate()
  const { currentDomain, layers } = useDomain()
  const { routines, addRoutine, updateRoutine, deleteRoutine, loading } = useRoutines()
  const { contacts } = useContacts()
  const { members: familyMembers } = useFamilyMembers()
  const [builderOpen, setBuilderOpen] = useState(false)

  // Steps travel with their parent through the layer lens — a Step inherits
  // its collection's layer, so an unstamped step must not strip a matching
  // collection down to a bare routine.
  const filtered = useMemo(() => {
    const byId = new Map(routines.map((r) => [r.id, r]))
    return routines.filter((r) => {
      if (matchesLayers(r.context, layers)) return true
      const parent = r.parent_routine_id ? byId.get(r.parent_routine_id) : undefined
      return !!parent && matchesLayers(parent.context, layers)
    })
  }, [routines, layers])

  const handleAddStep = useCallback(async (collectionId: string, name: string) => {
    const { collections } = groupRoutineSteps(routines)
    const steps = collections.find(c => c.id === collectionId)?.steps ?? []
    const parent = routines.find(r => r.id === collectionId)
    await addRoutine({ name, parent_routine_id: collectionId, step_order: nextStepOrder(steps), context: parent?.context ?? undefined })
  }, [routines, addRoutine])

  // Batch add (document → steps extraction): order is computed once up front
  // so sequential inserts don't all land on the same step_order.
  const handleAddSteps = useCallback(async (collectionId: string, stepsToAdd: { name: string; detail?: string }[]) => {
    const { collections } = groupRoutineSteps(routines)
    const existing = collections.find(c => c.id === collectionId)?.steps ?? []
    const base = nextStepOrder(existing)
    const parent = routines.find(r => r.id === collectionId)
    for (let i = 0; i < stepsToAdd.length; i++) {
      await addRoutine({
        name: stepsToAdd[i].name,
        description: stepsToAdd[i].detail,
        parent_routine_id: collectionId,
        step_order: base + i,
        recurrence_pattern: parent?.recurrence_pattern,
        context: parent?.context ?? undefined,
      })
    }
  }, [routines, addRoutine])

  const handleReorderSteps = useCallback(async (writes: { id: string; step_order: number }[]) => {
    await Promise.all(writes.map(w => updateRoutine(w.id, { step_order: w.step_order })))
  }, [updateRoutine])

  const handlePromoteStep = useCallback(async (stepId: string) => {
    await updateRoutine(stepId, { parent_routine_id: null, step_order: null })
  }, [updateRoutine])

  // Stamp the active domain lens on creation: an unstamped routine is
  // invisible in a domain-filtered list the instant it's created — the
  // "New routine button does nothing" bug (it worked; the lens hid it).
  const handleCreateCollection = useCallback(async (name: string) => {
    return addRoutine({ name, context: currentDomain !== 'universal' ? currentDomain : undefined })
  }, [addRoutine, currentDomain])

  const handleGroupIntoCollection = useCallback(async (
    name: string,
    ids: string[],
    opts?: { time_of_day?: string; recurrence_pattern?: RecurrencePattern },
  ) => {
    const parent = await addRoutine({
      name,
      context: currentDomain !== 'universal' ? currentDomain : undefined,
      time_of_day: opts?.time_of_day,
      recurrence_pattern: opts?.recurrence_pattern,
    })
    if (!parent) return
    await Promise.all(ids.map((id, i) => updateRoutine(id, { parent_routine_id: parent.id, step_order: i })))
  }, [addRoutine, updateRoutine, currentDomain])

  // Fold existing routines into an existing routine as steps, appended after
  // any steps it already has.
  const handleAddToCollection = useCallback(async (collectionId: string, ids: string[]) => {
    const { collections } = groupRoutineSteps(routines)
    const existing = collections.find(c => c.id === collectionId)?.steps ?? []
    const base = nextStepOrder(existing)
    await Promise.all(ids.map((id, i) => updateRoutine(id, { parent_routine_id: collectionId, step_order: base + i })))
  }, [routines, updateRoutine])

  return (
    <Suspense fallback={<LoadingFallback />}>
      <RoutinesList
        routines={filtered}
        loading={loading}
        contacts={contacts}
        familyMembers={familyMembers}
        onCreateRoutine={() => navigate('/routines/new')}
        onUpdateRoutine={updateRoutine}
        onAddStep={handleAddStep}
        onAddSteps={handleAddSteps}
        onReorderSteps={handleReorderSteps}
        onPromoteStep={handlePromoteStep}
        onDeleteStep={deleteRoutine}
        onDelete={deleteRoutine}
        onCreateCollection={handleCreateCollection}
        onGroupIntoCollection={handleGroupIntoCollection}
        onAddToCollection={handleAddToCollection}
        onBuildWithAI={() => setBuilderOpen(true)}
      />
      {builderOpen && (
        <RoutineBuilderModal
          onClose={() => setBuilderOpen(false)}
          onCreated={(routineId) => {
            setBuilderOpen(false)
            navigate(`/routines/${routineId}`)
          }}
        />
      )}
    </Suspense>
  )
}

function RoutineCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentDomain } = useDomain()
  const { contacts } = useContacts()
  const { addRoutine } = useRoutines()

  const initialNlInput = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('initial') ?? ''
  }, [location.search])

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 p-6 pb-0">
          <button
            onClick={() => navigate('/routines')}
            className="p-2 -ml-2 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <h1 className="text-xl font-semibold text-neutral-800">New Routine</h1>
        </div>
        <Suspense fallback={<LoadingFallback />}>
          <RoutineInput
            contacts={contacts}
            initialValue={initialNlInput}
            onSave={async (input) => {
              await addRoutine({
                ...input,
                context: currentDomain !== 'universal' ? currentDomain : undefined,
              })
              navigate('/routines')
            }}
            onCancel={() => navigate('/routines')}
          />
        </Suspense>
      </div>
    </div>
  )
}

function RoutineEdit() {
  const navigate = useNavigate()
  const { routineId } = useParams<{ routineId: string }>()
  const { routines, updateRoutine, deleteRoutine, toggleVisibility } = useRoutines()
  const { contacts } = useContacts()
  const { members: familyMembers } = useFamilyMembers()
  const pinnedItems = usePinnedItems()

  const routine = routines.find((r) => r.id === routineId) ?? null

  if (!routine) {
    return routines.length > 0 ? <Navigate to="/routines" replace /> : <LoadingFallback />
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <RoutineForm
        key={routine.id}
        routine={routine}
        contacts={contacts}
        familyMembers={familyMembers}
        onBack={() => navigate('/routines')}
        onUpdate={updateRoutine}
        onDelete={deleteRoutine}
        onToggleVisibility={toggleVisibility}
        isPinned={pinnedItems.isPinned('routine', routine.id)}
        canPin={pinnedItems.canPin()}
        onPin={() => pinnedItems.pin('routine', routine.id)}
        onUnpin={() => pinnedItems.unpin('routine', routine.id)}
      />
    </Suspense>
  )
}

export function RoutinesApp() {
  return (
    <Routes>
      <Route index element={<RoutinesIndex />} />
      <Route path="new" element={<RoutineCreate />} />
      <Route path=":routineId" element={<RoutineEdit />} />
      <Route path="*" element={<Navigate to="/routines" replace />} />
    </Routes>
  )
}
