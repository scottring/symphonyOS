/** Carry the opt-in workspace through ordinary horizon navigation. */
export function connectedDestination(destination: string, currentSearch: string): string {
  const current = new URLSearchParams(currentSearch).get('view')
  if (current !== 'alongside' && current !== 'constellation' && new URLSearchParams(currentSearch).get('workspace') !== '1') return destination
  const [path, query = ''] = destination.split('?')
  const period = path.slice(1)
  const params = new URLSearchParams(query)
  if (!['year','season','month','week','today'].includes(period)) {
    params.set('workspace', '1')
    return `${path}?${params}`
  }
  params.set('view', period === 'week' || period === 'today' ? 'alongside' : 'constellation')
  if (period === 'year' || period === 'season' || period === 'month') params.set('horizon', String(['year','season','month'].indexOf(period)))
  return `${path}?${params}`
}
