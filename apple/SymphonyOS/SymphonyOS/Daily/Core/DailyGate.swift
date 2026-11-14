import Foundation

/// The one place that decides whether a light page shows. A full household, and any
/// mixed or unknown one (which `Edition.resolve` already makes full), keeps every
/// screen it has today; a light household gets a light page only once it is built.
enum DailyGate {
    /// Light pages that are built. Tasks 8, 11 and 14 add theirs.
    static let horizons: Set<Horizon> = []
    /// Window shapes the light pages are built for. Tasks 17 and 18 add theirs; never
    /// `.glanceWide`, where a phone on its side keeps the old screens.
    static let layouts: Set<TodayLayout> = [.oneColumn]
    /// The add bar is built (Task 9).
    static let barBuilt = false
    /// The light half-open display is built (Task 19).
    static let halfOpenBuilt = false

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
}
