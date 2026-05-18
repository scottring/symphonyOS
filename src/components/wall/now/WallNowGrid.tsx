import { WallNowQuadrant } from './WallNowQuadrant'
import type { DayGridData, DayGridTapTarget } from './buildDayGrid'

interface WallNowGridProps {
  grid: DayGridData
  onQuadrantTap: (target: DayGridTapTarget) => void
}

export function WallNowGrid({ grid, onQuadrantTap }: WallNowGridProps) {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full min-h-0">
      <WallNowQuadrant content={grid.upNext} variant="event" onTap={() => onQuadrantTap(grid.upNext.tap)} />
      <WallNowQuadrant content={grid.today} variant="neutral" onTap={() => onQuadrantTap(grid.today.tap)} />
      <WallNowQuadrant content={grid.pending} variant="neutral" onTap={() => onQuadrantTap(grid.pending.tap)} />
      <WallNowQuadrant content={grid.familyQuestion} variant="family" onTap={() => onQuadrantTap(grid.familyQuestion.tap)} />
    </div>
  )
}
