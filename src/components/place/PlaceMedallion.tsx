// The active place's medallion — one flat-vector SVG scene per place.
// Pass an explicit `place` (the Settings picker previews all five) or omit
// it to render the user's current place.
import { usePlaceOrDefault } from '@/hooks/usePlace'
import type { PlaceId } from '@/config/places'
import { DenselyUrbanVignette } from './vignettes/DenselyUrbanVignette'
import { SmallCityVignette } from './vignettes/SmallCityVignette'
import { MountainTownVignette } from './vignettes/MountainTownVignette'
import { WoodsyCabinVignette } from './vignettes/WoodsyCabinVignette'
import { FarmVignette } from './vignettes/FarmVignette'

const VIGNETTES: Record<PlaceId, (props: { className?: string }) => React.JSX.Element> = {
  'urban': DenselyUrbanVignette,
  'small-city': SmallCityVignette,
  'mountain-town': MountainTownVignette,
  'cabin': WoodsyCabinVignette,
  'farm': FarmVignette,
}

export function PlaceMedallion({ place, className = '' }: { place?: PlaceId; className?: string }) {
  const currentPlace = usePlaceOrDefault()
  const Vignette = VIGNETTES[place ?? currentPlace]
  return <Vignette className={className} />
}
