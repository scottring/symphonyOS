import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GuideHeader } from './GuideHeader'
import { stepsFor } from '@/lib/guide/steps'

const step = stepsFor('week')[1]
const base = { level: 'week' as const, step, index: 1, total: 7 }

describe('GuideHeader', () => {
  it('shows title, why, you and guide', () => {
    render(<GuideHeader {...base} />)
    expect(screen.getByText(step.title)).toBeInTheDocument()
    expect(screen.getByText(step.why)).toBeInTheDocument()
    expect(screen.getByText(step.you)).toBeInTheDocument()
    expect(screen.getByText(step.guide)).toBeInTheDocument()
    expect(screen.getByText(/step 2 of 7/i)).toBeInTheDocument()
  })

  it('reveals more inline', () => {
    render(<GuideHeader {...base} />)
    expect(screen.queryByText(step.more)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Explain more' }))
    expect(screen.getByText(step.more)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }))
    expect(screen.queryByText(step.more)).toBeNull()
  })

  // The step's tooltip on the page owns the session's
  // navigation; the conversation's header only explains the step.
  it('has no Next, Skip or Done: the tooltip on the page holds them', () => {
    render(<GuideHeader {...base} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Explain more'])
  })

})
