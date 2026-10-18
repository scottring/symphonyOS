import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EverydayGuide } from './EverydayGuide'
import { deckWeekUrl } from '@/lib/planning/deck'
import { weekStartAnchor, readCadenceConfig } from '@/lib/cadence/config'

describe('EverydayGuide', () => {
  it('Review Week opens the review deck on the current week', () => {
    render(<MemoryRouter><EverydayGuide /></MemoryRouter>)
    const href = screen.getByText('Review Week').getAttribute('href')
    expect(href).toBe(deckWeekUrl(weekStartAnchor(new Date(), readCadenceConfig().weekStartsOn)))
  })
})
