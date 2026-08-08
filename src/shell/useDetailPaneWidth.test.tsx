import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SelectionProvider } from './providers/SelectionProvider'
import { createRegistry } from './appRegistry'
import { useDetailPaneWidth } from './useDetailPaneWidth'
import type { AppDef } from './types'

const WideApp: AppDef = {
  id: 'wide',
  route: '/wide',
  index: true,
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['wide-thing'],
}

const NarrowApp: AppDef = {
  id: 'narrow',
  route: '/narrow',
  Component: () => <div />,
  DetailPanelComponent: () => <div />,
  ownsSelectionKinds: ['narrow-thing'],
  detailPanelWidth: 420,
}

const registry = createRegistry([WideApp, NarrowApp])

function Probe() {
  return <span data-testid="width">{useDetailPaneWidth(registry)}</span>
}

function renderAt(url: string) {
  const { unmount } = render(
    <MemoryRouter initialEntries={[url]}>
      <SelectionProvider registry={registry}>
        <Probe />
      </SelectionProvider>
    </MemoryRouter>,
  )
  const value = screen.getByTestId('width').textContent
  unmount()
  return value
}

describe('useDetailPaneWidth', () => {
  it('is 0 with no selection', () => {
    expect(renderAt('/wide')).toBe('0')
  })

  it('falls back to the 480 default for an app that declares no width', () => {
    expect(renderAt('/wide?detail=wide-thing:abc')).toBe('480')
  })

  it("uses the owning app's declared width", () => {
    expect(renderAt('/narrow?detail=narrow-thing:abc')).toBe('420')
  })
})
