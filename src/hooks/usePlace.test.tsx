import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlaceProvider, usePlace } from './usePlace'
import { PLACES, DEFAULT_PLACE, isPlaceId } from '@/config/places'

function Probe() {
  const { place, setPlace } = usePlace()
  return (
    <div>
      <span data-testid="current">{place}</span>
      <button onClick={() => setPlace('farm')}>go farm</button>
    </div>
  )
}

describe('places config', () => {
  it('has five distinct places with the default among them', () => {
    expect(PLACES).toHaveLength(5)
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(5)
    expect(PLACES.some((p) => p.id === DEFAULT_PLACE)).toBe(true)
  })

  it('isPlaceId accepts every id and rejects junk', () => {
    for (const p of PLACES) expect(isPlaceId(p.id)).toBe(true)
    expect(isPlaceId('atlantis')).toBe(false)
    expect(isPlaceId(null)).toBe(false)
  })
})

describe('usePlace', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => { delete document.documentElement.dataset.place })

  it('defaults to the cabin with no data-place attribute (base palette)', () => {
    render(<PlaceProvider><Probe /></PlaceProvider>)
    expect(screen.getByTestId('current')).toHaveTextContent(DEFAULT_PLACE)
    expect(document.documentElement.dataset.place).toBeUndefined()
  })

  it('setPlace applies the attribute and persists to localStorage', async () => {
    const user = userEvent.setup()
    render(<PlaceProvider><Probe /></PlaceProvider>)
    await user.click(screen.getByRole('button', { name: 'go farm' }))
    await waitFor(() => expect(document.documentElement.dataset.place).toBe('farm'))
    expect(localStorage.getItem('symphony-place')).toBe('farm')
  })

  it('restores a saved place on mount and ignores junk', () => {
    localStorage.setItem('symphony-place', 'urban')
    const { unmount } = render(<PlaceProvider><Probe /></PlaceProvider>)
    expect(screen.getByTestId('current')).toHaveTextContent('urban')
    expect(document.documentElement.dataset.place).toBe('urban')
    unmount()
    localStorage.setItem('symphony-place', 'narnia')
    render(<PlaceProvider><Probe /></PlaceProvider>)
    expect(screen.getByTestId('current')).toHaveTextContent(DEFAULT_PLACE)
  })
})
