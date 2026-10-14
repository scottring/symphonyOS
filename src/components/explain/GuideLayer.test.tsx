import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { PageGuideProvider } from './GuideProvider'
import { GuideLayer } from './GuideLayer'
import { PageHelpButton, PageHelpContext } from './PageHelp'
import { ConversationStrip } from '@/components/canvas/ConversationStrip'
import { requestShow } from '@/lib/explain/showSignal'
import type { ShowStep } from '@/lib/explain/steps'

vi.mock('@/contexts/CanvasActivityContext', () => ({
  useCanvasActivity: () => ({ receipt: null, undo: vi.fn(), retry: vi.fn(), dismiss: vi.fn(), proposals: [] }),
}))
vi.mock('@/shell/providers/SelectionProvider', () => ({ useSelectionOptional: () => null }))

const voice = { available: true, active: false, status: 'idle', start: vi.fn(), stop: vi.fn(), mute: vi.fn() }
const TOUR: ShowStep[] = [
  { targets: ['period'], title: 'Fall 2026', text: 'A brainstorm list for this season.' },
  { targets: ['loose'], title: '2 not under a year goal', text: 'Drag one onto a card.', arrow: { from: 'period', to: 'loose', label: 'drag', drag: true } },
  { targets: ['gone'], title: 'Next: Month', text: 'Choose what October holds.' },
]

function Page({ docked = true }: { docked?: boolean }) {
  return <MemoryRouter><PageGuideProvider>
    <div data-explain-root>
      <div data-explain="period">Fall 2026</div>
      <div data-explain="loose">Renew passports</div>
    </div>
    {docked && <ConversationStrip docked messages={[]} explain={{ label: 'What is this page?', message: 'What is this page?' }} onSend={vi.fn()} busy={false} voice={voice} />}
    <GuideLayer />
  </PageGuideProvider></MemoryRouter>
}

// happy-dom lays nothing out: give the page's marked parts real boxes.
const realRect = Element.prototype.getBoundingClientRect
beforeAll(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const at = this.getAttribute('data-explain') === 'period' ? 40 : this.getAttribute('data-explain') === 'loose' ? 400 : -1
    return (at < 0 ? { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 } : { left: 40, top: at, width: 300, height: 60, right: 340, bottom: at + 60, x: 40, y: at }) as DOMRect
  }
})
afterAll(() => { Element.prototype.getBoundingClientRect = realRect })

describe('show me this page', () => {
  // Scott, 2026-10-13: the tour's controls belong on the note beside what it
  // points at, not in the bar at the foot of the screen — docked bar or not.
  it('walks a tour from the note: count, Back, Next, Done at the end; nothing in the bar', () => {
    render(<Page />)
    act(() => requestShow(TOUR, 'chat'))
    const note = () => screen.getByRole('status')
    expect(within(note()).getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fall 2026' })).toBeInTheDocument()
    expect(within(note()).getByRole('button', { name: 'Back' })).toBeDisabled()
    expect(within(note()).getByRole('button', { name: 'Close' })).toBeInTheDocument()
    expect(document.querySelector('.canvas-strip')?.textContent).not.toMatch(/1 of 3|Showing you this page/)
    fireEvent.click(within(note()).getByRole('button', { name: 'Next' }))
    expect(screen.getByRole('heading', { name: '2 not under a year goal' })).toBeInTheDocument()
    fireEvent.click(within(note()).getByRole('button', { name: 'Next' }))
    fireEvent.click(within(note()).getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('draws an outline per target and the step arrow with its label', () => {
    render(<Page />)
    act(() => requestShow([TOUR[1]], 'chat'))
    const layer = document.querySelector('.explain-layer')!
    expect(layer.querySelectorAll('.explain-ring')).toHaveLength(1)
    expect(layer.querySelector('.explain-arrow.is-drag')).not.toBeNull()
    expect(layer.querySelector('.explain-tag-text')?.textContent).toBe('drag')
  })

  it('a single point has no tour controls and clears on Esc or a click on the page', () => {
    render(<Page />)
    act(() => requestShow([TOUR[0]], 'chat'))
    expect(within(screen.getByRole('status')).queryByRole('button', { name: 'Next' })).toBeNull()
    expect(screen.getByText('A brainstorm list for this season.')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText('A brainstorm list for this season.')).toBeNull()
    act(() => requestShow([TOUR[0]], 'chat'))
    fireEvent.pointerDown(screen.getByText('Renew passports'))
    expect(screen.queryByText('A brainstorm list for this season.')).toBeNull()
  })

  it('without the docked bar the note carries Back and Next', () => {
    render(<Page docked={false} />)
    act(() => requestShow(TOUR, 'chat'))
    const note = screen.getByRole('status')
    expect(within(note).getByText('1 of 3')).toBeInTheDocument()
    fireEvent.click(within(note).getByRole('button', { name: 'Next' }))
    expect(within(screen.getByRole('status')).getByText('2 of 3')).toBeInTheDocument()
  })

  it('the arrow keys step through a tour', () => {
    render(<Page />)
    act(() => requestShow(TOUR, 'chat'))
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: '2 not under a year goal' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: 'Fall 2026' })).toBeInTheDocument()
  })

  it('What is this page? is a "?" beside the page title, not in the bar (2026-10-14)', () => {
    const help = vi.fn()
    render(<PageHelpContext.Provider value={help}><h1>Week<PageHelpButton /></h1></PageHelpContext.Provider>)
    fireEvent.click(screen.getByRole('button', { name: 'What is this page?' }))
    expect(help).toHaveBeenCalledTimes(1)
    render(<MemoryRouter><PageGuideProvider><ConversationStrip docked messages={[]} onSend={vi.fn()} busy={false} voice={voice} /></PageGuideProvider></MemoryRouter>)
    expect(screen.getAllByRole('button', { name: 'What is this page?' })).toHaveLength(1)
  })

  it('a page with no shell help uses its own, and with neither shows no "?"', () => {
    const own = vi.fn()
    const { unmount } = render(<PageHelpButton onHelp={own} />)
    fireEvent.click(screen.getByRole('button', { name: 'What is this page?' }))
    expect(own).toHaveBeenCalledTimes(1)
    unmount()
    render(<PageHelpButton />)
    expect(screen.queryByRole('button', { name: 'What is this page?' })).toBeNull()
  })
})
