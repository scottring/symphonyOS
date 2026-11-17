import Foundation
import SwiftData

/// A walk down from a light page: "Walk it down" on a Month, Season or Year flag, or the
/// "A new week" and "No piece this <season> yet" signs on Today. It opens the walk one level
/// below the goal, about it (`MountainPage.walkDown`), ahead of any other walk, and is asked
/// for through `AppState.walkDown`.
///
/// It is never stored (pre-flight ruling 9): it runs with no position store, so it cannot
/// become a waiting walk and cannot replace one, and "Leave for now" in it simply closes it.
/// However it ends, it returns to the page and the date it was started from. What it added stays.
struct DailyWalkDown: Equatable {
    /// The person it was asked for; anyone else signed in by the time it would open drops it.
    let userId: UUID
    /// Where it opens: a quick walk in progress, one level below the goal, already taught.
    let position: WalkPosition
    /// The page it was started from, and that page's date.
    let from: Horizon
    let date: Date
    /// The household's season boundaries, which the walk reads its periods with.
    let seasons: [SeasonBoundary]?
    /// The periods it plans in: the walk's own (nil), or those the flag's own period asks for
    /// (`DailyPeriods.walking`: a goal of the period that holds today walks down into today's).
    var periods: WalkPeriods? = nil

    /// Where the person is once it is over, however it ends: the page it was started from, on its
    /// date. A walk-down from a sign on Today returns to the day it was asked on (`sign(...)`'s
    /// `now`), never to a date the app was last pointed at.
    var returnsTo: (horizon: Horizon, date: Date) { (from, date) }

    /// A Tell asked while it was up (it waited, `DailyGate.tell`) is answered only when it returns to
    /// Today, whose bar takes it as the walk closes. Returning to Week or a mountain page it is
    /// dropped there, so it never opens the microphone later, on some other visit to Today.
    var keepsTell: Bool { from == .today }

    /// Asking for it lets the page's bar go at once (`.left`: it stops listening), as lowering
    /// the sheet does, so nothing the bar hears is taken while the walk opens over it.
    var bar: [DailyBar.Event] { [.left] }

    // MARK: Asked for

    /// From a mountain page's flag: walked down in the walk's own `periods` over the walk's
    /// flags, with the page's ridge and the saved walk's kept areas. Nil for a flag the page
    /// does not offer it on (`MountainPage.canWalkDown`: only a goal of the walk's own periods).
    static func page(_ page: MountainPage, flag id: UUID, from horizon: Horizon, date: Date, periods: WalkPeriods,
                     now: Date, seasons: [SeasonBoundary]?, userId: UUID) -> DailyWalkDown? {
        guard let item = page.walkItems.first(where: { $0.id == id }),
              MountainPage.canWalkDown(item, in: page.walkItems) else { return nil }
        let position = MountainPage.walkDown(item, items: page.walkItems, areas: page.areas, kept: page.saved,
                                             periods: periods, now: now)
        return DailyWalkDown(userId: userId, position: position, from: horizon, date: date, seasons: seasons,
                             periods: periods)
    }

    /// From a sign on Today (`Signpost.Target.walkDown`): the goal it names among the walk's own
    /// flags for `periods`, read from the person's own personal rows, on the ridge as the
    /// mountain pages read it (`MountainPage.areas`, with the saved walk's ids). It returns to
    /// Today on `now`'s day. Nil for any other target, or a goal that is not one of the walk's at that level.
    static func sign(_ target: Signpost.Target, goals: [Goal], tasks: [SymphonyTask], areaRows: [GoalArea],
                     saved: WalkPosition?, periods: WalkPeriods, now: Date,
                     seasons: [SeasonBoundary]?, me: UUID) -> DailyWalkDown? {
        guard case .walkDown(let id, let level) = target else { return nil }
        let areas = MountainPage.areas(areaRows, me: me, saved: saved?.areas ?? [])
        let items = WalkLoad.items(goals: goals, tasks: DailyDay.mine(tasks, me: me), periods: periods, me: me,
                                   planted: [], areas: areas)
        guard let item = items.first(where: { $0.id == id && $0.level == level }),
              MountainPage.canWalkDown(item, in: items) else { return nil }
        let kept = MountainPage.kept(items: [], areas: areas, saved: saved?.kept ?? [], savedAreas: saved?.areas ?? [])
        let position = MountainPage.walkDown(item, items: items, areas: areas, kept: kept, periods: periods, now: now)
        return DailyWalkDown(userId: me, position: position, from: .today, date: PlanCalendar.day(now),
                             seasons: seasons, periods: periods)
    }

    /// Whether following `sign` puts it away for the day: as `putAwayWhenFollowed` says, except
    /// that a sign that walks a goal down is put away only when its walk-down could be built
    /// (`walkDown`), so a sign that took you nowhere stays.
    static func putsAway(_ sign: Signpost.Sign, walkDown: DailyWalkDown?) -> Bool {
        guard sign.putAwayWhenFollowed else { return false }
        if case .walkDown = sign.target { return walkDown != nil }
        return true
    }

    // MARK: Opened

    enum Decision: Equatable { case none, open(DailyWalkDown), drop }

    /// Asked each time the main view decides about the walk, before `WalkEntry.decide`. It opens
    /// in a light household, for the person who asked, while no walk is up; anything else drops
    /// it, so it never waits behind another walk and never opens later by itself, and a full
    /// household never opens one.
    static func decide(_ request: DailyWalkDown?, walkUp: Bool, userId: UUID?, edition: Edition) -> Decision {
        guard let request else { return .none }
        guard !walkUp, edition == .light, request.userId == userId else { return .drop }
        return .open(request)
    }
}

#if os(iOS)
extension DailyWalkDown {
    /// The walk it opens: resumed at `position`, light, and given no position store, so nothing
    /// of it is ever saved. The walk's own controls are as they are; Leave for now ends it with
    /// `.paused`, which, saved nowhere, simply closes it. `now` is the clock every walk reads
    /// (the main view takes a walk down when its day has turned by it).
    @MainActor func model(context: ModelContext, now: Date = .now, scheduler: WalkScheduling? = nil,
                          listener: WalkListening? = nil, sound: WalkSoundPlaying? = nil,
                          suggester: WalkSuggesting? = nil) -> WalkModel {
        WalkModel(context: context, userId: userId, entry: .resume, position: position, edition: .light, now: now,
                  seasons: seasons, periods: periods, store: nil, scheduler: scheduler, listener: listener, sound: sound,
                  suggester: suggester)
    }
}
#endif
