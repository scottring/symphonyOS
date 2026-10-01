import type { PlaceId } from '@/config/places'
import type { SceneryLighting } from '@/hooks/useSceneryPreferences'
import mountain_town_daytime from '@/assets/scenery/woodblock/mountain-town-daytime.webp'
import mountain_town_daytime_veil from '@/assets/scenery/woodblock/mountain-town-daytime-veil.webp'
import urban_daytime from '@/assets/scenery/woodblock/urban-daytime.webp'
import urban_daytime_veil from '@/assets/scenery/woodblock/urban-daytime-veil.webp'
import cabin_daytime from '@/assets/scenery/woodblock/cabin-daytime.webp'
import cabin_daytime_veil from '@/assets/scenery/woodblock/cabin-daytime-veil.webp'
import small_city_daytime from '@/assets/scenery/woodblock/small-city-daytime.webp'
import small_city_daytime_veil from '@/assets/scenery/woodblock/small-city-daytime-veil.webp'
import farm_daytime from '@/assets/scenery/woodblock/farm-daytime.webp'
import farm_daytime_veil from '@/assets/scenery/woodblock/farm-daytime-veil.webp'
import mountain_town_dusk_dawn from '@/assets/scenery/woodblock/mountain-town-dusk-dawn.webp'
import mountain_town_dusk_dawn_veil from '@/assets/scenery/woodblock/mountain-town-dusk-dawn-veil.webp'
import mountain_town_nighttime from '@/assets/scenery/woodblock/mountain-town-nighttime.webp'
import mountain_town_nighttime_veil from '@/assets/scenery/woodblock/mountain-town-nighttime-veil.webp'
import urban_dusk_dawn from '@/assets/scenery/woodblock/urban-dusk-dawn.webp'
import urban_dusk_dawn_veil from '@/assets/scenery/woodblock/urban-dusk-dawn-veil.webp'
import urban_nighttime from '@/assets/scenery/woodblock/urban-nighttime.webp'
import urban_nighttime_veil from '@/assets/scenery/woodblock/urban-nighttime-veil.webp'
import small_city_dusk_dawn from '@/assets/scenery/woodblock/small-city-dusk-dawn.webp'
import small_city_dusk_dawn_veil from '@/assets/scenery/woodblock/small-city-dusk-dawn-veil.webp'
import small_city_nighttime from '@/assets/scenery/woodblock/small-city-nighttime.webp'
import small_city_nighttime_veil from '@/assets/scenery/woodblock/small-city-nighttime-veil.webp'
import cabin_dusk_dawn from '@/assets/scenery/woodblock/cabin-dusk-dawn.webp'
import cabin_dusk_dawn_veil from '@/assets/scenery/woodblock/cabin-dusk-dawn-veil.webp'
import cabin_nighttime from '@/assets/scenery/woodblock/cabin-nighttime.webp'
import cabin_nighttime_veil from '@/assets/scenery/woodblock/cabin-nighttime-veil.webp'
import farm_dusk_dawn from '@/assets/scenery/woodblock/farm-dusk-dawn.webp'
import farm_dusk_dawn_veil from '@/assets/scenery/woodblock/farm-dusk-dawn-veil.webp'
import farm_nighttime from '@/assets/scenery/woodblock/farm-nighttime.webp'
import farm_nighttime_veil from '@/assets/scenery/woodblock/farm-nighttime-veil.webp'

export interface Panorama { src: string; veil: string; skyline: number }

// Production RGBA woodblock artwork; original painted assets remain intact.
export const PANORAMAS: Record<PlaceId, Record<SceneryLighting, Panorama>> = {
  'mountain-town': {
    'daytime': { src: mountain_town_daytime, veil: mountain_town_daytime_veil, skyline: 0.6346 },
    'dusk-dawn': { src: mountain_town_dusk_dawn, veil: mountain_town_dusk_dawn_veil, skyline: 0.6309 },
    'nighttime': { src: mountain_town_nighttime, veil: mountain_town_nighttime_veil, skyline: 0.6318 },
  },
  'urban': {
    'daytime': { src: urban_daytime, veil: urban_daytime_veil, skyline: 0.6705 },
    'dusk-dawn': { src: urban_dusk_dawn, veil: urban_dusk_dawn_veil, skyline: 0.6646 },
    'nighttime': { src: urban_nighttime, veil: urban_nighttime_veil, skyline: 0.6653 },
  },
  'cabin': {
    'daytime': { src: cabin_daytime, veil: cabin_daytime_veil, skyline: 0.668 },
    'dusk-dawn': { src: cabin_dusk_dawn, veil: cabin_dusk_dawn_veil, skyline: 0.6626 },
    'nighttime': { src: cabin_nighttime, veil: cabin_nighttime_veil, skyline: 0.6639 },
  },
  'small-city': {
    'daytime': { src: small_city_daytime, veil: small_city_daytime_veil, skyline: 0.6675 },
    'dusk-dawn': { src: small_city_dusk_dawn, veil: small_city_dusk_dawn_veil, skyline: 0.6641 },
    'nighttime': { src: small_city_nighttime, veil: small_city_nighttime_veil, skyline: 0.6643 },
  },
  'farm': {
    'daytime': { src: farm_daytime, veil: farm_daytime_veil, skyline: 0.6709 },
    'dusk-dawn': { src: farm_dusk_dawn, veil: farm_dusk_dawn_veil, skyline: 0.6681 },
    'nighttime': { src: farm_nighttime, veil: farm_nighttime_veil, skyline: 0.6669 },
  },
}
