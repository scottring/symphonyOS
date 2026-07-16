// Settings → Appearance: pick your place. Five illustrated medallions;
// tapping one applies instantly (sidebar art + accent re-tint, no reload)
// and syncs to your profile so it follows you across devices.
import { PLACES } from '@/config/places'
import { usePlace } from '@/hooks/usePlace'
import { PlaceMedallion } from '@/components/place/PlaceMedallion'

export function PlacePicker() {
  const { place, setPlace } = usePlace()

  return (
    <section>
      <h2 className="text-lg font-semibold text-neutral-700 mb-2">Your place</h2>
      <p className="text-sm text-neutral-500 mb-6">
        Where does your world live? Your place sets the artwork and the app's accent
        colors — it applies instantly and follows you across devices.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {PLACES.map((p) => {
          const active = p.id === place
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlace(p.id)}
              aria-pressed={active}
              className={`
                relative p-3 rounded-2xl border-2 text-left transition-all
                ${active
                  ? 'border-primary-500 bg-primary-50 shadow-md'
                  : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'}
              `}
            >
              <PlaceMedallion place={p.id} className="w-full aspect-square mb-2" />
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-neutral-800 leading-tight">{p.name}</span>
                {active && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-primary-500" aria-hidden="true" />
                )}
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{p.tagline}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
