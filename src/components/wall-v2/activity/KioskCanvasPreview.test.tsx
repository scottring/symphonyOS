import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// The fixture must never touch the network or a phone.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('@/hooks/useHandsetState', () => ({ useHandsetState: () => ({ offHook: false }) }))
const placeCall = vi.fn()
vi.mock('@/lib/telephony/placeCall', () => ({ placeCall: (...a: unknown[]) => placeCall(...a) }))

import { KioskCanvasPreview } from './KioskCanvasPreview'
import { KIOSK_SCENES } from './kioskScenes'
import { supabase } from '@/lib/supabase'

const PLACE: Record<string, RegExp> = {
  'home-morning': /^Home · Morning$/,
  'home-afternoon': /^Home · Afternoon$/,
  'home-evening': /^Home · Evening$/,
  quiet: /^Home$/,
  dinner: /^Dinner · Turkey chili$/,
  groceries: /^Dinner · Groceries$/,
  cooking: /^Cooking · Turkey chili for 6 · step 4 of 8$/,
  held: /^Calling · cooking is held$/,
  departure: /^Leaving · school run$/,
  bedtime: /^Bedtime$/,
  call: /^Calling$/,
  agenda: /^All of today$/,
  'agenda-weekend': /^This weekend · [A-Z][a-z]{2} \d/,
}

describe('KioskCanvasPreview (dev fixture)', () => {
  it.each(KIOSK_SCENES.flatMap((s) => [[s, 'light'], [s, 'dark']] as const))('%s · %s', (scene, theme) => {
    const { container, unmount } = render(<KioskCanvasPreview scene={scene} theme={theme} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(PLACE[scene])
    expect(container.firstElementChild?.classList.contains('dark')).toBe(theme === 'dark')
    unmount()
  })

  // Scott, 2026-10-18: "an option on the main screen".
  it('the dock’s Today opens all of today from Home, with the weekend a tap away', () => {
    render(<KioskCanvasPreview scene="quiet" v1Screen="rest" />)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Wall' })).getByRole('button', { name: 'All of today and this weekend' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('All of today')
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^This weekend · [A-Z][a-z]{2} \d/)
  })

  it('stickies sit in the band on Home, and the dock’s Sticky opens one to write', () => {
    render(<KioskCanvasPreview scene="quiet" v1Screen="home" />)
    expect(within(screen.getByRole('list', { name: 'Notes for the house' })).getAllByRole('button')).toHaveLength(2)
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Wall' })).getByRole('button', { name: 'Add a sticky' }))
    expect(screen.getByRole('dialog', { name: 'New sticky' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'New sticky' })).toBeNull()
  })

  it('reads and writes nothing, and never dials', () => {
    render(<KioskCanvasPreview scene="call" />)
    expect(screen.getByRole('heading', { name: 'Call Grandma?' })).toBeInTheDocument()
    expect(supabase.from).not.toHaveBeenCalled()
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
    expect(placeCall).not.toHaveBeenCalled()
  })
})
