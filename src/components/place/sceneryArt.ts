import type { PlaceId } from '@/config/places'
import urbanLeft from '@/assets/scenery/urban-left.webp'
import urbanRight from '@/assets/scenery/urban-right.webp'
import urbanGround from '@/assets/scenery/urban-ground.webp'
import smallCityLeft from '@/assets/scenery/small-city-left.webp'
import smallCityRight from '@/assets/scenery/small-city-right.webp'
import smallCityGround from '@/assets/scenery/small-city-ground.webp'
import mountainTownLeft from '@/assets/scenery/mountain-town-left.webp'
import mountainTownRight from '@/assets/scenery/mountain-town-right.webp'
import mountainTownGround from '@/assets/scenery/mountain-town-ground.webp'
import cabinLeft from '@/assets/scenery/cabin-left.webp'
import cabinRight from '@/assets/scenery/cabin-right.webp'
import cabinGround from '@/assets/scenery/cabin-ground.webp'
import farmLeft from '@/assets/scenery/farm-left.webp'
import farmRight from '@/assets/scenery/farm-right.webp'
import farmGround from '@/assets/scenery/farm-ground.webp'

// Each place's scene, cut from the approved theme concepts
// (scripts/scenery/extract.py): two halves, each 514 source px wide and
// `height` tall, that stand in the bottom corners at one shared scale so
// their ground lines meet the same level; and a strip of the scene's own
// low ground (`groundHeight` source px tall), mirrored to tile, run across
// the middle between them.
export const SCENERY: Record<PlaceId, { left: string; right: string; ground: string; height: number; groundHeight: number }> = {
  urban: { left: urbanLeft, right: urbanRight, ground: urbanGround, height: 470, groundHeight: 26 },
  'small-city': { left: smallCityLeft, right: smallCityRight, ground: smallCityGround, height: 402, groundHeight: 50 },
  'mountain-town': { left: mountainTownLeft, right: mountainTownRight, ground: mountainTownGround, height: 340, groundHeight: 38 },
  cabin: { left: cabinLeft, right: cabinRight, ground: cabinGround, height: 396, groundHeight: 54 },
  farm: { left: farmLeft, right: farmRight, ground: farmGround, height: 358, groundHeight: 54 },
}
