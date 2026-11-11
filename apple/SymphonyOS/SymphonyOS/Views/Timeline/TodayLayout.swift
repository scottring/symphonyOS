import Foundation

/// Which Today the window gets (Scott, 2026-11-11: the iPhone Duo boards).
/// The window's shape and size decide — not the device or its orientation,
/// as Apple's iPhone Duo guidance asks — so a regular iPhone gets the same
/// Today it always had, and the Duo gets one per screen and way of holding it.
enum TodayLayout: Equatable {
    /// A regular iPhone held upright: the full Today in one column.
    case oneColumn
    /// The Duo's outside screen, upright (466×678, the system's bars in a side
    /// column): next up, three quick actions, To do, the whole day on request.
    case glance
    /// A short, wide window (the outside screen held sideways, 678×466; any
    /// phone on its side): next up and the actions | To do.
    case glanceWide
    /// The Duo's inside screen held upright (626×890): the day page fills it,
    /// with the week as a strip that unfolds from its top.
    case dayPage
    /// The Duo's inside screen held sideways (890×626): the open journal —
    /// the week page on the left, the day page on the right.
    case journal

    /// Under this height a window is short: a glance, never a journal.
    static let shortHeight: CGFloat = 520
    /// From this width two things fit side by side.
    static let wideWidth: CGFloat = 600
    /// From this width two whole pages fit.
    static let spreadWidth: CGFloat = 760

    static func decide(width: CGFloat, height: CGFloat, sideBars: Bool) -> TodayLayout {
        guard width > 0, height > 0 else { return .oneColumn }
        if width >= wideWidth && height < shortHeight { return .glanceWide }
        if width >= spreadWidth && width > height { return .journal }
        if width >= wideWidth { return .dayPage }
        return sideBars ? .glance : .oneColumn
    }
}
