import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { render } from '@/test/test-utils'

vi.mock('@/components/choices/ChoicePage', () => ({
  ChoicePage: ({ id }: { id: string }) => <div>Choice page for {id}</div>,
}))

import { ChoicesApp } from './ChoicesApp'

// Mounted the way the app mounts it: main.tsx at /choice/*, then ShellRoutes
// at the relative /*, so ChoicesApp sees paths relative to /choice.
function renderAt(path: string) {
  window.history.pushState({}, '', path)
  render(
    <Routes>
      <Route path="/choice/*" element={<Routes><Route path="/*" element={<ChoicesApp />} /></Routes>} />
    </Routes>,
  )
}

describe('ChoicesApp', () => {
  it('opens the choice named in /choice/:id', () => {
    renderAt('/choice/3149cce3-e933-43d2-9ac4-176e91e72c0f')
    expect(screen.getByText('Choice page for 3149cce3-e933-43d2-9ac4-176e91e72c0f')).toBeInTheDocument()
  })

  it('says so when the address names no choice', () => {
    renderAt('/choice/a/b')
    expect(screen.getByText("This choice isn't available")).toBeInTheDocument()
  })
})
