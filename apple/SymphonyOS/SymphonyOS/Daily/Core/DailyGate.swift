import Foundation
import CoreGraphics

/// The one place that decides whether a light page shows. A full household, and a mixed
/// one (which `Edition.resolve` makes full), keeps every screen it has today; a light
/// household gets a light page only once it is built. The edition it is handed is
/// `AppState.edition`, read by `Edition.current`: until this sign-in's first pull has
/// finished it is only what was remembered for this person, and with nothing remembered
/// it is full, so an empty store (a fresh install) or another account's household row left
/// on the phone never shows a light page.
enum DailyGate {
    /// Light pages that are built. Tasks 11 and 14 add theirs.
    static let horizons: Set<Horizon> = [.today, .week, .month, .season, .year]
    /// Window shapes the light pages are built for. Tasks 17 and 18 add theirs; never
    /// `.glanceWide`, where a phone on its side keeps the old screens.
    static let layouts: Set<TodayLayout> = [.oneColumn, .glance, .dayPage, .journal]
    /// The add bar is built (Task 9).
    static let barBuilt = true
    /// The light half-open display is built (Task 19).
    static let halfOpenBuilt = true

    /// `phone`: the device is a phone (an iPhone, the Duo among them: `DailyDevice.phone`). Ruling
    /// D17: the light pages are built for the phone only; on an iPad (sideways `.journal`, upright
    /// `.dayPage`, narrow `.oneColumn`) none is, and a light household keeps the old pages and the dock.
    static func shows(_ horizon: Horizon, edition: Edition, layout: TodayLayout, phone: Bool,
                      horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool {
        phone && edition == .light && horizons.contains(horizon) && layouts.contains(layout)
    }

    /// The dock gives way to the bar, only where the bar is built and the page on screen
    /// (`horizon`) is a light page on this window; any other page keeps the dock.
    static func hidesDock(on horizon: Horizon, edition: Edition, layout: TodayLayout, phone: Bool,
                          barBuilt: Bool = barBuilt,
                          horizons: Set<Horizon> = horizons, layouts: Set<TodayLayout> = layouts) -> Bool {
        barBuilt && shows(horizon, edition: edition, layout: layout, phone: phone, horizons: horizons, layouts: layouts)
    }

    /// The light half-open display (and not the old one) for this household, on a phone only (D17).
    static func halfOpen(edition: Edition, phone: Bool, built: Bool = halfOpenBuilt) -> Bool {
        phone && edition == .light && built
    }

    /// The light half-open display is up over the Planner (`halfOpen`: the phone is set down
    /// partly open): a light page under it stays drawn but inert (`dropsPage`), so only the
    /// display's own bar can listen, write or answer a Tell. A full household's page is never touched.
    static func coversPage(edition: Edition, halfOpen: Bool, phone: Bool, built: Bool = halfOpenBuilt) -> Bool {
        halfOpen && self.halfOpen(edition: edition, phone: phone, built: built)
    }

    /// A row's Details, open over a light page, stays open only while the page is not covered: under
    /// the half-open display it closes, so the display, and its bar when it takes a Tell, are seen
    /// rather than a sheet over them. (A task's own words in Details are kept as they are typed.)
    static func keepsDetails(covered: Bool) -> Bool {
        !covered
    }

    /// The light half-open display keeps the screen on only while the phone is set down half open
    /// and someone is signed in; signing out, or opening flat, lets it sleep again.
    static func staysAwake(halfOpen: Bool, signedIn: Bool) -> Bool {
        halfOpen && signedIn
    }

    /// Under the light half-open display (ruling D14) a light page stays as it was, drawn but inert,
    /// so nothing open on it is lost; only the old page (`lightPage` false) is taken away, since its
    /// own Tell sheet cannot be held back without changing it.
    static func dropsPage(covered: Bool, lightPage: Bool) -> Bool {
        covered && !lightPage
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
        /// The light half-open display covers this page: its own bar takes the request, never this one.
        case covered

        /// The request is taken now (cleared, and any sheet over the page closes).
        var takesRequest: Bool { self != .none && self != .wait && self != .covered }
    }

    static func tell(asked: Bool, walkShowing: Bool, barShown: Bool, speechOff: Bool, listening: Bool,
                     covered: Bool = false) -> Tell {
        guard asked else { return .none }
        if covered { return .covered }
        if walkShowing { return .wait }
        guard barShown else { return .oldSheet }
        if listening { return .leaveAlone }
        return speechOff ? .focusField : .listen
    }

    /// Speech never leaves the phone in a light household, wherever it is heard; and while the edition
    /// is not yet known (`known` false: before this sign-in's households rows, with nothing remembered)
    /// it stays on the phone too, since the person may turn out to be light (ruling D25). Only a
    /// household known to be full may use server recognition.
    static func speechOnPhoneOnly(edition: Edition, known: Bool = true) -> Bool {
        !(known && edition == .full)
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

    /// What the light Planner draws for a page the gate shows. Every horizon has one, so a page
    /// the gate lists is never the full Planner under a hidden dock (`LightPlannerView` switches on
    /// this, with no other case). Opened flat (`.journal`), Today and Week are one page, the spread
    /// (`LightSpreadView`): the rest of the week on the left, Today on the right; Month, Season and
    /// Year stay the mountain there too.
    enum Page: Equatable {
        case today, week, spread, mountain(WalkLevel)

        /// Which page frame it is drawn in: Today, Week and the spread share one (moving between them
        /// keeps the bar's Undo); each mountain level is a fresh page of its own.
        var identity: WalkLevel? {
            if case .mountain(let level) = self { level } else { nil }
        }
    }

    static func page(_ horizon: Horizon, layout: TodayLayout) -> Page {
        switch horizon {
        case .today where layout == .journal, .week where layout == .journal: .spread
        case .today: .today
        case .week: .week
        case .month: .mountain(.month)
        case .season: .mountain(.season)
        case .year: .mountain(.year)
        }
    }

    /// The Planner's step as the day turns (`DailyModel.today` changing, or the model made again after
    /// the Planner was away): it runs only where light pages live for this device, a light household
    /// on a phone, on any of its windows (held sideways too, so turning it upright later shows the
    /// right date); on an iPad (ruling D17) or in a full household nothing is touched. It mends the
    /// selected date by ruling D18 (`DailyClock.selected`) from the last day it saw, and records the
    /// new one; the first day seen is only recorded.
    /// The Planner's size to lay the light pages out by (`TodayLayout.decide`), as a new one is
    /// measured. A change that is only the keyboard (it is up, the width is the same, the height only
    /// shorter) is not a new window and is ignored: on the Duo's inside screens it would read a short
    /// wide window (`.glanceWide`), take the light page away with its field, drop the keyboard and
    /// bring the page back. Any other change (the keyboard down, a turn, a fold) is taken.
    /// Whether a change of horizon is a change of page on this window: on the spread Today and Week are
    /// one page, so moving between them lets nothing go (no `.left`: a pending Remove keeps its Undo).
    static func pageChanges(from old: Horizon, to new: Horizon, layout: TodayLayout) -> Bool {
        page(old, layout: layout) != page(new, layout: layout)
    }

    static func plannerSize(measured: CGSize, kept: CGSize, keyboardUp: Bool) -> CGSize {
        let onlyTheKeyboard = keyboardUp && kept != .zero && measured.width == kept.width && measured.height < kept.height
        return onlyTheKeyboard ? kept : measured
    }

    static func dayTurn(selected: Date, lastDay: Date?, today: Date, edition: Edition,
                        phone: Bool) -> (selected: Date, lastDay: Date?) {
        guard phone, edition == .light else { return (selected, lastDay) }
        guard let lastDay else { return (selected, today) }
        return (DailyClock.selected(selected, turnedFrom: lastDay, to: today), today)
    }

    /// The mountain pages: Month, Season and Year are the walk's own mountain at that level
    /// (`MountainPageView`); Week and Today are not.
    static func mountain(_ horizon: Horizon) -> WalkLevel? {
        switch horizon {
        case .year: .year
        case .season: .season
        case .month: .month
        case .week, .today: nil
        }
    }
}

/// What opens over a light page from beside its bar: Inbox and More, each as a sheet
/// (`AppState.dailyPanel`), since the dock that held them has given way.
enum DailyPanel: String, Identifiable {
    case inbox, more
    var id: String { rawValue }
}
