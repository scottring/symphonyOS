// Settings → The look: Classic (today's look, with the place themes) or
// Landscape (stage 2: one soft-hills style, with a colour palette as the
// theme). Both are saved on this device and apply instantly; switching back
// to Classic changes nothing in anyone's plans.
import { PALETTES } from '@/config/landscape'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'
import { SectionHeading } from '@/components/layout/SectionHeading'

export function LookPicker() {
  const { look, setLook, palette, setPalette } = useSceneryPreferences()
  return (
    <section>
      <SectionHeading>The look</SectionHeading>
      <p className="text-sm text-neutral-500 mb-4">
        Classic keeps today’s look and your place. Landscape is the new look: a soft sky over
        rounded hills, with a palette as the theme. Saved on this device; switch back any time.
      </p>
      <div role="radiogroup" aria-label="The look" className="look-options">
        <button type="button" role="radio" aria-checked={look === 'classic'} onClick={() => setLook('classic')} className="look-option">
          <span className="look-option-preview is-classic" aria-hidden="true" />
          <span className="look-option-name">Classic</span>
          <span className="look-option-note">Today’s look, with place themes</span>
        </button>
        <button type="button" role="radio" aria-checked={look === 'landscape'} onClick={() => setLook('landscape')} className="look-option">
          <span className="look-option-preview is-landscape" aria-hidden="true" />
          <span className="look-option-name">Landscape</span>
          <span className="look-option-note">New · sky, hills and a palette</span>
        </button>
      </div>
      {look === 'landscape' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mt-6 mb-3">Palette</p>
          <div role="radiogroup" aria-label="Palette" className="look-palettes">
            {PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={palette === p.id}
                onClick={() => setPalette(p.id)}
                className="look-palette"
              >
                <span
                  className="look-palette-swatch"
                  aria-hidden="true"
                  style={{ background: `linear-gradient(${p.sky[0]}, ${p.sky[1]} 55%, ${p.sky[2]})`, boxShadow: `inset 0 -14px 0 ${p.hills[1]}` }}
                />
                <span className="look-palette-name">{p.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
