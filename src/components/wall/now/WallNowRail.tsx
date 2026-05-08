interface WallNowRailProps {
  dinner: string | null
  openListCount: number
  discussionCount: number
}

export function WallNowRail({ dinner, openListCount, discussionCount }: WallNowRailProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl bg-neutral-900/40 p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Dinner</div>
        <div className="text-base text-neutral-100 truncate">
          {dinner ?? <span className="text-neutral-500">No dinner planned</span>}
        </div>
      </div>
      <div className="rounded-xl bg-neutral-900/40 p-4">
        <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Lists</div>
        <div className="text-base text-neutral-100">
          🛒 {openListCount}
        </div>
      </div>
      {discussionCount > 0 ? (
        <div className="rounded-xl bg-amber-900/40 p-4">
          <div className="text-xs uppercase tracking-wider text-amber-300 mb-1">To discuss</div>
          <div className="text-base text-amber-100">💬 {discussionCount}</div>
        </div>
      ) : (
        <div />
      )}
    </div>
  )
}
