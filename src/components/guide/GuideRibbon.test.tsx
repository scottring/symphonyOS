import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { GuideRibbon, PlannedStamp, RibbonTab } from './GuideRibbon'
import { stepsFor } from '@/lib/guide/steps'
import { paperSound } from '@/lib/fold/paperSound'

vi.mock('@/contexts/AssistantLaunchContext', () => ({ useAssistantLauncher: () => ({ openAssistant: vi.fn() }) }))

const month = stepsFor('month')
const progress = (current: string, done: string[] = []) => ({ current, done, skipped: [] })

function setup(over: Partial<Parameters<typeof GuideRibbon>[0]> = {}) {
  const props = {
    level: 'month' as const,
    progress: progress('fresh-start'),
    bodies: { 'fresh-start': <p>Pick a scenery</p> },
    onJump: vi.fn(), onNext: vi.fn(), onBack: vi.fn(), onLeave: vi.fn(), onFinish: vi.fn(),
    finishLabel: 'Done planning November',
    tab: { label: 'Plan November', onPull: vi.fn() },
    ...over,
  }
  const view = render(<GuideRibbon {...props}>
    <article aria-label="November sheet">
      <RibbonTab label="Plan November" onPull={vi.fn()} />
      <form className="sheet-write"><input aria-label="Write a November goal" /></form>
    </article>
  </GuideRibbon>)
  return { props, ...view }
}
const band = () => within(screen.getByRole('region', { name: 'Plan November' }))
const chips = () => band().getAllByRole('button').filter((b) => b.closest('.ribbon-steps'))

beforeEach(() => { localStorage.clear() })

describe('GuideRibbon — planning is a ribbon on the same page', () => {
  it('lays a band across the page with the six Month steps, the current one marked, and its Why and You', () => {
    setup({ progress: progress('look-back', ['fresh-start']) })
    expect(chips().map((b) => b.querySelector('.ribbon-step-title')?.textContent)).toEqual(month.map((s) => s.title))
    expect(chips()[1]).toHaveAttribute('aria-current', 'step')
    expect(chips()[0]).toHaveTextContent('(done)')
    expect(band().getByText(month[1].why)).toBeInTheDocument()
    expect(band().getByText(month[1].you)).toBeInTheDocument()
  })

  it('a step chip jumps there; Back, Next and Leave do what they say', () => {
    const { props } = setup({ progress: progress('read-season') })
    fireEvent.click(chips()[3])
    expect(props.onJump).toHaveBeenCalledWith('next-weeks')
    fireEvent.click(band().getByRole('button', { name: 'Back' }))
    expect(props.onBack).toHaveBeenCalled()
    fireEvent.click(band().getByRole('button', { name: 'Next' }))
    expect(props.onNext).toHaveBeenCalled()
    fireEvent.click(band().getByRole('button', { name: 'Leave' }))
    expect(props.onLeave).toHaveBeenCalled()
  })

  it('Back waits on the first step; the last step’s Next is Done planning November', () => {
    const first = setup()
    expect(band().getByRole('button', { name: 'Back' })).toBeDisabled()
    first.unmount()
    const { props } = setup({ progress: progress('upkeep-fun') })
    expect(band().queryByRole('button', { name: 'Next' })).toBeNull()
    fireEvent.click(band().getByRole('button', { name: 'Done planning November' }))
    expect(props.onFinish).toHaveBeenCalled()
  })

  it('a step with its own editor shows it in the card that drops under the band; a step without one shows none', () => {
    const { rerender, props } = setup()
    expect(within(screen.getByRole('region', { name: 'Fresh start' })).getByText('Pick a scenery')).toBeInTheDocument()
    rerender(<GuideRibbon {...props} progress={progress('read-season')}><p>page</p></GuideRibbon>)
    expect(screen.queryByText('Pick a scenery')).toBeNull()
    expect(document.querySelector('.ribbon-card')).toBeNull()
  })

  it('the bookmark on the sheet shows the ribbon pulled; pulling it again puts the ribbon back', () => {
    const { props } = setup()
    const tab = screen.getByRole('button', { name: 'Plan November' , expanded: true })
    fireEvent.click(tab)
    expect(props.tab.onPull).toHaveBeenCalled()
  })

  it('a writing step focuses the page’s write line', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0 })
    const { rerender, props } = setup()
    expect(document.activeElement).not.toBe(screen.getByRole('textbox', { name: 'Write a November goal' }))
    await act(async () => {
      rerender(<GuideRibbon {...props} progress={progress('by-area')}>
        <form className="sheet-write"><input aria-label="Write a November goal" /></form>
      </GuideRibbon>)
    })
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Write a November goal' }))
    raf.mockRestore()
  })

  it('pulling the ribbon makes a low satin slide; leaving makes it again', () => {
    const ribbon = vi.spyOn(paperSound, 'ribbon')
    const { props } = setup()
    expect(ribbon).toHaveBeenCalledTimes(1)
    fireEvent.click(band().getByRole('button', { name: 'Leave' }))
    expect(ribbon).toHaveBeenCalledTimes(2)
    expect(props.onLeave).toHaveBeenCalled()
    ribbon.mockRestore()
  })

  it('uses titleFor and the steps’ own drives by default', () => {
    render(<GuideRibbon level="week" progress={progress('read-month')} titleFor={(s) => s.id === 'read-month' ? 'Read November' : s.title}
      bodies={{}} onJump={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} onLeave={vi.fn()} onFinish={vi.fn()}
      finishLabel="Done planning the week" tab={{ label: 'Plan the week', onPull: vi.fn() }}><p>week</p></GuideRibbon>)
    expect(screen.getByRole('button', { name: /Read November/ })).toHaveAttribute('aria-current', 'step')
  })

  describe('on a phone (the band is a row of step chips)', () => {
    let scrolled: Element[] = []
    const original = Element.prototype.scrollIntoView
    beforeEach(() => {
      scrolled = []
      Element.prototype.scrollIntoView = vi.fn(function (this: Element) { scrolled.push(this) })
      vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
        matches: query === '(max-width: 760px)', media: query, onchange: null,
        addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
      }) as MediaQueryList)
    })
    afterEach(() => { vi.restoreAllMocks(); Element.prototype.scrollIntoView = original })

    it('brings the current chip into view when the step changes', () => {
      const { rerender, props } = setup({ progress: progress('next-weeks') })
      expect(scrolled.at(-1)).toHaveTextContent('Next 4–5 weeks')
      rerender(<GuideRibbon {...props} progress={progress('by-area')}><p>page</p></GuideRibbon>)
      expect(scrolled.at(-1)).toHaveTextContent('The month by area')
    })
  })
})

describe('RibbonTab — the bookmark, before a session', () => {
  it('hangs from the sheet as “Plan November”; pulling it starts planning', () => {
    const onPull = vi.fn()
    render(<RibbonTab label="Plan November" onPull={onPull} />)
    const tab = screen.getByRole('button', { name: 'Plan November' })
    expect(tab).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(tab)
    expect(onPull).toHaveBeenCalled()
  })
})

describe('PlannedStamp — Done planning stamps the sheet', () => {
  it('reads Planned with the day, and thumps once', () => {
    vi.useFakeTimers()
    const stamp = vi.spyOn(paperSound, 'stamp')
    render(<PlannedStamp at={new Date(2026, 10, 4)} />)
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.getByText('Nov 4')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(stamp).toHaveBeenCalledTimes(1)
    stamp.mockRestore()
    vi.useRealTimers()
  })
})
