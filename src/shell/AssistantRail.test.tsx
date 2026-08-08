import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AssistantRail } from './AssistantRail'
import { AssistantProvider } from '@/contexts/AssistantContext'
import { AssistantLaunchProvider, useAssistantLauncher } from '@/contexts/AssistantLaunchContext'
import { SelectionProvider } from './providers/SelectionProvider'
import { createRegistry } from './appRegistry'
import type { AppDef } from './types'

const sendSpy = vi.fn(async (_m: unknown, h: { onDone: (r: string, s: string, x?: unknown) => void }) => {
  h.onDone('ok', 's1', undefined)
})
vi.mock('@/lib/agentStream', () => ({
  streamSymphonyAgent: (...args: unknown[]) =>
    (sendSpy as unknown as (...a: unknown[]) => Promise<void>)(...args),
}))
vi.mock('@/hooks/useMobile', () => ({ useMobile: () => false }))
vi.mock('@/components/chat/ChatPanel', () => ({
  ChatPanel: ({ messages }: { messages: { content: string }[] }) => (
    <div data-testid="chat-panel">{messages.map((m) => m.content).join('|')}</div>
  ),
}))

const ThingApp: AppDef = {
  id: 'thing',
  route: '/things',
  index: true,
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['thing'],
}
const registry = createRegistry([ThingApp])

function Launcher() {
  const { openAssistant } = useAssistantLauncher()
  return <button onClick={() => openAssistant({ message: 'seed me', autoSend: true })}>launch</button>
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <SelectionProvider registry={registry}>
        <AssistantLaunchProvider>
          <AssistantProvider>
            <Launcher />
            <AssistantRail registry={registry} />
          </AssistantProvider>
        </AssistantLaunchProvider>
      </SelectionProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  sendSpy.mockClear()
})

describe('AssistantRail', () => {
  it('shows the reopen tab when closed, on any route', () => {
    renderAt('/things')
    expect(screen.getByLabelText('Show Symphony AI')).toBeTruthy()
    expect(screen.queryByTestId('chat-panel')).toBeNull()
  })

  it('opens from the tab and renders the panel', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
  })

  it('sits flush right with no detail pane open', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByLabelText('Symphony AI').getAttribute('style')).toContain('right: 0px')
  })

  it('slides left of an open detail pane', async () => {
    renderAt('/things?detail=thing:abc')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByLabelText('Symphony AI').getAttribute('style')).toContain('right: 480px')
  })

  it('is 420px wide', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByLabelText('Symphony AI').getAttribute('style')).toContain('width: 420px')
  })

  it('opens and sends a launch seed exactly once', async () => {
    renderAt('/things')
    await act(async () => { screen.getByText('launch').click() })
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('chat-panel').textContent).toContain('seed me')
  })

  it('renders open on a fresh mount at another route (persisted desktop state)', async () => {
    renderAt('/things')
    await act(async () => { screen.getByLabelText('Show Symphony AI').click() })
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
    cleanup()
    renderAt('/things/other')
    expect(screen.getByTestId('chat-panel')).toBeTruthy()
  })
})
