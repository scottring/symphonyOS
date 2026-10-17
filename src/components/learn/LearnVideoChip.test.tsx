import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LearnPageContext, LearnVideoChip } from './LearnVideoChip'
import { videoForPage } from '@/lib/learn/learnVideos'

const onPage = (page: string | null) =>
  render(<LearnPageContext.Provider value={page}><LearnVideoChip /></LearnPageContext.Provider>)

describe('LearnVideoChip', () => {
  beforeEach(() => localStorage.clear())

  it('offers the page’s guide and plays it in a dialog', () => {
    onPage('inbox')
    fireEvent.click(screen.getByRole('button', { name: /Watch: Start with Inbox/ }))
    const dialog = screen.getByRole('dialog', { name: 'Start with Inbox' })
    expect(dialog.querySelector('source')?.getAttribute('src')).toBe('/assets/videos/onboarding-v1/02-inbox.mp4')
    expect(dialog.querySelector('track')?.getAttribute('src')).toBe('/assets/videos/onboarding-v1/02-inbox.vtt')
    // Watched: the chip is gone, the dialog stays until closed.
    expect(screen.queryByTestId('learn-cue')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is only a play button, named by the guide and its length', () => {
    onPage('inbox')
    const play = screen.getByTestId('learn-cue')
    expect(play.textContent).toBe('')
    expect(play.getAttribute('aria-label')).toMatch(/^Watch: Start with Inbox \(\d+s\)$/)
  })

  it('moves on to the page’s next guide once one is watched, and remembers it', () => {
    const { unmount } = onPage('today')
    fireEvent.click(screen.getByRole('button', { name: /Watch: Choose a task for today/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.getByRole('button', { name: /Watch: Add an urgent task/ })).toBeTruthy()
    unmount()
    onPage('today')
    expect(screen.queryByRole('button', { name: /Choose a task for today/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Watch: Add an urgent task/ })).toBeTruthy()
  })

  it('shows nothing outside the shell or on a page without a guide', () => {
    onPage(null)
    onPage('settings')
    expect(screen.queryByTestId('learn-cue')).toBeNull()
  })

  it('shows nothing once every guide for the page is seen', () => {
    expect(videoForPage('routines', new Set(['07-routines']))).toBeNull()
  })
})
