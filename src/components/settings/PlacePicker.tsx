// Settings → Appearance: pick your place. Five previews of each place's sky
// and landscape in the chosen lighting; tapping one applies instantly
// (scenery + accent re-tint, no reload) and syncs to your profile so it
// follows you across devices. Show scenery and Lighting are device-local.
import { PLACES } from '@/config/places'
import { usePlace } from '@/hooks/usePlace'
import { sceneryArt } from '@/components/place/panoramas'
import { nextAutomaticChange, useSceneryPreferences, type SceneryLightingChoice, type SceneryScene, type SceneryStyle } from '@/hooks/useSceneryPreferences'
import { SectionHeading } from '@/components/layout/SectionHeading'

const LIGHTING_LABEL = { 'daytime': 'Daytime', 'dusk-dawn': 'Dusk / Dawn', 'nighttime': 'Nighttime' } as const

export function PlacePicker() {
  const { place, setPlace } = usePlace()
  const { showScenery, setShowScenery, sceneryLighting, lightingChoice, setSceneryLighting, sceneryStyle, setSceneryStyle, sceneryScene, setSceneryScene } = useSceneryPreferences()
  const next = lightingChoice === 'auto' ? nextAutomaticChange() : null

  return (
    <section>
      <SectionHeading>Your place</SectionHeading>
      <p className="text-sm text-neutral-500 mb-6">
        Your place is Symphony's theme: its scenery and sky, and the accent colour on
        selected tabs, buttons and links. It applies instantly and follows you
        across devices.
      </p>

      <div className="place-display-options">
        <label className="place-scenery-setting">
          <input type="checkbox" checked={showScenery} onChange={e => setShowScenery(e.target.checked)} />
          <span><strong>Show scenery</strong><small>Turn off for more content space. Your theme colours stay.</small></span>
        </label>
        <div className="flex flex-wrap items-center gap-4">
        {/* Faint behind the page (the default), or the full scene in front at
            the foot of the window. */}
        <label className="place-art-setting">Scene
          <select value={sceneryScene} onChange={e => setSceneryScene(e.target.value as SceneryScene)}>
            <option value="faint">Faint, behind the page</option>
            <option value="full">Full, at the foot of the page</option>
          </select>
        </label>
        {/* Painted landscapes or woodblock prints, under the same sky. */}
        <label className="place-art-setting">Style
          <select value={sceneryStyle} onChange={e => setSceneryStyle(e.target.value as SceneryStyle)}>
            <option value="painted">Painted</option>
            <option value="woodblock">Woodblock</option>
          </select>
        </label>
        <label className="place-art-setting">Lighting
          <select value={lightingChoice} onChange={e => setSceneryLighting(e.target.value as SceneryLightingChoice)}>
            <option value="auto">Automatic</option>
            <option value="daytime">Daytime</option>
            <option value="dusk-dawn">Dusk / Dawn</option>
            <option value="nighttime">Nighttime</option>
          </select>
        </label>
        </div>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        {lightingChoice === 'auto' && (
          <>Automatic follows sunrise and sunset: now {LIGHTING_LABEL[sceneryLighting]}
            {next ? `, changing at ${new Date(next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. </>
        )}
        Scenery visibility, scene, style and lighting are saved on this device. Short windows always get the faint scene.
      </p>
      <div className="place-theme-grid">
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
              {/* The place's own sky and landscape, in the chosen light —
                  the same artwork and hue the page wears. */}
              <span className="place-theme-preview" data-sky-place={p.id} data-scenery-lighting={sceneryLighting} aria-hidden="true">
                <img src={sceneryArt(sceneryStyle, p.id, sceneryLighting).src} alt="" loading="lazy" />
              </span>
              <div className="flex items-center gap-1.5">
                {/* The colour this place gives the app. */}
                <span className="shrink-0 w-3 h-3 rounded-full" style={{ background: p.swatch }} aria-hidden="true" />
                <span className="text-sm font-semibold text-neutral-800 leading-tight">{p.name}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-0.5 leading-snug">{p.tagline}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
