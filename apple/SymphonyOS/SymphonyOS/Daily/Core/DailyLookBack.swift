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

    /// The handle: lowers the sheet over the plan, or raises it. Lowering lets the bar go, as a
    /// page going away does (`.left`: it stops listening), since the bar is not drawn there.
    mutating func handleTapped(areas: [WalkArea], kept: [UUID]) -> [DailyBar.Event] {
        lowered.toggle()
        expanded = nil
        self.areas = lowered ? areas : []
        self.kept = lowered ? kept : []
        return lowered ? [.left] : []
    }

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
        return horizon == .week ? DailyCopy.showMyWeek : WalkCopy.showMyDay
    }

    /// The lowered sheet's numbers on this window: nil while it is up, and on a window with no
    /// handle (short windows), where nothing lowers. While nil the page is as it always is.
    func sheet(on metrics: DailyMetrics) -> DailyMetrics.Lowered? {
        lowered ? metrics.lowered : nil
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
