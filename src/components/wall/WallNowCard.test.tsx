import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WallNowCard } from './WallNowCard'
import type { DayGridData } from './now/buildDayGrid'

describe('WallNowCard', () => {
  it('renders imminent event title for imminent focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'imminent', entity: { kind: 'event', entity: { title: 'Soccer practice' }, startTime: new Date(Date.now() + 10 * 60_000) } as any }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })

  it('renders the mode-default label for mode-default focus', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
      />
    )
    expect(screen.getAllByText(/dinner/i).length).toBeGreaterThan(0)
  })

  it('toggles pin on pin button tap', () => {
    const onPinToggle = vi.fn()
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={onPinToggle}
        familyPrompt={null}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /pin/i }))
    expect(onPinToggle).toHaveBeenCalled()
  })

  it('shows family conversation prompt chip when in dinner mode with prompt', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'dinner' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="What made you laugh today?"
      />
    )
    expect(screen.getByText(/what made you laugh today/i)).toBeInTheDocument()
  })

  it('does not show family prompt chip in non-dinner modes', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt="Question of the day"
      />
    )
    expect(screen.queryByText(/question of the day/i)).not.toBeInTheDocument()
  })

  const sampleGrid: DayGridData = {
    upNext: { eyebrow: 'UP NEXT', headline: 'Soccer practice', lines: [], tap: { quadrant: 'upNext', itemId: 'e1' } },
    today: { eyebrow: 'TODAY', headline: 'A quiet afternoon', lines: [], tap: { quadrant: 'today' } },
    pending: { eyebrow: "WHILE IT'S QUIET", headline: 'All caught up', lines: [], tap: { quadrant: 'pending' } },
    familyQuestion: { eyebrow: "TONIGHT'S QUESTION", headline: '"Best part?"', lines: [], tap: { quadrant: 'familyQuestion' } },
  }

  it('renders the 2x2 grid for Day mode-default when dayGrid is supplied', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        dayGrid={sampleGrid}
        onQuadrantTap={() => {}}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
    expect(screen.getByText('"Best part?"')).toBeInTheDocument()
  })

  it('renders the 2x2 grid when Day is an active override (rhythm-bar tap)', () => {
    render(
      <WallNowCard
        focus={{ kind: 'override-mode', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        dayGrid={sampleGrid}
        onQuadrantTap={() => {}}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })

  it('renders the 2x2 grid when Day is pinned', () => {
    render(
      <WallNowCard
        focus={{ kind: 'pinned-mode', mode: 'day' }}
        pinned={true}
        onPinToggle={() => {}}
        familyPrompt={null}
        dayGrid={sampleGrid}
        onQuadrantTap={() => {}}
      />
    )
    expect(screen.getByText('Soccer practice')).toBeInTheDocument()
  })

  it('still renders the single list for Day mode when no dayGrid supplied', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        todayItems={[]}
      />
    )
    expect(screen.getByText('All clear')).toBeInTheDocument()
  })

  it('applies the fade-in class to the content wrapper by default', () => {
    const { container } = render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'day' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        todayItems={[]}
      />
    )
    expect(container.querySelector('.wall-now-fade-in')).not.toBeNull()
  })

  it('omits the fade-in class when the user prefers reduced motion', () => {
    const original = window.matchMedia
    window.matchMedia = ((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
    try {
      const { container } = render(
        <WallNowCard
          focus={{ kind: 'mode-default', mode: 'day' }}
          pinned={false}
          onPinToggle={() => {}}
          familyPrompt={null}
          todayItems={[]}
        />
      )
      expect(container.querySelector('.wall-now-fade-in')).toBeNull()
    } finally {
      window.matchMedia = original
    }
  })

  it('groups Morning routine steps by child with labeled sections', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        routineGroups={[
          { ownerId: 'k', label: 'Kaleb', steps: [
            { id: 'k1', kind: 'routine-step', title: 'K dressed', completed: false, ownerId: 'k', startTime: new Date(), sourceId: 'k1' },
          ] },
          { ownerId: 'e', label: 'Ella', steps: [
            { id: 'e1', kind: 'routine-step', title: 'E dressed', completed: false, ownerId: 'e', startTime: new Date(), sourceId: 'e1' },
          ] },
        ]}
      />
    )
    expect(screen.getByText('Kaleb')).toBeInTheDocument()
    expect(screen.getByText('Ella')).toBeInTheDocument()
    expect(screen.getByText('K dressed')).toBeInTheDocument()
    expect(screen.getByText('E dressed')).toBeInTheDocument()
  })

  it('checking a grouped routine step calls onCheckItem with that step id', () => {
    const onCheckItem = vi.fn()
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        onCheckItem={onCheckItem}
        routineGroups={[
          { ownerId: 'k', label: 'Kaleb', steps: [
            { id: 'k1', kind: 'routine-step', title: 'K dressed', completed: false, ownerId: 'k', startTime: new Date(), sourceId: 'k1' },
          ] },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /check k dressed/i }))
    expect(onCheckItem).toHaveBeenCalledWith('k1', true)
  })

  it('falls back to the flat routine list when no routineGroups supplied', () => {
    render(
      <WallNowCard
        focus={{ kind: 'mode-default', mode: 'morning' }}
        pinned={false}
        onPinToggle={() => {}}
        familyPrompt={null}
        routineSteps={[
          { id: 'r1', kind: 'routine-step', title: 'Solo step', completed: false, ownerId: null, startTime: new Date(), sourceId: 'r1' },
        ]}
      />
    )
    expect(screen.getByText('Solo step')).toBeInTheDocument()
  })
})
