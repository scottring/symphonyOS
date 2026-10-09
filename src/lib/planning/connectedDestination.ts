/** The connected workspace is the normal navigation destination. */
export function connectedDestination(destination: string, _currentSearch: string): string {
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

/** Upgrade old planning bookmarks without losing dates, selections or hash links. */
export function defaultPlanningDestination(path: string, search: string): string | null {
 const period=path.slice(1)
 if (!['today','week','month','season','year'].includes(period)) return null
 const params=new URLSearchParams(search)
 const expected=['today','week'].includes(period)?'alongside':'constellation'
 if(params.get('view')===expected) return null
 params.set('view',expected)
 if(expected==='constellation') params.set('horizon',String(['year','season','month'].indexOf(period)))
 return `${path}?${params}`
}
