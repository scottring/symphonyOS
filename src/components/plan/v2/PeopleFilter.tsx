import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'

/** The people filter in a horizon's toolbar — the control Today wears, on
 *  the same persisted choice (useAssigneeFilter), so it follows you from Today
 *  to the Week, Month, Season and Year. Pages apply it with planPeopleLens. */
export function PeopleFilter() {
  const [selected, setSelected] = useAssigneeFilter()
  const { members } = useFamilyMembers()
  if (members.length === 0) return null
  return <AssigneeFilter selectedAssignees={selected} onSelectAssignees={setSelected} assigneesWithTasks={members} hasUnassignedTasks />
}
