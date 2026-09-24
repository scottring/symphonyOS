// The secondary destinations behind "More" — one list for the desktop menu
// and the phone sheet, so the two cannot drift apart again (the phone sheet
// had silently lost Notes, Documents, House and Meal shelf).

export interface MoreDestination {
  label: string
  route: string
}

export const MORE_GROUPS: [string, MoreDestination[]][] = [
  ['Organize', [{ label: 'Someday', route: '/someday' }]],
  ['Home', [
    { label: 'Meals', route: '/meals/plan' },
    { label: 'Meal shelf', route: '/meals/shelf' },
    { label: 'Lists', route: '/lists' },
    { label: 'House', route: '/home' },
  ]],
  ['Reference', [
    { label: 'Discussions', route: '/discussions' },
    { label: 'Contacts', route: '/contacts' },
    { label: 'Documents', route: '/documents' },
    { label: 'Notes', route: '/notes' },
    { label: 'History', route: '/history' },
    { label: 'Getting started', route: '/today?welcome=1' },
    // The printable sheets. Reachable by URL since they shipped, but nothing
    // in this layout's navigation pointed at them (live check, 2026-09-24) —
    // and a guide nobody can find is a guide nobody reads.
    { label: 'Planning guide', route: '/guide' },
  ]],
]

/** True when `pathname` is (or is inside) the destination's page. */
export function isDestinationActive(route: string, pathname: string): boolean {
  const path = route.split('?')[0]
  if (path === '/today') return false // Getting started is an overlay on Today, not a page
  return pathname === path || pathname.startsWith(`${path}/`)
    // Meals has one app with two entry routes; highlight only the exact one.
    || (path === '/meals/plan' && pathname === '/meals')
}
