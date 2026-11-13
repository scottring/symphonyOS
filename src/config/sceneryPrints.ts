// src/config/sceneryPrints.ts
//
// The page's backgrounds (Scott, 2026-11-12: "remove all backgrounds except
// the woodcut overlook and the trains"): two prints, offered in the scenery
// dial. Each is one picture for every light and place; your place still
// tints the sky and the accent. Their art lives in components/place/panoramas.ts.

export type SceneryPrintId = 'overlook' | 'train-yard' | 'subway' | 'skyline'

export interface SceneryPrint {
  id: SceneryPrintId
  name: string
}

export const SCENERY_PRINTS: SceneryPrint[] = [
  { id: 'overlook', name: 'Mountain overlook' },
  { id: 'train-yard', name: 'Train yard' },
  // Scott's prints, 2026-11-13.
  { id: 'subway', name: 'Subway platform' },
  { id: 'skyline', name: 'City skyline' },
]

/** What a device shows until someone chooses. */
export const DEFAULT_SCENERY_PRINT: SceneryPrintId = 'overlook'

export function isSceneryPrintId(v: unknown): v is SceneryPrintId {
  return typeof v === 'string' && SCENERY_PRINTS.some((p) => p.id === v)
}
