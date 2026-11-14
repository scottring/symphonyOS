import Foundation

/// The one place that decides whether a light page shows. A full household, and any
/// mixed or unknown one (which `Edition.resolve` already makes full), keeps every
/// screen it has today; a light household gets a light page only once it is built.
enum DailyGate {
    /// Light pages that are built. Tasks 11 and 14 add theirs.
    static let horizons: Set<Horizon> = [.today, .week]
    /// Window shapes the light pages are built for. Tasks 17 and 18 add theirs; never
    /// `.glanceWide`, where a phone on its side keeps the old screens.
    static let layouts: Set<TodayLayout> = [.oneColumn]
    /// The add bar is built (Task 9).
    static let barBuilt = true
    /// The light half-open display is built (Task 19).
    static let halfOpenBuilt = true

    static func shows(_ horizon: Horizon, edition: Edition, layout: TodayLayout,
                      horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool {
        edition == .light && horizons.contains(horizon) && layouts.contains(layout)
    }

    /// The dock gives way to the bar, only where light Today shows and the bar is built.
    static func hidesDock(edition: Edition, layout: TodayLayout, barBuilt: Bool = barBuilt,
                          horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool {
        barBuilt && shows(.today, edition: edition, layout: layout, horizons: horizons, layouts: layouts)
    }

    static func halfOpen(edition: Edition, built: Bool = halfOpenBuilt) -> Bool {
        edition == .light && built
    }

    /// The light half-open display is up over the Planner (`halfOpen`: the phone is set down
    /// partly open): the page under it is not drawn, so only the display's own bar can listen,
    /// write or answer a Tell. A full household's page is never touched.
    static func coversPage(edition: Edition, halfOpen: Bool, built: Bool = halfOpenBuilt) -> Bool {
        halfOpen && self.halfOpen(edition: edition, built: built)
    }

    /// What a Tell Symphony asked for from outside the app (the Lock Screen control, a
    /// `symphony://tell` link: `AppState.tellRequested`) does on a light page.
    enum Tell: Equatable {
        /// Nothing was asked.
        case none
        /// The walk is showing over the page: the request waits, and is answered when the walk
        /// closes (never under the walk, where a live microphone could not be seen or stopped).
        case wait
        /// The bar is idle: it listens, as a tap on its light would.
        case listen
        /// The bar types (speech refused or missing): the field takes the keyboard.
        case focusField
        /// The bar is already listening: the request is taken and the listen is left alone.
        case leaveAlone
        /// No bar on this page: the old Tell sheet, as the old Today opens it.
        case oldSheet

        /// The request is taken now (cleared, and any sheet over the page closes).
        var takesRequest: Bool { self != .none && self != .wait }
    }

    static func tell(asked: Bool, walkShowing: Bool, barShown: Bool, speechOff: Bool, listening: Bool) -> Tell {
        guard asked else { return .none }
        if walkShowing { return .wait }
        guard barShown else { return .oldSheet }
        if listening { return .leaveAlone }
        return speechOff ? .focusField : .listen
    }

    /// Speech never leaves the phone in a light household, wherever it is heard.
    static func speechOnPhoneOnly(edition: Edition) -> Bool {
        edition == .light
    }

    /// A walk this person left part-way is stored and can be picked back up: Leave for now
    /// stores it as `paused` (the status `WalkPositionStore.hasPausedWalk`, and so
    /// `AppState.walkPaused` and Settings' "Pick the walk back up", read).
    static func walkIsWaiting(_ position: WalkPosition?) -> Bool {
        position?.status == .paused
    }

    /// A walk declined at Welcome with Not now (stored `left`) by someone with no goals at
    /// all, in a light household: Today offers it from the top. It goes as soon as one goal exists.
    static func walkIsOffered(_ position: WalkPosition?, goalCount: Int, edition: Edition) -> Bool {
        edition == .light && position?.status == .left && goalCount == 0
    }

    /// The one quiet line at the top of light Today, if any: `waiting` resumes a walk left
    /// with Leave for now (`DailyCopy.walkWaiting`); `whenReady` starts one declined at
    /// Welcome by someone with no goals (`DailyCopy.walkWhenReady`). Never in a full household.
    enum WalkLine: Equatable { case waiting, whenReady }

    static func walkLine(_ position: WalkPosition?, goalCount: Int, edition: Edition) -> WalkLine? {
        guard edition == .light else { return nil }
        if walkIsWaiting(position) { return .waiting }
        return walkIsOffered(position, goalCount: goalCount, edition: edition) ? .whenReady : nil
    }
}

/// What opens over a light page from beside its bar: Inbox and More, each as a sheet
/// (`AppState.dailyPanel`), since the dock that held them has given way.
enum DailyPanel: String, Identifiable {
    case inbox, more
    var id: String { rawValue }
}
