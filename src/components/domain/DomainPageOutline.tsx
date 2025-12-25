import { useDomain } from '@/hooks/useDomain'
import type { ReactNode } from 'react'

interface DomainPageOutlineProps {
  children: ReactNode
}

export function DomainPageOutline({ children }: DomainPageOutlineProps) {
  const { currentDomain } = useDomain()

  // Define organic, paper-like border effects for each domain
  const outlineEffects = {
    universal: {
      border: '',
      cornerColor: '',
      vignetteColor: '',
    },
    work: {
      border: 'shadow-[inset_0_0_0_2px_rgb(59_130_246/0.12)]',
      cornerColor: 'rgb(59 130 246)',
      vignetteColor: 'rgba(59,130,246,0.02)',
    },
    family: {
      border: 'shadow-[inset_0_0_0_2px_rgb(251_191_36/0.12)]',
      cornerColor: 'rgb(251 191 36)',
      vignetteColor: 'rgba(251,191,36,0.02)',
    },
    personal: {
      border: 'shadow-[inset_0_0_0_2px_rgb(168_85_247/0.12)]',
      cornerColor: 'rgb(168 85 247)',
      vignetteColor: 'rgba(168,85,247,0.02)',
    },
  }

  const effect = outlineEffects[currentDomain]

  return (
    <div
      className={`
        relative h-full transition-all duration-500 ease-out
        ${effect.border}
      `}
    >
      {/* Subtle vignette effect for depth - organic fade */}
      {currentDomain !== 'universal' && (
        <>
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{
              background: `
                radial-gradient(ellipse at top left, ${effect.vignetteColor} 0%, transparent 50%),
                radial-gradient(ellipse at top right, ${effect.vignetteColor} 0%, transparent 50%),
                radial-gradient(ellipse at bottom left, ${effect.vignetteColor} 0%, transparent 50%),
                radial-gradient(ellipse at bottom right, ${effect.vignetteColor} 0%, transparent 50%)
              `,
            }}
          />

          {/* Decorative corner accents - hand-drawn feel */}
          <div className="pointer-events-none absolute inset-0 transition-opacity duration-500">
            {/* Top-left corner flourish */}
            <svg
              className="absolute top-0 left-0 w-20 h-20 opacity-[0.15]"
              viewBox="0 0 80 80"
              fill="none"
              style={{ filter: 'blur(0.5px)' }}
            >
              <path
                d="M0 0 L0 32 C0 14.327 14.327 0 32 0 L0 0Z"
                fill={effect.cornerColor}
                opacity="0.4"
              />
              <path
                d="M0 8 L0 16 C0 11.582 3.582 8 8 8 L0 8Z"
                fill={effect.cornerColor}
                opacity="0.6"
              />
            </svg>

            {/* Bottom-right corner flourish */}
            <svg
              className="absolute bottom-0 right-0 w-20 h-20 opacity-[0.15]"
              viewBox="0 0 80 80"
              fill="none"
              style={{ filter: 'blur(0.5px)' }}
            >
              <path
                d="M80 80 L80 48 C80 65.673 65.673 80 48 80 L80 80Z"
                fill={effect.cornerColor}
                opacity="0.4"
              />
              <path
                d="M80 72 L80 64 C80 68.418 76.418 72 72 72 L80 72Z"
                fill={effect.cornerColor}
                opacity="0.6"
              />
            </svg>
          </div>
        </>
      )}

      {children}
    </div>
  )
}
