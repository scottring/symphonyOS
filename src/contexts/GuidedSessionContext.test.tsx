import { describe, it, expect, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { useMemo, useState } from 'react'
import { GuidedSessionProvider, useGuidedSession, useGuidedSessionRegistration, type GuidedSessionRegistration } from './GuidedSessionContext'

function registration(stepId: string, token = '2026-11-1'): GuidedSessionRegistration {
  return {
    level: 'week',
    periodLabel: 'Week of Nov 1',
    token,
    stepId,
    header: <p>Step header {stepId}</p>,
    sessionContext: {
      horizon: 'weekly', periodLabel: 'Week of Nov 1', stepId, stepTitle: stepId,
      guide: { level: 'week', stepId, stepTitle: stepId, writes: ['inbox'], aboveLines: [], areas: [] },
    },
    threadKey: `weekly:${token}`,
    onThread: vi.fn(),
  }
}

function ShellSide() {
  const reg = useGuidedSession()
  return <div data-testid="shell">{reg ? `${reg.threadKey} ${reg.stepId}` : 'none'}{reg?.header}</div>
}

function Page({ stepId, on = true }: { stepId: string; on?: boolean }) {
  const reg = useMemo(() => (on ? registration(stepId) : null), [stepId, on])
  useGuidedSessionRegistration(reg)
  return null
}

describe('GuidedSessionContext', () => {
  it('a page registers its session and the shell reads it, step by step', () => {
    const view = render(<GuidedSessionProvider><ShellSide /><Page stepId="look-back" /></GuidedSessionProvider>)
    expect(screen.getByTestId('shell')).toHaveTextContent('weekly:2026-11-1 look-back')
    expect(screen.getByText('Step header look-back')).toBeInTheDocument()
    view.rerender(<GuidedSessionProvider><ShellSide /><Page stepId="inbox" /></GuidedSessionProvider>)
    expect(screen.getByTestId('shell')).toHaveTextContent('weekly:2026-11-1 inbox')
  })

  it('null unregisters, and so does leaving the page', () => {
    const view = render(<GuidedSessionProvider><ShellSide /><Page stepId="inbox" /></GuidedSessionProvider>)
    view.rerender(<GuidedSessionProvider><ShellSide /><Page stepId="inbox" on={false} /></GuidedSessionProvider>)
    expect(screen.getByTestId('shell')).toHaveTextContent('none')
    view.rerender(<GuidedSessionProvider><ShellSide /><Page stepId="inbox" /></GuidedSessionProvider>)
    expect(screen.getByTestId('shell')).toHaveTextContent('inbox')
    view.rerender(<GuidedSessionProvider><ShellSide /></GuidedSessionProvider>)
    expect(screen.getByTestId('shell')).toHaveTextContent('none')
  })

  it('a page leaving does not clear the session another page has since registered', () => {
    function Swap() {
      const [first, setFirst] = useState(true)
      return <>{first ? <Page key="a" stepId="old" /> : <Page key="b" stepId="new" />}<button onClick={() => setFirst(false)}>swap</button></>
    }
    render(<GuidedSessionProvider><ShellSide /><Swap /></GuidedSessionProvider>)
    act(() => screen.getByText('swap').click())
    expect(screen.getByTestId('shell')).toHaveTextContent('weekly:2026-11-1 new')
  })

  it('outside the shell, registering is a no-op and the shell side reads null', () => {
    render(<><ShellSide /><Page stepId="inbox" /></>)
    expect(screen.getByTestId('shell')).toHaveTextContent('none')
  })
})
