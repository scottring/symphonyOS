import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PlanningGuide } from './PlanningGuide'
import { consumePlanFromPaperRequest } from '@/lib/planFromPaperSignal'

const sheets = () => Array.from(document.querySelectorAll<HTMLElement>('.guide-sheet'))
const sheet = (level: string) => document.querySelector<HTMLElement>(`.guide-sheet[data-sheet="${level}"]`)!

describe('PlanningGuide', () => {
  beforeEach(() => {
    // happy-dom has no print dialog; a stub is enough to see what was asked for.
    vi.stubGlobal('print', vi.fn())
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  const show = () => render(<MemoryRouter><PlanningGuide /></MemoryRouter>)

  it('renders four sheets, each with an anchor of its own', () => {
    show()
    expect(sheets().map((s) => s.dataset.sheet)).toEqual(['week', 'month', 'season', 'year'])
    for (const level of ['week', 'month', 'season', 'year']) expect(sheet(level).id).toBe(level)
    expect(screen.getByRole('heading', { name: 'The week sheet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'The year sheet' })).toBeInTheDocument()
  })

  // The link used to land on Today and stop there: the flow is opened by a
  // request Today consumes on mount, and the guide never made one.
  it('Plan from paper asks for the flow, not just the Today page', async () => {
    show()
    consumePlanFromPaperRequest()
    await userEvent.click(screen.getByRole('link', { name: /Plan from paper/ }))
    expect(consumePlanFromPaperRequest()).toBe(true)
  })

  it('says the sheets are optional and that a blank is kept as a blank', () => {
    show()
    expect(screen.getByText(/an aid, not a format you have to obey/i)).toBeInTheDocument()
    expect(screen.getByText(/leave blanks blank/i)).toBeInTheDocument()
  })

  // "Four sheets" meant twelve printed sides and nobody was told (Codex,
  // 2026-09-24). Each exercise states its own, and so does the page.
  it('says how much paper each exercise really is', () => {
    show()
    expect(within(sheet('week')).getByText(/One side · about 10 minutes/i)).toBeInTheDocument()
    expect(within(sheet('month')).getByText(/Two sides/i)).toBeInTheDocument()
    expect(within(sheet('season')).getByText(/Three sides/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print all nine sides/i })).toBeInTheDocument()
    expect(document.querySelector('.guide-intro')).toHaveTextContent(/the week sheet is one side/i)
  })

  // It must not promise importer behaviour nobody has verified. It tells the
  // reader what to CHECK rather than what the app guarantees (Codex,
  // 2026-09-24).
  it('gives the reader instructions, not guarantees about the importer', () => {
    show()
    const intro = document.querySelector('.guide-intro')!
    expect(intro).toHaveTextContent(/read the proposed list against your page before you keep anything/i)
    expect(intro).toHaveTextContent(/keep the paper either way/i)
    expect(intro).toHaveTextContent(/is not by itself a weekly routine/i)
    const text = intro.textContent ?? ''
    // None of these were ever verified, so none of them may be claimed.
    expect(text).not.toMatch(/duplicate/i)
    expect(text).not.toMatch(/automatic/i)
    expect(text).not.toMatch(/you are asked/i)
    expect(text).not.toMatch(/notes,? which are kept/i)
    expect(text).not.toMatch(/nothing is saved until/i)
  })

  it('credits its source briefly and claims nothing more', () => {
    show()
    const source = document.querySelector('.guide-source')!
    expect(source).toHaveTextContent(/best laid plans/i)
    expect(source).toHaveTextContent(/nothing from the book or the episodes is reproduced/i)
  })

  // "Print this sheet" means this sheet. The print stylesheet hides anything
  // marked off, so the attribute is the contract.
  it('prints one sheet alone', async () => {
    show()
    const user = userEvent.setup()
    await user.click(within(sheet('season')).getByRole('button', { name: /print this sheet/i }))
    expect(window.print).toHaveBeenCalledTimes(1)
    expect(sheet('season').dataset.print).toBe('on')
    expect(sheet('week').dataset.print).toBe('off')
    expect(sheet('month').dataset.print).toBe('off')
    expect(sheet('year').dataset.print).toBe('off')
  })

  it('prints everything when everything is asked for', async () => {
    show()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /print all nine sides/i }))
    expect(window.print).toHaveBeenCalledTimes(1)
    for (const s of sheets()) expect(s.dataset.print).toBe('on')
  })

  it('puts every sheet back on the page once the dialog has closed', async () => {
    show()
    const user = userEvent.setup()
    await user.click(within(sheet('week')).getByRole('button', { name: /print this sheet/i }))
    expect(sheet('year').dataset.print).toBe('off')
    act(() => { window.dispatchEvent(new Event('afterprint')) })
    for (const s of sheets()) expect(s.dataset.print).toBe('on')
  })

  it('keeps the app chrome and its own buttons off the paper', () => {
    show()
    // Everything that is interface rather than sheet carries the screen-only
    // class the print stylesheet hides.
    const btn = within(sheet('week')).getByRole('button', { name: /print this sheet/i })
    expect(btn).toHaveClass('guide-screen-only')
    expect(document.querySelector('.guide-intro')!.closest('.guide-screen-only')).not.toBeNull()
  })
})
