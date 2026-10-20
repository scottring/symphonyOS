import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { LookPicker } from './LookPicker'
import { PlacePicker } from './PlacePicker'
import { PlaceScenery } from '@/components/place/PlaceScenery'
import { landscapeArt } from '@/components/place/landscapeArt'
import { PALETTES } from '@/config/landscape'
import { useApplyLook } from '@/hooks/useApplyLook'
import { useSceneryPreferences } from '@/hooks/useSceneryPreferences'

function Applied() { useApplyLook(); const { sceneryLighting } = useSceneryPreferences(); return <span data-testid="lighting">{sceneryLighting}</span> }

describe('LookPicker — Classic or Landscape', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.look
    delete document.documentElement.dataset.palette
  })

  it('starts on Classic, with no palettes and the places shown', () => {
    render(<><LookPicker /><PlacePicker /></>)
    expect(screen.getByRole('radio', { name: /Classic/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByRole('radiogroup', { name: 'Palette' })).toBeNull()
    expect(screen.getByText('Woodsy Cabin')).toBeInTheDocument()
  })

  it('Landscape marks the page, offers the six palettes, hides the places and draws its own hills', async () => {
    const { user, container } = render(<><Applied /><LookPicker /><PlacePicker /><PlaceScenery scroller={null} /></>)
    await user.click(screen.getByRole('radio', { name: /Landscape/ }))
    expect(document.documentElement.dataset.look).toBe('landscape')
    expect(document.documentElement.dataset.palette).toBe('dusk')
    expect(localStorage.getItem('symphony-look')).toBe('landscape')
    for (const p of PALETTES) expect(screen.getByRole('radio', { name: p.name })).toBeInTheDocument()
    expect(screen.queryByText('Woodsy Cabin')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Style' })).toBeNull()
    expect(container.querySelector('.place-scenery-panorama')).toHaveAttribute('src', landscapeArt('dusk').src)
    expect(screen.getByTestId('lighting')).toHaveTextContent('dusk-dawn')

    await user.click(screen.getByRole('radio', { name: 'Night' }))
    expect(document.documentElement.dataset.palette).toBe('night')
    expect(screen.getByTestId('lighting')).toHaveTextContent('nighttime')
    expect(container.querySelector('.place-scenery-panorama')).toHaveAttribute('src', landscapeArt('night').src)

    await user.click(screen.getByRole('radio', { name: /Classic/ }))
    expect(document.documentElement.dataset.look).toBeUndefined()
    expect(document.documentElement.dataset.palette).toBeUndefined()
    expect(screen.getByText('Woodsy Cabin')).toBeInTheDocument()
  })
})

describe('landscapeArt', () => {
  it('draws each palette as SVG the CSS url() can carry, with its skyline', () => {
    for (const p of PALETTES) {
      const art = landscapeArt(p.id)
      expect(art.src.startsWith('data:image/svg+xml')).toBe(true)
      expect(art.src).not.toMatch(/[()']/)
      expect(art.veil).not.toMatch(/[()']/)
      expect(decodeURIComponent(art.src)).toContain(p.hills[0])
      expect(art.skyline).toBeGreaterThan(0)
      expect(art.skyline).toBeLessThan(1)
    }
  })
})
