import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { PlacePicker } from './PlacePicker'
import { PLACES } from '@/config/places'
import { PlaceScenery } from '@/components/place/PlaceScenery'
import { PANORAMAS, WOODBLOCK } from '@/components/place/panoramas'

describe('PlacePicker', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { delete document.documentElement.dataset.place })

  it('renders all five places with the default pressed', () => {
    render(<PlacePicker />)
    for (const p of PLACES) expect(screen.getByText(p.name)).toBeInTheDocument()
    const pressed = screen.getAllByRole('button', { pressed: true })
    expect(pressed).toHaveLength(1)
    expect(pressed[0]).toHaveTextContent('Woodsy Cabin')
  })

  it('tapping a place applies it instantly', async () => {
    const { user } = render(<PlacePicker />)
    await user.click(screen.getByRole('button', { name: /Densely Urban/ }))
    expect(document.documentElement.dataset.place).toBe('urban')
    expect(screen.getByRole('button', { name: /Densely Urban/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shares lighting with the foreground, persists it, and hides scenery without changing place', async () => {
    const { user, container, unmount } = render(<><PlacePicker /><PlaceScenery scroller={null} /></>)
    await user.click(screen.getByRole('button', { name: /Densely Urban/ }))
    for (const lighting of ['dusk-dawn', 'nighttime', 'daytime']) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Lighting' }), lighting)
      const card = screen.getByRole('button', { name: /Densely Urban/ })
      const preview = card.querySelector('img')!
      expect(preview.src).toContain(`painted/urban-${lighting}`)
      // The card's sky wears its own place's hue in the chosen light.
      const sky = card.querySelector('.place-theme-preview')!
      expect(sky).toHaveAttribute('data-sky-place', 'urban')
      expect(sky).toHaveAttribute('data-scenery-lighting', lighting)
      expect(container.querySelector('.place-scenery-panorama')).toHaveAttribute('src', preview.getAttribute('src'))
    }
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lighting' }), 'nighttime')
    await user.click(screen.getByRole('checkbox', { name: /Show scenery/ }))
    expect(container.querySelector('.place-scenery')).toBeNull()
    expect(document.documentElement.dataset.place).toBe('urban')
    unmount()
    render(<PlacePicker />)
    expect(screen.getByRole('combobox', { name: 'Lighting' })).toHaveValue('nighttime')
    expect(screen.getByRole('checkbox', { name: /Show scenery/ })).not.toBeChecked()
  })

  it('Automatic lighting follows the sun and is saved as a choice', async () => {
    const { user, container } = render(<><PlacePicker /><PlaceScenery scroller={null} /></>)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Lighting' }), 'auto')
    expect(localStorage.getItem('symphony-scenery-lighting')).toBe('auto')
    expect(screen.getByRole('combobox', { name: 'Lighting' })).toHaveValue('auto')
    expect(screen.getByText(/Automatic follows sunrise and sunset: now (Daytime|Dusk \/ Dawn|Nighttime)/)).toBeInTheDocument()
    // The page and the previews show one concrete lighting, the same one.
    const lighting = container.querySelector('[data-place-scenery]')!.getAttribute('data-lighting')
    expect(['daytime', 'dusk-dawn', 'nighttime']).toContain(lighting)
    for (const sky of container.querySelectorAll('.place-theme-preview')) expect(sky).toHaveAttribute('data-scenery-lighting', lighting)
  })

  it('Style switches the page and every chooser card to the woodblock prints, and is saved', async () => {
    const { user, container } = render(<><PlacePicker /><PlaceScenery scroller={null} /></>)
    await user.click(screen.getByRole('button', { name: /Small Mountain Town/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Style' }), 'woodblock')
    expect(localStorage.getItem('symphony-scenery-style')).toBe('woodblock')
    for (const lighting of ['daytime', 'dusk-dawn', 'nighttime'] as const) {
      await user.selectOptions(screen.getByRole('combobox', { name: 'Lighting' }), lighting)
      const scenery = container.querySelector('[data-place-scenery]')!
      expect(scenery).toHaveAttribute('data-style', 'woodblock')
      expect(scenery.querySelector('img')).toHaveAttribute('src', WOODBLOCK['mountain-town'][lighting].src)
      // Each card previews its own place in the same style and light.
      const cards = [...container.querySelectorAll('.place-theme-preview img')].map(img => img.getAttribute('src'))
      expect(cards).toEqual(PLACES.map(p => WOODBLOCK[p.id][lighting].src))
    }
    // Back to Painted: the original art, untouched.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Style' }), 'painted')
    expect(container.querySelector('[data-place-scenery] img')).toHaveAttribute('src', PANORAMAS['mountain-town'].nighttime.src)
  })
})
