import type { PlaceId } from '@/config/places'
import type { SceneryLighting } from '@/hooks/useSceneryPreferences'
import urban_daytime from '@/assets/scenery/painted/urban-daytime.webp'
import urban_daytime_veil from '@/assets/scenery/painted/urban-daytime-veil.webp'
import urban_dusk_dawn from '@/assets/scenery/painted/urban-dusk-dawn.webp'
import urban_dusk_dawn_veil from '@/assets/scenery/painted/urban-dusk-dawn-veil.webp'
import urban_nighttime from '@/assets/scenery/painted/urban-nighttime.webp'
import urban_nighttime_veil from '@/assets/scenery/painted/urban-nighttime-veil.webp'
import small_city_daytime from '@/assets/scenery/painted/small-city-daytime.webp'
import small_city_daytime_veil from '@/assets/scenery/painted/small-city-daytime-veil.webp'
import small_city_dusk_dawn from '@/assets/scenery/painted/small-city-dusk-dawn.webp'
import small_city_dusk_dawn_veil from '@/assets/scenery/painted/small-city-dusk-dawn-veil.webp'
import small_city_nighttime from '@/assets/scenery/painted/small-city-nighttime.webp'
import small_city_nighttime_veil from '@/assets/scenery/painted/small-city-nighttime-veil.webp'
import mountain_town_daytime from '@/assets/scenery/painted/mountain-town-daytime.webp'
import mountain_town_daytime_veil from '@/assets/scenery/painted/mountain-town-daytime-veil.webp'
import mountain_town_dusk_dawn from '@/assets/scenery/painted/mountain-town-dusk-dawn.webp'
import mountain_town_dusk_dawn_veil from '@/assets/scenery/painted/mountain-town-dusk-dawn-veil.webp'
import mountain_town_nighttime from '@/assets/scenery/painted/mountain-town-nighttime.webp'
import mountain_town_nighttime_veil from '@/assets/scenery/painted/mountain-town-nighttime-veil.webp'
import cabin_daytime from '@/assets/scenery/painted/cabin-daytime.webp'
import cabin_daytime_veil from '@/assets/scenery/painted/cabin-daytime-veil.webp'
import cabin_dusk_dawn from '@/assets/scenery/painted/cabin-dusk-dawn.webp'
import cabin_dusk_dawn_veil from '@/assets/scenery/painted/cabin-dusk-dawn-veil.webp'
import cabin_nighttime from '@/assets/scenery/painted/cabin-nighttime.webp'
import cabin_nighttime_veil from '@/assets/scenery/painted/cabin-nighttime-veil.webp'
import farm_daytime from '@/assets/scenery/painted/farm-daytime.webp'
import farm_daytime_veil from '@/assets/scenery/painted/farm-daytime-veil.webp'
import farm_dusk_dawn from '@/assets/scenery/painted/farm-dusk-dawn.webp'
import farm_dusk_dawn_veil from '@/assets/scenery/painted/farm-dusk-dawn-veil.webp'
import farm_nighttime from '@/assets/scenery/painted/farm-nighttime.webp'
import farm_nighttime_veil from '@/assets/scenery/painted/farm-nighttime-veil.webp'

export interface Panorama {
  /** The landscape, its painted sky keyed out. */
  src: string
  /** Where page content is concealed: under the skyline, fading in above it. */
  veil: string
  /** How far down the art (0–1) its skyline sits under the page's text
   *  column; below it the art stands in front of every row. */
  skyline: number
}

// The low landscape of each approved scene concept, cut out by
// scripts/scenery/extract_landscapes.py (skyline: its painted-bands.json).
// The page and the Settings chooser share the same artwork for every lighting.
export const PANORAMAS: Record<PlaceId, Record<SceneryLighting, Panorama>> = {
  'urban': {
    'daytime': { src: urban_daytime, veil: urban_daytime_veil, skyline: 0.5245 },
    'dusk-dawn': { src: urban_dusk_dawn, veil: urban_dusk_dawn_veil, skyline: 0.5256 },
    'nighttime': { src: urban_nighttime, veil: urban_nighttime_veil, skyline: 0.5181 },
  },
  'small-city': {
    'daytime': { src: small_city_daytime, veil: small_city_daytime_veil, skyline: 0.4378 },
    'dusk-dawn': { src: small_city_dusk_dawn, veil: small_city_dusk_dawn_veil, skyline: 0.4432 },
    'nighttime': { src: small_city_nighttime, veil: small_city_nighttime_veil, skyline: 0.3647 },
  },
  'mountain-town': {
    'daytime': { src: mountain_town_daytime, veil: mountain_town_daytime_veil, skyline: 0.3297 },
    'dusk-dawn': { src: mountain_town_dusk_dawn, veil: mountain_town_dusk_dawn_veil, skyline: 0.299 },
    'nighttime': { src: mountain_town_nighttime, veil: mountain_town_nighttime_veil, skyline: 0.3308 },
  },
  'cabin': {
    'daytime': { src: cabin_daytime, veil: cabin_daytime_veil, skyline: 0.4218 },
    'dusk-dawn': { src: cabin_dusk_dawn, veil: cabin_dusk_dawn_veil, skyline: 0.4231 },
    'nighttime': { src: cabin_nighttime, veil: cabin_nighttime_veil, skyline: 0.4298 },
  },
  'farm': {
    'daytime': { src: farm_daytime, veil: farm_daytime_veil, skyline: 0.3665 },
    'dusk-dawn': { src: farm_dusk_dawn, veil: farm_dusk_dawn_veil, skyline: 0.3662 },
    'nighttime': { src: farm_nighttime, veil: farm_nighttime_veil, skyline: 0.3667 },
  },
}
