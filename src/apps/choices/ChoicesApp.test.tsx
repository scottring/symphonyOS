import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { render } from '@/test/test-utils'

vi.mock('@/hooks/useChoices', () => ({
  CHOICES_UPDATED: 'symphony-choices-updated',
  useChoice: () => ({ detail: null, loading: false, refetch: vi.fn() }),
}))

import { ChoicesApp } from './ChoicesApp'

describe('ChoicesApp', () => {
  it('says so when the choice is not available', () => {
    window.history.pushState({}, '', '/choice/gone')
    render(
      <Routes><Route path="/*" element={<ChoicesApp />} /></Routes>,
    )
    expect(screen.getByText("This choice isn't available")).toBeInTheDocument()
  })
})
