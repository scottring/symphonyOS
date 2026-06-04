import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import { PlacesAutocomplete } from './PlacesAutocomplete'
import type { PlaceAutocompleteResult } from '@/types/directions'

const RESULTS: PlaceAutocompleteResult[] = [
  { placeId: 'p1', description: '1 Main St, Town', mainText: '1 Main St', secondaryText: 'Town' },
  { placeId: 'p2', description: '2 Oak Ave, Town', mainText: '2 Oak Ave', secondaryText: 'Town' },
  { placeId: 'p3', description: '3 Elm Rd, Town', mainText: '3 Elm Rd', secondaryText: 'Town' },
]

function setup() {
  const onSelect = vi.fn()
  const onSearch = vi.fn<(q: string) => Promise<PlaceAutocompleteResult[]>>().mockResolvedValue(RESULTS)
  const onGetDetails = vi.fn().mockImplementation(async (placeId: string) => ({
    address: `${placeId} full address`,
    name: placeId,
  }))
  const utils = render(
    <PlacesAutocomplete value={null} onSelect={onSelect} onClear={vi.fn()} onSearch={onSearch} onGetDetails={onGetDetails} />,
  )
  return { onSelect, onSearch, onGetDetails, ...utils }
}

describe('PlacesAutocomplete keyboard navigation', () => {
  it('ArrowDown then Enter selects the first result', async () => {
    const { user, onSelect } = setup()
    await user.type(screen.getByPlaceholderText('Search for a place...'), 'main')
    await screen.findByText('1 Main St')
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0]).toMatchObject({ placeId: 'p1', name: '1 Main St' })
  })

  it('ArrowDown twice highlights and selects the second result', async () => {
    const { user, onSelect } = setup()
    await user.type(screen.getByPlaceholderText('Search for a place...'), 'main')
    await screen.findByText('2 Oak Ave')
    await user.keyboard('{ArrowDown}{ArrowDown}')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0]).toMatchObject({ placeId: 'p2' })
  })

  it('ArrowUp from the first result wraps to the last', async () => {
    const { user, onSelect } = setup()
    await user.type(screen.getByPlaceholderText('Search for a place...'), 'main')
    await screen.findByText('3 Elm Rd')
    await user.keyboard('{ArrowUp}') // from none -> last
    await user.keyboard('{Enter}')
    await waitFor(() => expect(onSelect).toHaveBeenCalled())
    expect(onSelect.mock.calls[0][0]).toMatchObject({ placeId: 'p3' })
  })

  it('marks the highlighted option with aria-selected', async () => {
    const { user } = setup()
    await user.type(screen.getByPlaceholderText('Search for a place...'), 'main')
    await screen.findByText('1 Main St')
    await user.keyboard('{ArrowDown}')
    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(options[1]).toHaveAttribute('aria-selected', 'false')
  })
})
