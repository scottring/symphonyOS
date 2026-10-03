import { useSyncExternalStore } from 'react'
import { lightingAt, readCachedCoords } from '@/components/place/sceneryLighting'

export type SceneryLighting = 'daytime' | 'dusk-dawn' | 'nighttime'
/** What the person chose: one lighting, or 'auto' to follow the sun. */
export type SceneryLightingChoice = SceneryLighting | 'auto'
/** How the landscape is drawn: painted, or as woodblock prints. Both stand
 *  under the same sky, tinted to the place. */
export type SceneryStyle = 'painted' | 'woodblock'
/** How much of the scene shows: faint behind the page (the default, Scott,
 *  2026-10-03: "I may like the higher transparency look better"), or full in
 *  front of it at the foot of the window. */
export type SceneryScene = 'faint' | 'full'
const EVENT = 'symphony:scenery-preferences'
const SHOW_KEY = 'symphony-show-scenery'
const LIGHTING_KEY = 'symphony-scenery-lighting'
const STYLE_KEY = 'symphony-scenery-style'
const SCENE_KEY = 'symphony-scenery-scene'
/** Automatic lighting is re-read this often (and when the tab returns). */
const CLOCK_MS = 60_000
const fallback = new Map<string, string>()
function read(key: string) {
  try { return localStorage.getItem(key) } catch { return fallback.get(key) ?? null }
}
function write(key: string, value: string) {
  fallback.set(key, value)
  try { localStorage.setItem(key, value) } catch { /* Still usable this session. */ }
  window.dispatchEvent(new Event(EVENT))
}

// One clock for every subscriber, running only while someone listens.
const listeners = new Set<() => void>()
let clock: ReturnType<typeof setInterval> | null = null
const tick = () => listeners.forEach((l) => l())
const onVisible = () => { if (document.visibilityState === 'visible') tick() }
function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  if (!clock) {
    clock = setInterval(tick, CLOCK_MS)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(listener)
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
    if (!listeners.size && clock) {
      clearInterval(clock)
      clock = null
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

const getShown = () => read(SHOW_KEY) !== 'false'
const getChoice = (): SceneryLightingChoice => {
  const value = read(LIGHTING_KEY)
  return value === 'dusk-dawn' || value === 'nighttime' || value === 'auto' ? value : 'daytime'
}
const getLighting = (): SceneryLighting => {
  const choice = getChoice()
  return choice === 'auto' ? lightingAt(Date.now(), readCachedCoords()).lighting : choice
}
const getStyle = (): SceneryStyle => read(STYLE_KEY) === 'woodblock' ? 'woodblock' : 'painted'
const getScene = (): SceneryScene => read(SCENE_KEY) === 'full' ? 'full' : 'faint'
const setSceneryScene = (scene: SceneryScene) => write(SCENE_KEY, scene)
const setShowScenery = (show: boolean) => write(SHOW_KEY, String(show))
const setSceneryStyle = (style: SceneryStyle) => write(STYLE_KEY, style)
const setSceneryLighting = (choice: SceneryLightingChoice) => write(LIGHTING_KEY, choice)

/** Device-local display choices (show, scene, lighting, style). The selected place still uses profile sync.
 *  `sceneryLighting` is what to show now — with Automatic, it follows sunrise
 *  and sunset; `lightingChoice` is what was picked. */
export function useSceneryPreferences() {
  const showScenery = useSyncExternalStore(subscribe, getShown, () => true)
  const lightingChoice = useSyncExternalStore(subscribe, getChoice, () => 'daytime' as const)
  const sceneryLighting = useSyncExternalStore(subscribe, getLighting, () => 'daytime' as const)
  const sceneryStyle = useSyncExternalStore(subscribe, getStyle, () => 'painted' as const)
  const sceneryScene = useSyncExternalStore(subscribe, getScene, () => 'faint' as const)
  return { showScenery, setShowScenery, sceneryLighting, lightingChoice, setSceneryLighting, sceneryStyle, setSceneryStyle, sceneryScene, setSceneryScene }
}

/** When Automatic lighting next changes, for the chooser's hint. */
export function nextAutomaticChange(now = Date.now()): number | null {
  return lightingAt(now, readCachedCoords()).next
}
