import { useLocation } from 'react-router-dom'
import { AssigneeFilter } from '@/components/home/AssigneeFilter'
import { useAssigneeFilter } from '@/hooks/useAssigneeFilter'
import { useFamilyMembers } from '@/hooks/useFamilyMembers'
import { planPeriodForPath } from './PlanNavigation'

/** The pages the people filter narrows: the horizons and the Inbox. */
export function peopleFilterApplies(pathname: string): boolean {
  return !!planPeriodForPath(pathname) || pathname === '/inbox' || pathname.endsWith('/tasks-new/inbox')
}

/**
 * The people filter, in the top bar beside Areas (Scott, 2026-10-02). It is
 * one persisted choice (useAssigneeFilter) that Today, Week, Month, Season,
 * Year and the Inbox all read, so it lives with the other app-wide lens
 * rather than in each page's heading — where it read as a filter of that page
 * alone. Hidden on pages it doesn't narrow; the icon becomes the chosen
 * person's avatar while it is on, so a narrowed page never passes for the
 * whole household.
 */
export function HeaderPeopleFilter() {
  const { pathname } = useLocation()
  const [selected, setSelected] = useAssigneeFilter()
  const { members } = useFamilyMembers()
  if (!peopleFilterApplies(pathname) || members.length === 0) return null
  return <AssigneeFilter variant="header" selectedAssignees={selected} onSelectAssignees={setSelected} assigneesWithTasks={members} hasUnassignedTasks />
}
