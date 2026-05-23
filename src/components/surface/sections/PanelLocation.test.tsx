import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PanelLocation } from './PanelLocation'

// Mock the directions hook so neither PlacesAutocomplete nor DirectionsBuilder
// touch the Google Maps SDK during unit tests.
const searchPlaces = vi.fn().mockResolvedValue([
  { placeId: 'p1', description: '1 Main St, Townsville', mainText: '1 Main St', secondaryText: 'Townsville' },
])
const getPlaceDetails = vi.fn().mockResolvedValue({ address: '1 Main St, Townsville', name: '1 Main St' })

vi.mock('@/hooks/useDirections', () => ({
  useDirections: () => ({
    isCalculating: false,
    error: null,
    result: null,
    calculateRoute: vi.fn(),
    searchPlaces,
    getPlaceDetails,
    openInMaps: vi.fn(),
  }),
  formatDuration: (s: number) => `${s}s`,
  formatDistance: (m: number) => `${m}m`,
}))

describe('PanelLocation', () => {
  const baseProps = {
    title: 'Pick up dry cleaning',
    showDirections: false,
    onUpdateLocation: vi.fn(),
    onClearLocation: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows a place search input when no location is set', () => {
    render(<PanelLocation {...baseProps} />)
    expect(screen.getByPlaceholderText(/add a location/i)).toBeInTheDocument()
  })

  it('shows the location address when set, without the directions builder', () => {
    render(<PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" />)
    expect(screen.getByText('500 Market St')).toBeInTheDocument()
    expect(screen.queryByText(/Directions to/i)).not.toBeInTheDocument()
  })

  it('shows the directions builder when a location is set and showDirections is true', () => {
    render(<PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" showDirections />)
    expect(screen.getByText(/Directions to Pick up dry cleaning/i)).toBeInTheDocument()
  })

  it('calls onClearLocation when the location is removed', async () => {
    const onClearLocation = vi.fn()
    const { user } = render(
      <PanelLocation {...baseProps} location="500 Market St" locationPlaceId="abc" onClearLocation={onClearLocation} />
    )
    await user.click(screen.getByLabelText(/remove location/i))
    expect(onClearLocation).toHaveBeenCalledOnce()
  })

  it('calls onUpdateLocation with address and placeId when a place is selected', async () => {
    const onUpdateLocation = vi.fn()
    const { user } = render(<PanelLocation {...baseProps} onUpdateLocation={onUpdateLocation} />)
    await user.type(screen.getByPlaceholderText(/add a location/i), 'Main St')
    const result = await screen.findByText('1 Main St')
    await user.click(result)
    expect(onUpdateLocation).toHaveBeenCalledWith('1 Main St, Townsville', 'p1')
  })
})
