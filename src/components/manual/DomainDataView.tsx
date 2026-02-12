export function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim()
}

export function DomainDataView({ data }: { domainId: string; data: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(data).map(([key, value]) => {
        if (typeof value === 'string' && value) {
          return (
            <div key={key}>
              <h4 className="text-xs font-medium text-stone-500 mb-2">{formatLabel(key)}</h4>
              <p className="text-sm text-stone-600">{value}</p>
            </div>
          )
        }
        if (Array.isArray(value) && value.length > 0) {
          if (typeof value[0] === 'string') {
            return (
              <div key={key}>
                <h4 className="text-xs font-medium text-stone-500 mb-2">{formatLabel(key)}</h4>
                <ul className="space-y-1">
                  {value.map((s: string, i: number) => (
                    <li key={i} className="text-sm text-stone-600 flex items-start gap-2">
                      <span className="text-stone-400 mt-0.5">&#8226;</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )
          }
          if (typeof value[0] === 'object') {
            return (
              <div key={key}>
                <h4 className="text-xs font-medium text-stone-500 mb-2">{formatLabel(key)}</h4>
                {value.map((item: Record<string, unknown>, i: number) => {
                  const name = item.name ? String(item.name) : ''
                  const area = item.area ? String(item.area) : ''
                  const desc = item.description ? String(item.description) : ''
                  const owner = item.owner ? String(item.owner) : ''
                  const freq = item.frequency ? String(item.frequency) : ''
                  const stmt = item.statement ? String(item.statement) : ''
                  const sat = item.satisfaction ? String(item.satisfaction) : ''
                  const eff = item.effectiveness ? String(item.effectiveness) : ''
                  return (
                    <div key={i} className="text-sm text-stone-600 mb-2">
                      {name && <span className="font-medium">{name}</span>}
                      {area && <span className="font-medium">{area}</span>}
                      {desc && <span className="text-stone-400"> &mdash; {desc}</span>}
                      {owner && <span className="text-stone-400"> ({owner})</span>}
                      {freq && <span className="text-xs text-stone-400 ml-1">({freq})</span>}
                      {stmt && <span>{stmt}</span>}
                      {sat && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ml-2 ${
                          sat === 'working' ? 'bg-emerald-50 text-emerald-600' :
                          sat === 'needs-discussion' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>{sat}</span>
                      )}
                      {eff && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ml-2 ${
                          eff === 'working' ? 'bg-emerald-50 text-emerald-600' :
                          eff === 'inconsistent' ? 'bg-amber-50 text-amber-600' :
                          'bg-red-50 text-red-600'
                        }`}>{eff}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          }
        }
        return null
      })}
    </div>
  )
}
