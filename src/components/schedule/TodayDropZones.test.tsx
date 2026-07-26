import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { TodayBandDropZone, TodayGapDropZone } from './TodayDropZones'
import { TodayDraggableRow } from './TodayDraggableRow'
import { TodayDragProvider } from './TodayDragProvider'

// The zones read drag state from TodayDragProvider, so they must be mounted
// inside one — that also supplies the DndContext useDroppable needs.
const wrap = (ui: ReactNode) => render(
  <TodayDragProvider resolve={() => []} onIntents={vi.fn()} renderOverlay={() => null}>
    {ui}
  </TodayDragProvider>
)

describe('drop zones', () => {
  it('a band zone carries its section drop id', () => {
    wrap(<TodayBandDropZone section="morning"><span>rows</span></TodayBandDropZone>)
    expect(screen.getByTestId('today-band-morning')).toBeInTheDocument()
  })

  it('a gap zone carries its section and index', () => {
    wrap(<TodayGapDropZone section="allday" index={2}><span>gap</span></TodayGapDropZone>)
    expect(screen.getByTestId('today-gap-allday:2')).toBeInTheDocument()
  })

  it('renders its children — a zone is a wrapper, not a replacement', () => {
    wrap(<TodayBandDropZone section="evening"><span>the rows</span></TodayBandDropZone>)
    expect(screen.getByText('the rows')).toBeInTheDocument()
  })

  it('a draggable row registers under its row drop id', () => {
    wrap(<TodayDraggableRow itemId="task-a"><span>row</span></TodayDraggableRow>)
    expect(screen.getByTestId('today-row-task-a')).toBeInTheDocument()
  })

  it('a disabled row is NOT draggable — a refusal must be visible, not a bounce', () => {
    wrap(<TodayDraggableRow itemId="event-1" disabled><span>row</span></TodayDraggableRow>)
    expect(screen.getByTestId('today-row-event-1')).toHaveAttribute('data-drag-disabled', 'true')
  })

  it('an enabled row carries no disabled marker', () => {
    wrap(<TodayDraggableRow itemId="task-a"><span>row</span></TodayDraggableRow>)
    expect(screen.getByTestId('today-row-task-a')).not.toHaveAttribute('data-drag-disabled')
  })

  it('handles item ids containing separators', () => {
    wrap(<TodayDraggableRow itemId="routine-r1#2"><span>row</span></TodayDraggableRow>)
    expect(screen.getByTestId('today-row-routine-r1#2')).toBeInTheDocument()
  })
})

describe('TodayDraggableRow accessibility', () => {
  it('does NOT add a nested button role — ScheduleItem already is one', () => {
    // dnd-kit's `attributes` sets role="button" + its own tabIndex. Spreading
    // them nested a button inside a button, which broke getByRole queries and
    // would read as two controls to a screen reader.
    wrap(
      <TodayDraggableRow itemId="task-a">
        <button type="button">Real row control</button>
      </TodayDraggableRow>
    )
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
