import Foundation
import SwiftData

/// "See my whole plan" on Today's and Week's sheet (the boards' "Look back up"), on every phone
/// window (F25: short ones too). The handle lowers the sheet until only its grabber, the handle's words
/// and the header show (`DailyMetrics.lowered`), the bar goes, and the walk's own Look back up
/// (`MountainPage.lookBack`) stands behind it: one area read top to bottom, the others as side posts
/// (F6). There a tap on a side post stands in that area, and a cloth opens the paper for its level
/// (F21), where a row stands in its area. Nothing is written, and no walk is started or resumed.
struct DailyLookBack: Equatable {
    private(set) var lowered = false
    /// The area the plan stands in, once a side post or a paper's row was tapped; nil: the first kept
    /// area with a flag (the walk's own rule, `WalkState.settled`).
    private(set) var standing: UUID?
    /// The level whose paper a cloth opened; nil while no paper is up.
    private(set) var paperLevel: WalkLevel?
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
        standing = nil
        paperLevel = nil
        self.areas = areas
        self.kept = kept
        return [.left]
    }

    /// Back to the day: the sheet up, nothing open.
    mutating func raise() {
        lowered = false
        standing = nil
        paperLevel = nil
        areas = []
        kept = []
    }

    /// A Tell asked for from outside (`DailyGate.tell`) while the plan shows: the sheet rises
    /// first, so the bar that answers it, its light and its listening line, are on screen. While
    /// the walk shows the Tell waits, and so does this; under the half-open display (`covered`) the
    /// Tell is the display's and the plan stays down. True when it raised the sheet.
    @discardableResult
    mutating func tellArrives(asked: Bool, walkShowing: Bool, covered: Bool = false) -> Bool {
        guard asked, !walkShowing, !covered, lowered else { return false }
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

    /// A tap the walk's layout reads on the plan (`WalkLayout.tapEvent`), only while the plan shows:
    /// a side post stands in its area, a cloth opens its level's paper, "Show the mountain" closes it.
    /// While the paper is up nothing under it takes a tap; a flag is only read.
    mutating func tap(_ event: WalkEvent?) {
        guard lowered, let event else { return }
        switch event {
        case .paperClosed:
            paperLevel = nil
        case .areaTapped(let id) where paperLevel == nil:
            standing = id
        case .lookBackPaper(let level) where paperLevel == nil:
            paperLevel = level
        default:
            return
        }
    }

    /// A row on the paper: it closes, and the plan stands in that row's area (as a side post's tap
    /// does); a row with no kept area only closes it.
    mutating func rowTapped(_ id: UUID, on paper: PlanPaper) {
        guard lowered, paperLevel != nil else { return }
        paperLevel = nil
        if let area = paper.sections.first(where: { $0.rows.contains { $0.id == id } })?.area { standing = area }
    }

    /// The handle's words: the walk's "see my whole plan" while the sheet is up; lowered,
    /// what raising it shows ("Show my day" on Today, "Show my week" on Week).
    func label(on horizon: Horizon) -> String {
        guard lowered else { return WalkCopy.lookBackHandle }
        return horizon == .week ? DailyCopy.showMyWeek : DailyCopy.showMyDay
    }

    /// The lowered sheet's numbers on this window: nil while it is up. While nil the page is as it always is.
    func sheet(on metrics: DailyMetrics, safeBottom: CGFloat) -> DailyMetrics.Lowered? {
        lowered ? metrics.lowered(safeBottom: safeBottom) : nil
    }

    /// The plan behind the lowered sheet: the walk's step 6 over every flag of the walk's own
    /// periods, read from the person's own personal rows, on the ridge read as it lowered, standing
    /// where a tap put it (the walk's own rule settles it where that area holds nothing), with the
    /// paper a cloth opened.
    func plan(goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods, me: UUID) -> WalkState {
        let items = WalkLoad.items(goals: goals, tasks: DailyDay.mine(tasks, me: me), periods: periods, me: me,
                                   planted: [], areas: areas)
        var state = MountainPage.lookBack(items: items, areas: areas, kept: kept)
        state.focusArea = standing
        if lowered, let paperLevel {
            state.paperOpen = true
            state.paperLevel = paperLevel
        }
        return state.settled
    }

    /// The paper a cloth opened, over the kept areas the plan read: nil while none is up.
    func paper(goals: [Goal], tasks: [SymphonyTask], periods: WalkPeriods, me: UUID) -> PlanPaper? {
        guard lowered, paperLevel != nil else { return nil }
        return plan(goals: goals, tasks: tasks, periods: periods, me: me).paper(periods)
    }

    /// The ridge as the mountain pages read it, and the saved walk's kept areas on it.
    static func ridge(_ rows: [GoalArea], me: UUID, saved: WalkPosition?) -> (areas: [WalkArea], kept: [UUID]) {
        let areas = MountainPage.areas(rows, me: me, saved: saved?.areas ?? [])
        return (areas, MountainPage.kept(items: [], areas: areas, saved: saved?.kept ?? [], savedAreas: saved?.areas ?? []))
    }
}
