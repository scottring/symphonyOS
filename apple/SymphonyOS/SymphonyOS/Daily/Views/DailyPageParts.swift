#if os(iOS)
import SwiftUI

/// A page's header on the paper: the eyebrow in small capitals over the title in Crimson Pro
/// (Today over the date, This week over its range), with the ring at the right when the page
/// has one. Drawn in `frame` (page points). Shared by Today, Week and both pages of the spread.
/// Today's header keeps a column for its ring (`ringColumn`): the words and the ring, when there
/// is one, share the width 12 apart. Week's header has none: its words take the whole width, laid
/// out exactly as it always was.
struct DailyPageHeader: View {
    let eyebrow: String
    let title: String
    /// Done of total, or nil for no ring.
    var ring: (done: Int, total: Int)?
    var ringDiameter: CGFloat = 56
    /// False for a page that never has a ring (Week, the spread's left page).
    var ringColumn = true
    let frame: CGRect

    var body: some View {
        Group {
            if ringColumn {
                HStack(alignment: .center, spacing: 12) {
                    words
                    Spacer(minLength: 0)
                    if let ring { DailyRing(done: ring.done, total: ring.total, diameter: ringDiameter) }
                }
                .frame(width: frame.width, height: frame.height)
                .offset(x: frame.minX, y: frame.minY)
            } else {
                words
                    .frame(width: frame.width, height: frame.height, alignment: .leading)
                    .offset(x: frame.minX, y: frame.minY)
            }
        }
        .dynamicTypeSize(...DailyPalette.largestChrome)        // a fixed frame: the rows under it grow instead
    }

    private var words: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(eyebrow.uppercased())
                .font(DailyPalette.sansMedium(11, relativeTo: .caption))
                .tracking(1.5)
                .foregroundStyle(DailyPalette.muted)
            Text(title)
                .font(DailyPalette.crimson(27, relativeTo: .title))
                .foregroundStyle(DailyPalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(minHeight: 32)
                .accessibilityAddTraits(.isHeader)
        }
    }
}

/// What light Today needs wherever it is drawn (the phone's Today, the spread's right page): the
/// bar adds to today; the stored walk is read as the page appears and again whenever a walk closes,
/// the day or the selected date moves, or the first goal arrives (`DailyGate.walkLine` reads it);
/// and a Tell Symphony asked for from outside is answered by the one bar (`DailyModel.answerTell`),
/// at once or as the walk closes. `beforeTell` runs first (Today raises its lowered sheet there);
/// `tellTaken` when the request was taken (the page closes its own sheets); `appeared` last on
/// appearing (the handover). The rules are the core's; this only calls them at the right moments.
struct DailyTodayHooks: ViewModifier {
    let model: DailyModel
    let userId: UUID
    @Binding var walkPosition: WalkPosition?
    let goalCount: Int
    var beforeTell: () -> Void = {}
    var tellTaken: () -> Void = {}
    var appeared: () -> Void = {}

    @Environment(AppState.self) private var appState

    func body(content: Content) -> some View {
        content
            .onAppear {
                model.page = .today         // the bar adds to today (Week sets its own)
                readWalk()
                answerTell()
                appeared()
            }
            // The Lock Screen's Tell Symphony control or a `symphony://tell` link: the bar listens, no
            // sheet; asked for while the walk shows, it is answered as the walk closes.
            .onChange(of: appState.tellRequested) { _, _ in answerTell() }
            .onChange(of: appState.walkShowing) { _, _ in answerTell() }
            // A walk that ends lands on Today (`goToToday`) and says whether one is left waiting.
            .onChange(of: appState.walkPaused) { _, _ in readWalk() }
            .onChange(of: appState.selectedDate) { _, _ in readWalk() }
            .onChange(of: goalCount) { _, _ in readWalk() }
    }

    private func readWalk() { walkPosition = Self.walkStore.load(for: userId) }

    private func answerTell() {
        beforeTell()
        if model.answerTell(appState) { tellTaken() }
    }

    /// Where the walk is saved, as the main view reads it (the demo keeps its own store).
    @MainActor static var walkStore: WalkPositionStore {
        #if DEBUG
        if DemoMode.isOn { return DemoMode.walkStore }
        #endif
        return WalkPositionStore()
    }

    /// The one quiet line at the top of light Today (`DailyGate.walkLine`); the demo's `waiting`
    /// state shows it, as the demo keeps no stored walk.
    @MainActor static func walkLine(_ position: WalkPosition?, goalCount: Int, edition: Edition) -> DailyGate.WalkLine? {
        #if DEBUG
        if DemoMode.isOn, DemoMode.dailyStates.contains("waiting") { return .waiting }
        #endif
        return DailyGate.walkLine(position, goalCount: goalCount, edition: edition)
    }

    /// Anything over the page that hides the bar (`DailyHandover.play`'s `sheetOver`): a row's
    /// details (`detailsOpen`), Inbox or More, the half-open display.
    @MainActor static func sheetOver(detailsOpen: Bool, _ appState: AppState) -> Bool {
        detailsOpen || appState.dailyPanel != nil || appState.posture.isHalfOpen
    }
}

/// Where the pages meet on a window opened flat, read from the fold the screen reports
/// (`AppState.dockLayout.fold`, `HalfOpen.split`) for a page whose top-left stands at `origin` on
/// the screen, and kept to the middle unless it is near it (`DailySpread.fold`). Debug: `-SpreadFold`.
enum DailyFold {
    @MainActor static func reported(_ appState: AppState, origin: CGPoint, size: CGSize) -> CGFloat {
        #if DEBUG
        if let pinned = DailySpreadPinned.fold { return DailySpread.fold(pinned, width: size.width) }
        #endif
        return DailySpread.fold(HalfOpen.split(fold: appState.dockLayout.fold, origin: origin, size: size, across: false),
                                width: size.width)
    }
}

/// Today's rows, as Today draws them (`DailyRow`): each ticks on a tap and offers first today,
/// Details and Pull it up on a press and hold; with none, the walk's "nothing today" line. They
/// scroll in their own space (`frame`, page points, from the first row's top to the page's foot)
/// and can be scrolled clear of the fade (`clearOf`); the 4 points above leave room for a lit
/// row's halo. A row a change touched (Undo showing) is scrolled clear of the fade and the Undo.
/// Shared by Today and the spread's right page.
struct DailyTodayList: View {
    let model: DailyModel
    let page: DailyTodayPage
    let frame: CGRect
    /// The rows' left and right inset inside `frame`.
    let inset: CGFloat
    let rowHeight: CGFloat
    let rowGap: CGFloat
    let clearOf: CGFloat
    /// A row's Details, opened over the page.
    let details: (DailyDay.Row) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Where the rows stand, so the row an Undo would change is kept clear of it.
    @State private var frames = DailyRowFrames()

    private static let halo: CGFloat = 4

    var body: some View {
        if page.rows.isEmpty {
            Text(WalkCopy.nothingToday)
                .font(DailyPalette.crimson(19, relativeTo: .title3))
                .foregroundStyle(DailyPalette.soft)
                .frame(width: frame.width - 2 * inset - 12, alignment: .leading)
                .offset(x: frame.minX + inset + 6, y: frame.minY + 6)
        } else {
            rows
        }
    }

    private var rows: some View {
        let halo = Self.halo
        let scroll = CGRect(x: frame.minX, y: frame.minY - halo, width: frame.width, height: frame.height + halo)
        return ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: rowGap) {
                    ForEach(page.rows) { row in
                        DailyRow(row: row, height: rowHeight, lit: model.lit == row.id,
                                 toggle: { model.toggle(row) },
                                 setFirst: {
                                     let mark = page.firstMark(toggling: row)
                                     model.setFirst(mark.id, previous: mark.previous)
                                 },
                                 // The bar lets go before the sheet covers it (`sheetOpening`).
                                 details: { model.sheetOpening(); details(row) },
                                 pullUp: { model.pullUp(row.id, level: .week) })
                            .dailyRowFrame(row.id, in: frames)
                    }
                }
                .padding(.horizontal, inset)
                .padding(.top, halo)
                .padding(.bottom, frame.maxY - clearOf + halo)
            }
            .dailyListFrame(frames)
            .onChange(of: model.reveal) { _, reveal in
                guard let reveal else { return }
                frames.keepInSight(reveal.id, above: clearOf, proxy: proxy, animated: !reduceMotion)
            }
        }
        .frame(width: scroll.width, height: scroll.height)
        .offset(x: scroll.minX, y: scroll.minY)
    }

    /// The task screen a row's Details opens.
    static func details(_ row: DailyDay.Row) -> TimelineItem {
        TimelineItem(id: "task-\(row.id.uuidString)", type: .task, title: row.title, startTime: nil, isAllDay: true,
                     completed: row.done, context: "personal", entityId: row.id)
    }
}

/// The one quiet line at the top of light Today (`DailyGate.walkLine`): a walk left with Leave for
/// now picks back up (Settings' "Pick the walk back up"); a walk declined at Welcome starts from the
/// top. Drawn in `frame` (page points), 44 high.
struct DailyWalkLine: View {
    let line: DailyGate.WalkLine
    let frame: CGRect

    @Environment(AppState.self) private var appState

    var body: some View {
        let words = line == .waiting ? DailyCopy.walkWaiting : DailyCopy.walkWhenReady
        Button {
            switch line {
            case .waiting: appState.resumeWalk()                    // Settings' "Pick the walk back up"
            case .whenReady: appState.walkReplayRequested = true    // from the top
            }
        } label: {
            Text(words)
                .font(DailyPalette.sansMedium(13, relativeTo: .subheadline))
                .foregroundStyle(DailyPalette.deepGreen)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: frame.width, height: frame.height)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: frame.minX, y: frame.minY)
        .dynamicTypeSize(...DailyPalette.largestChrome)        // one line in a fixed frame
        .accessibilityIdentifier("daily.walkWaiting")
    }
}

/// Where a tap on the signpost leads, the same on Today and on the spread. A sign that takes you
/// somewhere is put away for the day (`putAwayWhenFollowed`); "First, today" only lights its row;
/// a walk down opens one level below the goal the sign names and comes back to the page.
@MainActor struct DailySignFollower {
    let model: DailyModel
    let appState: AppState
    let goals: [Goal]
    let tasks: [SymphonyTask]
    let goalAreas: [GoalArea]
    let walkPosition: WalkPosition?
    let seasons: [SeasonBoundary]?
    let userId: UUID
    /// A page on a date.
    let open: (Horizon, Date) -> Void

    func follow(_ sign: Signpost.Sign) {
        switch sign.target {
        case .light(let id):
            model.light(id)
        case .week(let day):
            open(.week, day)
        case .page(let horizon, let day):
            open(horizon, day)
        case .walkDown:
            // The walk opens one level below the goal the sign names, and comes back to Today;
            // the bar lets go first. A sign that could not open it is not put away.
            // In the periods the sign read (`DailyPeriods.current`), so the goal it names is found there.
            let read = DailyPeriods.current(today: model.today, seasons: seasons, goals: goals, tasks: tasks, me: userId)
            let down = DailyWalkDown.sign(sign.target, goals: goals, tasks: tasks, areaRows: goalAreas,
                                          saved: walkPosition, periods: read, now: model.today,
                                          seasons: seasons, me: userId)
            for event in down?.bar ?? [] { model.send(event) }
            appState.walkDown = down
            if DailyWalkDown.putsAway(sign, walkDown: down) { model.dismiss(sign.kind) }
            return
        }
        if sign.putAwayWhenFollowed { model.dismiss(sign.kind) }
    }
}
#endif
