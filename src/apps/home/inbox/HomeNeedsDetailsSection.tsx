import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useHomes } from '@/hooks/useHomes'
import { useAssets } from '@/hooks/useAssets'
import { useSpaces } from '@/hooks/useSpaces'

export function HomeNeedsDetailsSection() {
  const { homes } = useHomes()
  const home = homes[0]
  const { needsDetailsAssets, loading } = useAssets(home?.id)
  const { spaces } = useSpaces(home?.id)
  const sectionRef = useRef<HTMLDivElement>(null)
  const [params] = useSearchParams()

  useEffect(() => {
    if (params.get('section') === 'home') {
      sectionRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [params])

  if (loading || !home) return null
  if (needsDetailsAssets.length === 0) return null

  return (
    <div ref={sectionRef}>
      <section className="mb-6">
        <h2 className="font-display text-sm tracking-wide text-neutral-400 uppercase mb-3">
          Home items needing details ({needsDetailsAssets.length})
        </h2>
        <ul className="space-y-2">
          {needsDetailsAssets.map((a) => {
            const room = spaces.find((s) => s.id === a.spaceId)
            return (
              <li key={a.id} className="card p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {a.photoUrl ? (
                    <img src={a.photoUrl} alt="" className="w-10 h-10 rounded-md object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-neutral-200" aria-hidden />
                  )}
                  <div>
                    <div className="font-medium">{a.name}</div>
                    <div className="text-sm text-neutral-500">{room?.name ?? '—'}</div>
                  </div>
                </div>
                <Link to={`/home/asset/${a.id}`} className="text-sm text-primary-700">Fill in →</Link>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
