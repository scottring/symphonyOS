import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Analysis } from '../../../supabase/functions/plan-from-paper/lib/plan'

const USER = '11111111-2222-3333-4444-555555555555'

vi.mock('@/lib/supabase', () => ({
  getAuthUser: vi.fn().mockResolvedValue({ data: { user: { id: '11111111-2222-3333-4444-555555555555' } } }),
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'blob:x' } }),
        remove: vi.fn().mockResolvedValue({}),
        upload: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}))
vi.mock('@/hooks/useSupabaseTasks', () => ({ useSupabaseTasks: () => ({ tasks: [] }) }))
vi.mock('@/contexts/GoalsContext', () => ({ useGoalsContext: () => ({ goals: [] }) }))
vi.mock('@/hooks/useRoutines', () => ({ useRoutines: () => ({ routines: [] }) }))
vi.mock('@/hooks/useHouseholdSeasons', async () => {
  const { DEFAULT_SEASONS } = await import('@/lib/cadence/seasons')
  return { useHouseholdSeasons: () => ({ seasons: DEFAULT_SEASONS }) }
})
const analyzePages = vi.fn()
const revisePlan = vi.fn()
vi.mock('@/lib/paperPlan/api', () => ({
  analyzePages: (...a: unknown[]) => analyzePages(...a),
  revisePlan: (...a: unknown[]) => revisePlan(...a),
}))
const writePlanRows = vi.fn()
vi.mock('@/lib/paperPlan/writeRows', () => ({ writePlanRows: (...a: unknown[]) => writePlanRows(...a) }))

import { PaperPlanFlow } from './PaperPlanFlow'
import { PaperPlanError } from '@/lib/paperPlan/errors'
import { newImport, storeImport, loadImport } from '@/lib/paperPlan/importState'

const IMP_PATH = `${USER}/paper-plan/99999999-8888-7777-6666-555555555555/photo-1.jpg`

function seed() {
  const imp = newImport('family')
  storeImport(USER, {
    ...imp,
    instructions: 'Left page is the season; right page is this month.',
    images: [{ path: IMP_PATH, part: 'whole', bytes: 10, attachmentId: crypto.randomUUID() }],
  })
}

const analysis: Analysis = {
  summary: 'An autumn page.',
  questions: [],
  pages: [{ page: 1, image: 1, side: 'single', heading: 'Autumn', period: { level: 'season', label: 'Autumn 2026', start: '2026-09-01', end: null }, lines: [] }],
  items: [{
    id: 'a', kind: 'task', original: 'Buy a rain barrel', title: 'Buy a rain barrel', page: 1, source_lines: [],
    placement: { level: 'season', label: 'Autumn 2026', start: '2026-09-01' }, date_text: null, date: null, relationships: [], flags: [], routine: null, why: null,
  }],
}

const renderFlow = () => render(<MemoryRouter><PaperPlanFlow members={[]} onClose={() => {}} /></MemoryRouter>)

describe('PaperPlanFlow', () => {
  beforeEach(() => {
    localStorage.clear()
    analyzePages.mockReset()
    revisePlan.mockReset()
    writePlanRows.mockReset()
  })

  it('a failed reading keeps the photos and the explanation, says what to do, and retries without re-uploading', async () => {
    seed()
    analyzePages.mockRejectedValueOnce(new PaperPlanError('model_busy')).mockResolvedValueOnce({ ok: true, analysis })
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: 'Read my pages' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/busy right now/)
    expect(screen.getByRole('alert')).not.toHaveTextContent(/JSON|non-2xx/)
    expect(screen.getByDisplayValue('Left page is the season; right page is this month.')).toBeInTheDocument()
    expect(loadImport(USER)?.images.map((i) => i.path)).toEqual([IMP_PATH])

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await screen.findByDisplayValue('Buy a rain barrel')
    expect(analyzePages).toHaveBeenLastCalledWith([IMP_PATH], 'Left page is the season; right page is this month.', expect.objectContaining({ today: expect.any(String) }))
  })

  it('saves only after “Save N changes”, and a retried save sends the same row ids', async () => {
    seed()
    analyzePages.mockResolvedValue({ ok: true, analysis })
    writePlanRows.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(undefined)
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: 'Read my pages' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Review changes' }))
    expect(writePlanRows).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /^Save 2 changes$/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/won’t be added twice/)
    fireEvent.click(screen.getByRole('button', { name: /^Save 2 changes$/ }))
    await screen.findByText('Your plan is in')

    const [first] = writePlanRows.mock.calls[0]
    const [second] = writePlanRows.mock.calls[1]
    expect(second.tasks.map((t: { id: string }) => t.id)).toEqual(first.tasks.map((t: { id: string }) => t.id))
    expect(second.notes[0].id).toBe(first.notes[0].id)
    expect(first.tasks[0]).toMatchObject({ bucket: 'quarter', scheduled_for: null })
    // Saved imports are cleared, so the next open starts fresh.
    expect(loadImport(USER)).toBeNull()
  })

  it('a conversational change updates the plan without re-reading the pages', async () => {
    seed()
    analyzePages.mockResolvedValue({ ok: true, analysis })
    revisePlan.mockResolvedValue({
      ok: true, reply: 'Moved it to the month.', changes: ['Buy a rain barrel → September'],
      analysis: { ...analysis, items: [{ ...analysis.items[0], placement: { level: 'month', label: 'September 2026', start: '2026-09-01' } }] },
    })
    renderFlow()

    fireEvent.click(await screen.findByRole('button', { name: 'Read my pages' }))
    await screen.findByDisplayValue('Buy a rain barrel')
    fireEvent.change(screen.getAllByRole('textbox', { name: 'Message' })[0], { target: { value: 'Move the rain barrel to September' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Send' })[0])

    expect(await screen.findByText('Moved it to the month.')).toBeInTheDocument()
    expect(analyzePages).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(loadImport(USER)?.analysis?.items[0].placement.level).toBe('month'))
  })
})
