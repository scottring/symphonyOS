import { Suspense, useCallback, useMemo } from 'react'
import {
  Routes,
  Route,
  useNavigate,
  useParams,
  useLocation,
  Navigate,
} from 'react-router-dom'
import { useRoutines } from '@/hooks/useRoutines'
import { useContacts } from '@/hooks/useContacts'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { usePinnedItems } from '@/hooks/usePinnedItems'
import { useDomain } from '@/hooks/useDomain'
import { matchesLayers } from '@/lib/today/domainFilter'
import { RoutinesList, RoutineForm, RoutineInput } from '@/components/lazy'
import { LoadingFallback } from '@/components/layout/LoadingFallback'
import { useConversationWalk } from '@/components/canvas/conversationWalk'
import { useAssistantLauncher } from '@/contexts/AssistantLaunchContext'

/** Changing routines is a conversation (spec 2026-10-14-routines-talk-first):
 *  Symphony reads the week's routines, then asks what is changing, and ends
 *  in the change card. */
const CHANGE_WALK = {
  label: 'Change our routines',
  message: "Let's change our routines. Read this week's routines first (symphony_read_week), then ask me what's changing.",
}

/**
 * Routines surface, mounted by the Shell at /routines/*. The inner <Routes>
 * match segments relative to /routines (the parent route ends in /*):
 *   index        -> RoutinesList (the picture of the week, RoutinesPicture)
 *   new          -> RoutineInput (natural-language create)
 *   :routineId   -> RoutineForm (edit)
 *
 * The picture is filtered by the area lens (useDomain); tapping a routine
 * opens it in the shared detail pane, where its edits live.
 */
function RoutinesIndex() {
  const { layers, all: showAllDomains } = useDomain()
  const { routines, loading } = useRoutines()
  const { members: familyMembers } = useFamilyMembers()

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

  // The bar offers "Change our routines"; phones have no bar, so the page
  // offers the same walk, sent the same way (as Week does).
  const walkInBar = useConversationWalk(CHANGE_WALK)
  const { openAssistant } = useAssistantLauncher()
  const startWalk = useCallback(() => openAssistant({ message: CHANGE_WALK.message, autoSend: true }), [openAssistant])

  return (
    <Suspense fallback={<LoadingFallback />}>
      <RoutinesList
        routines={filtered}
        loading={loading}
        hiddenByFilter={routines.length > 0 && filtered.length === 0}
        onShowAllDomains={showAllDomains}
        familyMembers={familyMembers}
        layers={layers}
        walk={walkInBar ? undefined : { label: CHANGE_WALK.label, onStart: startWalk }}
      />
    </Suspense>
  )
}

function RoutineCreate() {
  const navigate = useNavigate()
  const location = useLocation()
  const { soleDomain } = useDomain()
  const { contacts } = useContacts()
  const { addRoutine } = useRoutines()

  const initialNlInput = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('initial') ?? ''
  }, [location.search])

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mr-auto">
        <div className="flex items-center gap-3 p-6 pb-0">
          <button
            onClick={() => navigate('/routines')}
            aria-label="Back to routines"
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
                context: soleDomain ?? undefined,
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
