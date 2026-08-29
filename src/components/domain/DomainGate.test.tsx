import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { DomainId } from '@/lib/domains'
import { DomainGateProvider, useDomainGate } from './DomainGate'

function Harness({ context }: { context: 'work' | 'family' | 'personal' | null }) {
  const { requireDomain } = useDomainGate()
  const [result, setResult] = useState<DomainId | null | 'pending'>('pending')
  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          setResult('pending')
          const d = await requireDomain({ id: 't', title: 'Call plumber', context })
          setResult(d)
        }}
      >
        Ask
      </button>
      <p data-testid="result">{result === 'pending' ? 'pending' : result === null ? 'null' : result}</p>
    </div>
  )
}

function renderHarness(context: 'work' | 'family' | 'personal' | null = null) {
  return render(
    <DomainGateProvider>
      <Harness context={context} />
    </DomainGateProvider>,
  )
}

describe('DomainGateProvider', () => {
  it('shows the dialog with the task title when asked about an untagged task', async () => {
    const user = userEvent.setup()
    renderHarness(null)
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByRole('dialog', { name: 'Which domain?' })).toBeInTheDocument()
    expect(screen.getByText('Call plumber')).toBeInTheDocument()
  })

  it('choosing Family resolves \'family\' and closes the dialog', async () => {
    const user = userEvent.setup()
    renderHarness(null)
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await user.click(screen.getByRole('button', { name: 'Family' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('family'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Escape resolves null', async () => {
    const user = userEvent.setup()
    renderHarness(null)
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('null'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resolves immediately without a dialog when the task already has a context', async () => {
    const user = userEvent.setup()
    renderHarness('work')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('work'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
