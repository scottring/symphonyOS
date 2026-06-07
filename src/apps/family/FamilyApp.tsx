import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { useSupabaseTasks } from '@/hooks/useSupabaseTasks'
import { MemberView } from '@/components/family/MemberView'
import { LoadingFallback } from '@/components/layout/LoadingFallback'

/**
 * Family member surface, mounted by the Shell at /family/*. The inner <Routes>
 * match segments relative to /family (the parent route ends in /*):
 *   :memberId    -> MemberView
 *
 * Mirrors the legacy ViewRouter `family-member` branch. Data comes from the same
 * standalone hooks. Members are opened from family avatars elsewhere in the app
 * via navigate(`/family/:id`) — there is no dedicated sidebar button.
 *
 * Selecting a task from a member navigates to the tasks app's /task/:id route —
 * we do NOT use the Shell's setSelection (the tasks app owns 'task'). Editing the
 * member routes to /settings, matching the legacy onEditInSettings handler.
 */
function FamilyMemberDetail() {
  const navigate = useNavigate()
  const { memberId } = useParams<{ memberId: string }>()
  const { members } = useFamilyMembers()
  const { tasks } = useSupabaseTasks()

  const member = members.find((m) => m.id === memberId) ?? null

  // Members not yet loaded — wait. If loaded and missing, bounce home.
  if (!member) {
    return members.length > 0 ? <Navigate to="/" replace /> : <LoadingFallback />
  }

  return (
    <MemberView
      member={member}
      tasks={tasks}
      onBack={() => navigate('/')}
      onSelectTask={(taskId) => navigate(`/task/${taskId}`)}
      onEditInSettings={() => navigate('/settings')}
    />
  )
}

export function FamilyApp() {
  return (
    <Routes>
      <Route path=":memberId" element={<FamilyMemberDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
