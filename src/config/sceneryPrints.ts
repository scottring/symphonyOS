// src/config/sceneryPrints.ts
//
// Backgrounds that belong to no place: single prints Scott chose, offered in
// the scenery dial beside the five places' own scenes. Each is one picture
// for every light and style; its art lives in components/place/panoramas.ts.

export type SceneryPrintId = 'train-yard'

export interface SceneryPrint {
  id: SceneryPrintId
  name: string
}

export const SCENERY_PRINTS: SceneryPrint[] = [
  { id: 'train-yard', name: 'Train yard' },
]

export function isSceneryPrintId(v: unknown): v is SceneryPrintId {
  return typeof v === 'string' && SCENERY_PRINTS.some((p) => p.id === v)
}
