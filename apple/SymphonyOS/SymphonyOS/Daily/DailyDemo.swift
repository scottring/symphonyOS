#if os(iOS) && DEBUG
import Foundation
import SwiftData

/// Debug only: the light pages' demo, for screenshots (nobody can tap or type in the
/// simulator). `-SymphonyDemo -SymphonyLight -SymphonyDaily` seeds the in-memory store with
/// one of the seeds below instead of the family one, and feeds two sample events to the
/// calendar; `-SymphonyDailyNow YYYY-MM-DD` (`DailyClock`) pins the day.
extension DemoMode {
    /// `-SymphonyDaily`: the light pages' demo seed and events.
    static var isDaily: Bool { ProcessInfo.processInfo.arguments.contains("-SymphonyDaily") }

    static let dailySeeds = ["morning", "done", "open", "newweek", "quiet", "nopiece", "empty"]

    /// `-SymphonyDailySeed morning|done|open|newweek|quiet|nopiece|empty`; `morning` otherwise.
    static var dailySeed: String { dailySeed(in: ProcessInfo.processInfo.arguments) }

    /// `-SymphonyDailyPage today|week|month|season|year`: the page the demo opens on.
    static var dailyPage: Horizon? { dailyPage(in: ProcessInfo.processInfo.arguments) }

    /// `-SymphonyDailyState a,b,…`: states a page is driven into once it is up
    /// (`point`: the sign's row lit; `waiting`: the waiting walk's line, as the demo keeps no stored walk;
    /// `speak` and `undo`: the bar, see `showDaily`; `hear`: the bar's stand-in listener, untapped; `more` and `inbox`: that sheet, `dailyPanel`;
    /// on Week, `select`: a task chosen with its Move to panel up, see `weekChoice`; `unfold`: the fold open;
    /// `select`, `move` and `zoom` on a mountain page, see `showMountain`; `walkdown` with `select`: Walk it
    /// down tapped on that flag; `lookback`: Today's or Week's handle tapped, the sheet lowered over the whole plan).
    static var dailyStates: [String] { dailyStates(in: ProcessInfo.processInfo.arguments) }

    static func dailySeed(in arguments: [String]) -> String {
        value(after: "-SymphonyDailySeed", in: arguments).map { $0.lowercased() }
            .flatMap { dailySeeds.contains($0) ? $0 : nil } ?? "morning"
    }

    static func dailyPage(in arguments: [String]) -> Horizon? {
        value(after: "-SymphonyDailyPage", in: arguments).flatMap { Horizon(rawValue: $0.lowercased()) }
    }

    static func dailyStates(in arguments: [String]) -> [String] {
        guard let list = value(after: "-SymphonyDailyState", in: arguments) else { return [] }
        return list.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
    }

    // MARK: The bar

    /// What the stand-in listener hears, as the speaking board shows it.
    static let dailySpoken = "Call the plumber about the leak"

    /// With `speak` among the states the bar listens through `DemoWalkListener`, which hears
    /// `dailySpoken` as soon as it starts (nobody can speak to this simulator), and with `hear` the
    /// same stand-in waits for a tap or a Tell Symphony (no permission prompt); with `refused`
    /// through one that reports the microphone refused; otherwise nil (the bar's own on-phone listener).
    @MainActor static var dailyListener: WalkListening? { dailyListener(in: ProcessInfo.processInfo.arguments) }

    @MainActor static func dailyListener(in arguments: [String]) -> WalkListening? {
        let states = dailyStates(in: arguments)
        if states.contains("refused") {
            let refused = DemoWalkListener(words: "")
            refused.problem = WalkCopy.speechOff        // as `Dictation` reports a refused microphone
            return refused
        }
        return states.contains("speak") || states.contains("hear") ? DemoWalkListener(words: dailySpoken) : nil
    }

    /// `more` or `inbox` among the states: that sheet opens over the page, as a tap beside the bar opens it.
    static var dailyPanel: DailyPanel? { dailyPanel(in: ProcessInfo.processInfo.arguments) }

    static func dailyPanel(in arguments: [String]) -> DailyPanel? {
        dailyStates(in: arguments).lazy.compactMap(DailyPanel.init(rawValue:)).first
    }

    /// Drives the bar into the states that need a touch, as a person's touch would:
    /// `speak`: a tap on the light, so it listens and hears `dailySpoken`;
    /// `refused`: a tap on the light with the microphone refused, so the bar types, with its line;
    /// `undo`: `dailySpoken` typed and added, so Undo shows.
    @MainActor static func showDaily(_ model: DailyModel, _ states: [String]) {
        for state in states {
            switch state {
            case "speak", "refused":
                model.send(.micTapped)
            case "undo":
                model.send(.typed(dailySpoken))
                model.send(.submitted)
            default:
                break
            }
        }
    }

    /// `select` on Week: the first task on the first day that holds one (on the board's day, the
    /// first thing today), as a tap on its words would choose it; nil when the week holds none.
    static func weekChoice(_ week: DailyWeek.Week) -> (row: DailyDay.Row, day: Date?)? {
        for day in week.days {
            for case .task(let row) in day.lines { return (row, day.date) }
        }
        return nil
    }

    // MARK: The mountain pages

    /// Drives a Month, Season or Year page into the states that need a touch, as a person's taps
    /// would, through the page's own events: `zoom`: on Year a tap on the chosen flag's peak, on
    /// Season and Month a tap on its parent (or the first flag one level up); `select`: a tap on
    /// the first flag of the page's level whose panel has a line (nothing under it), else the
    /// first; `move`: Move to. A bare page is left as it is.
    static func showMountain(_ page: inout MountainPage, _ states: [String]) {
        let own = page.items.filter { $0.level == page.level }
        let bare = own.first { flag in
            var trial = page
            _ = trial.apply(.flag(flag.id))
            return trial.panel?.line != nil
        }
        guard let chosen = bare ?? own.first else { return }
        if states.contains("zoom") {
            if page.level == .year {
                if let area = chosen.areaId { _ = page.apply(.peak(area)) }
            } else if let parent = chosen.parentId
                        ?? page.items.first(where: { $0.level.rawValue == page.level.rawValue - 1 })?.id {
                _ = page.apply(.flag(parent))
            }
        }
        if states.contains("select") { _ = page.apply(.flag(chosen.id)) }
        if states.contains("move") { _ = page.apply(.moveTapped) }
    }

    private static func value(after flag: String, in arguments: [String]) -> String? {
        guard let i = arguments.firstIndex(of: flag), i + 1 < arguments.count else { return nil }
        return arguments[i + 1]
    }

    /// Where a demo remembers the signs put away: a store of its own, emptied once per launch,
    /// so a sign swiped away in one run (a UI test) is there again in the next.
    @MainActor static let signMemory: SignpostMemory = {
        let suite = "com.scottkaufman.symphonyos.demo-signs"
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        return SignpostMemory(defaults: defaults)
    }()

    // MARK: The handover

    /// Where a demo remembers that the handover's line was seen: a store of its own, emptied once
    /// per launch so UI test runs do not depend on each other, unless the launch says
    /// `-SymphonyHandoverRemembers` (a second launch finishing the walk again as the same person).
    @MainActor static let handoverMemory = handoverMemory(in: ProcessInfo.processInfo.arguments,
                                                          suite: "com.scottkaufman.symphonyos.demo-handover")

    static func handoverMemory(in arguments: [String], suite: String) -> HandoverMemory {
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        if !arguments.contains("-SymphonyHandoverRemembers") { defaults.removePersistentDomain(forName: suite) }
        return HandoverMemory(defaults: defaults)
    }

    /// A handover held for a screenshot: `handover`, settled (the halo and the line, the board's
    /// third frame); `travel`, the light halfway down with the sheet still low (its second frame).
    enum HandoverHold: Equatable { case settled, travel(Double) }

    static var handoverHold: HandoverHold? { handoverHold(in: ProcessInfo.processInfo.arguments) }

    static func handoverHold(in arguments: [String]) -> HandoverHold? {
        let states = dailyStates(in: arguments)
        if states.contains("travel") { return .travel(0.5) }
        return states.contains("handover") ? .settled : nil
    }

    // MARK: The seed

    /// Writes a seed as real rows through `WalkWriter`, as `walkPreview` writes the walk's:
    /// Health, Home and People kept; three year goals, two season pieces, three month goals;
    /// today's four tasks (the first thing first, one done), tomorrow's, one four days on (or
    /// on the week's last day if sooner), one with no day, and done tasks on the week's earlier
    /// days. The other seeds change only what their sign needs.
    @MainActor static func seedDaily(_ ctx: ModelContext, seed: String, today now: Date) {
        guard seed != "empty" else { return }
        let today = PlanCalendar.day(now)
        let writer = WalkWriter(context: ctx, userId: userId, periods: WalkPeriods.pick(now: now))
        let areas = WalkLoad.areas((try? ctx.fetch(FetchDescriptor<GoalArea>())) ?? [], me: userId)

        @discardableResult
        func plant(_ level: WalkLevel, _ title: String, _ areaName: String? = nil, under parent: WalkItem? = nil,
                   on day: Date? = nil) -> WalkItem {
            let area = areaName.flatMap { name in areas.first { $0.name == name } }
            if let area { writer.ensureArea(area) }
            let item = WalkItem(id: UUID(), level: level, title: title, areaId: area?.id, parentId: parent?.id, day: day)
            writer.create(item, parent: parent)
            return item
        }

        let strong = plant(.year, "Feel strong again", "Health")
        let bathroom = plant(.year, "Finish the bathroom", "Home")
        let weekends = plant(.year, "More slow weekends together", "People")
        let strength = plant(.season, "Strength twice a week", "Health", under: strong)
        let bathroomSeason = plant(.season, "Bathroom done by February", "Home", under: bathroom)
        if seed == "quiet" {
            // The long words as goals too, for the Month page's cloths. They are filed into the calendar's
            // own month (the walk's month on the 10th; on the 28th the walk has moved on to December), so
            // the month that ends holds something to look back at and "‹Month› ends" shows.
            let sundays = plant(.season, "A slow Sunday every month", "People", under: weekends)
            let thisMonth = WalkWriter(context: ctx, userId: userId,
                                       periods: MountainPage.periods(level: .month, selected: today, today: today, seasons: nil))
            for title in [longTitle, longWord] {
                let area = areas.first { $0.name == "People" }
                let item = WalkItem(id: UUID(), level: .month, title: title, areaId: area?.id, parentId: sundays.id)
                thisMonth.create(item, parent: sundays)
            }
        }
        let gym = plant(.month, "Find a gym that fits", "Health", under: strength)
        let tile = plant(.month, "Pick the tile and pay the deposit", "Home", under: bathroomSeason)
        plant(.month, "Clear out the old vanity", "Home", under: bathroomSeason)

        defer { try? ctx.save() }
        guard seed != "newweek" else { return }

        if seed != "open" {
            let deposit = plant(.week, "Send the contractor the deposit", "Home", under: tile, on: today)
            let tour = plant(.week, "Tour the gym on Main Street", "Health", under: gym, on: today)
            let passport = plant(.week, "Renew the passport", on: today)
            let mum = plant(.week, "Call Mum about Sunday lunch", "People", under: weekends, on: today)
            writer.toggleDone(mum.id)
            if seed == "quiet" {
                plant(.week, longTitle, on: today)
                plant(.week, longWord, on: today)
            }
            if seed == "morning" || seed == "done" { writer.setFirstThing(deposit.id, previous: nil) }
            if seed == "done" { for id in [deposit.id, tour.id, passport.id] { writer.toggleDone(id) } }
        }

        let weekStart = PlanCalendar.weekStart(today)
        let lastDay = PlanCalendar.addDays(weekStart, 6)
        plant(.week, "Choose the tile", "Home", under: tile, on: PlanCalendar.addDays(today, 1))
        plant(.week, "Slow morning, pancakes", "People", under: weekends, on: min(PlanCalendar.addDays(today, 4), lastDay))
        plant(.week, "Measure the bathroom window", "Home", under: tile)

        // Done on the week's earlier days: two on the first, one on each after it.
        let earlier = PlanCalendar.weekDays(weekStart).filter { $0 < today }
        var n = 0
        for (i, day) in earlier.enumerated() {
            for _ in 0..<(i == 0 ? 2 : 1) {
                let done = plant(.week, doneTitles[n % doneTitles.count], on: day)
                writer.toggleDone(done.id)
                n += 1
            }
        }
    }

    private static let doneTitles = ["Book the boiler service", "Return the library books", "Pick up the dry cleaning",
                                     "Water the plants", "Post the birthday card", "Sort the recycling"]

    /// 200 characters: a title that must stay one calm line.
    static let longTitle = "Ring the council about the parking permit for the van, ask whether the old permit can be "
        + "moved to the new address, and find the letter with the reference number before calling them on Monday at eight."

    /// One word of 60 letters.
    static let longWord = "Antidisestablishmentarianismfloccinaucinihilipilificationism"

    // MARK: The calendar

    /// The day the demo's events are placed around: the pinned day, or now.
    static var dailyToday: Date { DailyClock.pinned(in: ProcessInfo.processInfo.arguments) ?? Date() }

    /// Two sample events: today at 3:00 "Bathroom design meeting", two days on at 9:30 "Dentist".
    static func dailyEvents(on date: Date, today: Date = dailyToday) -> [TimelineItem] {
        let day = PlanCalendar.day(date)
        let start = PlanCalendar.day(today)
        func event(_ title: String, _ h: Int, _ m: Int) -> TimelineItem {
            let at = PlanCalendar.calendar.date(bySettingHour: h, minute: m, second: 0, of: day)
            let key = "daily-\(title)-\(PlanCalendar.ymd(day))"
            return TimelineItem(id: key, type: .event, title: title, startTime: at, isAllDay: false, completed: false,
                                context: nil, entityId: UUID(), eventKey: key, endTime: at?.addingTimeInterval(3600))
        }
        if PlanCalendar.sameDay(day, start) { return [event("Bathroom design meeting", 15, 0)] }
        if PlanCalendar.sameDay(day, PlanCalendar.addDays(start, 2)) { return [event("Dentist", 9, 30)] }
        return []
    }
}
#endif
