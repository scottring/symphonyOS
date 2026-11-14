import Foundation
import SwiftData

/// "See my whole plan" on Today's and Week's sheet (the boards' "Look back up"), on windows
/// that have the handle. The handle lowers the sheet until only its grabber, the handle's words
/// and the header show (`DailyMetrics.lowered`), the bar goes, and the walk's own top-to-bottom
/// plan (`MountainPage.lookBack`) stands behind it; the handle raises it again. There a tap on a
/// post's "+n" opens that post; every other flag is read, not tapped. Nothing is written, and no
/// walk is started or resumed.
struct DailyLookBack: Equatable {
    private(set) var lowered = false
    /// The post whose "+n" was tapped.
    private(set) var expanded: WalkPostKey?
    /// The ridge and the kept areas, read once as the sheet lowers, so area ids hold while it is down.
    private(set) var areas: [WalkArea] = []
    private(set) var kept: [UUID] = []

    /// The handle: lowers the sheet over the plan, or, lowered, raises it (a tap anywhere on the
    /// lowered strip is this too). Lowering lets the bar go, as a page going away does (`.left`:
    /// it stops listening), since the bar is not drawn there.
    mutating func handleTapped(areas: [WalkArea], kept: [UUID]) -> [DailyBar.Event] {
        guard !lowered else {
            raise()
            return []
        }
        lowered = true
        expanded = nil
        self.areas = areas
        self.kept = kept
        return [.left]
    }

    /// Back to the day: the sheet up, nothing open.
    mutating func raise() {
        lowered = false
        expanded = nil
        areas = []
        kept = []
    }

    /// A Tell asked for from outside (`DailyGate.tell`) while the plan shows: the sheet rises
    /// first, so the bar that answers it, its light and its listening line, are on screen. While
    /// the walk shows the Tell waits, and so does this. True when it raised the sheet.
    @discardableResult
    mutating func tellArrives(asked: Bool, walkShowing: Bool) -> Bool {
        guard asked, !walkShowing, lowered else { return false }
        raise()
        return true
    }

    /// What a touch on the lowered strip does, decided when the finger lifts: a tap raises the
    /// sheet, and so does a drag mostly upward of `raiseDrag` points or more; any other drag
    /// does nothing. A touch is a drag once it moves `DailyTodayPage.dragStarts`, as on the sign.
    static func stripRaises(translation: CGSize, endedAsDrag: Bool = false) -> Bool {
        guard endedAsDrag || DailyTodayPage.isDrag(translation) else { return true }
        return -translation.height >= raiseDrag && abs(translation.height) > abs(translation.width)
    }

    /// A drag up of this many points on the lowered strip raises the sheet.
    static let raiseDrag: CGFloat = 30

    /// A tap the walk's layout reads on the plan (`WalkLayout.tapEvent`): only "+n" does
    /// anything, and only while the plan shows; a second tap closes that post again.
    mutating func tap(_ event: WalkEvent?) {
        guard lowered, case .stubTapped(let key) = event else { return }
        expanded = expanded == key ? nil : key
    }

    /// The handle's words: the walk's "see my whole plan" while the sheet is up; lowered,
    /// what raising it shows ("Show my day" on Today, "Show my week" on Week).
    func label(on horizon: Horizon) -> String {
        guard lowered else { return WalkCopy.lookBackHandle }
        return horizon == .week ? DailyCopy.showMyWeek : DailyCopy.showMyDay
    }

    /// The lowered sheet's numbers on this window: nil while it is up, and on a window with no
    /// handle (short windows), where nothing lowers. While nil the page is as it always is.
    func sheet(on metrics: DailyMetrics, safeBottom: CGFloat) -> DailyMetrics.Lowered? {
        lowered ? metrics.lowered(safeBottom: safeBottom) : nil
    }

    /// The plan behind the lowered sheet: the walk's step 6 over every flag of the walk's own
    /// periods, read from the person's own personal rows, on the ridge read as it lowered.
    func plan(goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods, me: UUID) -> WalkState {
        let items = WalkLoad.items(goals: goals, tasks: DailyDay.mine(tasks, me: me), periods: periods, me: me,
                                   planted: [], areas: areas)
        var state = MountainPage.lookBack(items: items, areas: areas, kept: kept)
        state.expanded = lowered ? expanded : nil
        return state
    }

    /// The ridge as the mountain pages read it, and the saved walk's kept areas on it.
    static func ridge(_ rows: [GoalArea], me: UUID, saved: WalkPosition?) -> (areas: [WalkArea], kept: [UUID]) {
        let areas = MountainPage.areas(rows, me: me, saved: saved?.areas ?? [])
        return (areas, MountainPage.kept(items: [], areas: areas, saved: saved?.kept ?? [], savedAreas: saved?.areas ?? []))
    }
}
