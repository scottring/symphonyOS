import { useDirections } from '@/hooks/useDirections'
import { PlacesAutocomplete } from '@/components/location/PlacesAutocomplete'
import { DirectionsBuilder } from '@/components/directions'

interface PanelLocationProps {
  location?: string
  locationPlaceId?: string
  /** Title of the task or event — feeds the "Directions to …" header. */
  title: string
  /** When true and a location is set, the directions builder is expanded. */
  showDirections: boolean
  onUpdateLocation: (location: string, placeId?: string) => void
  onClearLocation: () => void
}

export function PanelLocation({
  location,
  locationPlaceId,
  title,
  showDirections,
  onUpdateLocation,
  onClearLocation,
}: PanelLocationProps) {
  const { searchPlaces, getPlaceDetails, placesError } = useDirections()

  return (
    <section>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-2">Location</div>
      <PlacesAutocomplete
        value={location ? { address: location, placeId: locationPlaceId } : null}
        onSelect={(place) => onUpdateLocation(place.address, place.placeId)}
        onClear={onClearLocation}
        onSearch={searchPlaces}
        onGetDetails={getPlaceDetails}
        error={placesError}
        placeholder="Add a location…"
      />
      {location && showDirections && (
        <div className="mt-3 -mx-1 bg-white rounded-2xl border border-neutral-100 overflow-hidden">
          <DirectionsBuilder
            destination={{ name: title, address: location, placeId: locationPlaceId }}
            eventTitle={title}
          />
        </div>
      )}
    </section>
  )
}
