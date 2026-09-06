import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { firstWeekSteps, type FirstWeekSignals } from '@/lib/firstWeek'
import { FirstWeekCard } from './FirstWeekCard'

const none: FirstWeekSignals = { memberCount: 1, pageCommitted: false, partnerInvited: false, routineCount: 0 }

describe('FirstWeekCard', () => {
  it('lists four steps, each a link into the real flow', () => {
    render(<FirstWeekCard steps={firstWeekSteps(none)} onHide={vi.fn()} onSamplePage={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Your first week' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Snap this week's page/ })).toHaveAttribute('href', '/today?plan=paper')
    expect(screen.getByRole('link', { name: /Name your people/ })).toHaveAttribute('href', '/settings#household')
    expect(screen.getByRole('link', { name: /Invite your partner/ })).toHaveAttribute('href', '/settings#invite')
    expect(screen.getByRole('link', { name: /Add one routine/ })).toHaveAttribute('href', '/routines')
    expect(screen.getByRole('button', { name: /use our sample page/i })).toBeInTheDocument()
  })

  it('a done step collapses to its done line', () => {
    render(
      <FirstWeekCard
        steps={firstWeekSteps({ ...none, memberCount: 4 })}
        onHide={vi.fn()}
        onSamplePage={vi.fn()}
      />
    )

    expect(screen.getByText('4 people')).toBeInTheDocument()
    // A done step is no longer a link into the flow.
    expect(screen.queryByRole('link', { name: /Name your people/ })).not.toBeInTheDocument()
  })

  it('Hide for now calls onHide', async () => {
    const onHide = vi.fn()
    const { user } = render(<FirstWeekCard steps={firstWeekSteps(none)} onHide={onHide} onSamplePage={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /hide for now/i }))
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('clicking "Use our sample page" calls onSamplePage', async () => {
    const onSamplePage = vi.fn()
    const { user } = render(<FirstWeekCard steps={firstWeekSteps(none)} onHide={vi.fn()} onSamplePage={onSamplePage} />)

    await user.click(screen.getByRole('button', { name: /use our sample page/i }))
    expect(onSamplePage).toHaveBeenCalledTimes(1)
  })

  it('offers Clear sample only once the page step is done and a handler is given', async () => {
    const onClearSample = vi.fn()
    const doneSteps = firstWeekSteps({ ...none, pageCommitted: true })
    const { rerender, user } = render(
      <FirstWeekCard steps={doneSteps} onHide={vi.fn()} onSamplePage={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: /clear sample/i })).not.toBeInTheDocument()

    rerender(
      <FirstWeekCard steps={doneSteps} onHide={vi.fn()} onSamplePage={vi.fn()} onClearSample={onClearSample} />
    )
    await user.click(screen.getByRole('button', { name: /clear sample/i }))
    expect(onClearSample).toHaveBeenCalledTimes(1)
  })
})
