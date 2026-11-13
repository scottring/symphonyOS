import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const prefs = { showScenery: true, sceneryBackground: 'overlook' as 'overlook' | 'train-yard' }
vi.mock('@/hooks/useSceneryPreferences', () => ({ useSceneryPreferences: () => prefs }))

import { HeadingPrint } from './HeadingPrint'

describe("Today's heading print (Scott, 2026-11-13)", () => {
  beforeEach(() => { prefs.showScenery = true; prefs.sceneryBackground = 'overlook' })

  it('draws the chosen print as decoration only', () => {
    const { getByTestId } = render(<HeadingPrint />)
    const print = getByTestId('heading-print')
    expect(print).toHaveAttribute('aria-hidden', 'true')
    expect(print).toHaveAttribute('data-background', 'overlook')
    expect(print.querySelectorAll('img')).toHaveLength(1)
    expect(print.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
    expect(print.style.getPropertyValue('--heading-print-focus')).toBe('center 26%')
  })

  it('follows the background chosen in Scenery', () => {
    prefs.sceneryBackground = 'train-yard'
    const { getByTestId } = render(<HeadingPrint />)
    expect(getByTestId('heading-print')).toHaveAttribute('data-background', 'train-yard')
    expect(getByTestId('heading-print').style.getPropertyValue('--heading-print-focus')).toBe('center 55%')
  })

  it('goes away when the Scenery switch is off', () => {
    prefs.showScenery = false
    const { queryByTestId } = render(<HeadingPrint />)
    expect(queryByTestId('heading-print')).toBeNull()
  })
})

describe("Scott's own prints in the heading (2026-11-13)", () => {
  it('a print with a heading picture shows it whole, not the cut band', async () => {
    const { PRINTS } = await import('./panoramas')
    prefs.showScenery = true
    prefs.sceneryBackground = 'subway' as never
    const { getByTestId } = render(<HeadingPrint />)
    const img = getByTestId('heading-print').querySelector('img')!
    expect(img.getAttribute('src')).toBe(PRINTS.subway.headingSrc)
    expect(PRINTS.subway.headingSrc).not.toBe(PRINTS.subway.src)
  })
})
