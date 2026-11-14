#if DEBUG
import Foundation
import SwiftData
import Auth

/// DEBUG-only demo mode for simulator review: launch with `-SymphonyDemo`.
/// The app runs on an in-memory store seeded with sample content (Alex, Iris,
/// Liam, Mia), signed in as a local stand-in user, with sync OFF — nothing is
/// read from or written to Supabase. Not compiled into release builds.
enum DemoMode {
    static var isOn: Bool { ProcessInfo.processInfo.arguments.contains("-SymphonyDemo") }

    /// `-SymphonyWalk`: open the walk, over a store with nothing seeded.
    static var isWalk: Bool { ProcessInfo.processInfo.arguments.contains("-SymphonyWalk") }

    /// `-SymphonyWalkStep N` (0…6): open the walk at step N over the mockup's preview.
    static var walkStep: Int? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SymphonyWalkStep"), i + 1 < args.count,
              let step = Int(args[i + 1]), (0...6).contains(step) else { return nil }
        return step
    }

    /// `-SymphonyWalkOrb a,b,…`: after the walk opens, drive it into a state for a
    /// screenshot, in order, through the reducer's own events (see `showWalk`).
    static var walkOrb: [String] {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SymphonyWalkOrb"), i + 1 < args.count else { return [] }
        return args[i + 1].split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
    }

    /// `-SymphonyWalkExamples`: the demo walk opens with the example flags on for its step.
    static var walkExamples: Bool { ProcessInfo.processInfo.arguments.contains("-SymphonyWalkExamples") }

    /// `-SymphonyWalkSheet up`: on Look back up, the ending sheet raised (by its handle's own event).
    static var walkSheetUp: Bool {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SymphonyWalkSheet"), i + 1 < args.count else { return false }
        return args[i + 1].lowercased() == "up"
    }

    static let userId = UUID(uuidString: "00000000-0000-4000-8000-00000000D3E0")!

    static var user: User? {
        User(id: userId, appMetadata: [:], userMetadata: [:], aud: "authenticated",
             createdAt: Date(), updatedAt: Date())
    }

    static func container(for types: [any PersistentModel.Type]) -> ModelContainer {
        let container = try! ModelContainer(for: Schema(types), configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        if !isWalk { seed(ModelContext(container)) }
        return container
    }

    static let types: [any PersistentModel.Type] = [
        SymphonyTask.self, Project.self, Routine.self, Contact.self, FamilyMember.self,
        ActionableInstance.self, EventNote.self, WeeklyTemplate.self, Household.self, UserProfile.self,
        SymphonyList.self, SymphonyListItem.self, TaskCommitment.self, TaskFocus.self, Goal.self, GoalArea.self, PendingChange.self,
    ]

    @MainActor static let sharedContainer: ModelContainer = container(for: types)

    /// A sample dinner every night: a recipe to cook from, with a cue.
    static func dinner(on date: Date) -> Dinner? {
        Dinner(id: UUID(), title: "Sheet-Pan Salmon with Sweet Potatoes and Green Beans",
               notes: "Roast double sweet potatoes — half for Wednesday. Kids: plain salmon.",
               imageURL: nil, prepMinutes: 45, sourceURL: URL(string: "https://example.com/salmon"),
               ingredients: ["1 1/4 lb salmon, in 4 fillets", "4 small sweet potatoes, cubed", "12 oz green beans, trimmed",
                             "2 tbsp olive oil", "2 tbsp Dijon", "2 tbsp maple syrup", "1 lemon", "Salt and pepper"],
               instructions: ["Heat the oven to 425°F and line a sheet pan.",
                              "Toss the sweet potatoes with half the olive oil, salt and pepper, and roast 15 minutes.",
                              "Whisk the Dijon and maple syrup together for the glaze.",
                              "Push the sweet potatoes aside, lay in the salmon and green beans, and brush the salmon with the glaze.",
                              "Roast 12–15 minutes, until the salmon flakes.",
                              "Squeeze the lemon over everything and serve."])
    }

    /// Sample calendar events: school drop-off on weekdays, a Monday dentist
    /// visit, Saturday soccer.
    static func events(on date: Date) -> [TimelineItem] {
        let cal = PlanCalendar.calendar
        let day = PlanCalendar.day(date)
        let weekday = cal.component(.weekday, from: day)   // 1 Sun … 7 Sat
        func event(_ title: String, _ h: Int, _ m: Int, minutes: Int = 30) -> TimelineItem {
            let start = cal.date(bySettingHour: h, minute: m, second: 0, of: day)
            return TimelineItem(id: "demo-\(title)-\(PlanCalendar.ymd(day))", type: .event, title: title,
                                startTime: start,
                                isAllDay: false, completed: false, context: nil, entityId: UUID(),
                                eventKey: "demo-\(title)-\(PlanCalendar.ymd(day))",
                                endTime: start?.addingTimeInterval(Double(minutes) * 60))
        }
        var out: [TimelineItem] = []
        if (2...6).contains(weekday) { out.append(event("School drop-off", 8, 0, minutes: 20)) }
        if (2...6).contains(weekday) { out.append(event("Boxing", 9, 0, minutes: 75)) }
        if (2...6).contains(weekday) { out.append(event("Marta", 9, 30, minutes: 120)) }
        if weekday == 2 { out.append(event("Dentist — Mia", 15, 30, minutes: 45)) }
        if weekday == 7 { out.append(event("Soccer — Liam", 9, 0, minutes: 90)) }
        // A few one-offs each month, for the calendar fold's "already claimed".
        switch cal.component(.day, from: day) {
        case 3: out.append(event("Parent-teacher conferences", 17, 0, minutes: 60))
        case 8:
            // All day: kept on the calendar sheet by its date.
            out.append(TimelineItem(id: "demo-picture-day-\(PlanCalendar.ymd(day))", type: .event, title: "Picture day",
                                    startTime: nil, isAllDay: true, completed: false, context: nil, entityId: UUID(),
                                    eventKey: "demo-picture-day-\(PlanCalendar.ymd(day))"))
        case 12: out.append(event("Grandma visits", 12, 0, minutes: 240))
        case 26: out.append(event("Liam turns 9", 15, 0, minutes: 120))
        default: break
        }
        return out
    }

    // MARK: The walk's preview

    /// The mockup's preview at `step` (Walk.dc.html:230-244): Health, Home and People
    /// kept; the script's flags for levels 1…min(step, 5), written as real rows
    /// through `WalkWriter`; on Season the second year goal focused, on Month to
    /// Today the first flag one level up. Each flag hangs under the first flag of its
    /// area one level up. On Today the mockup's first thing repeats the first week
    /// task, so that task is marked rather than duplicated. Nil at Welcome.
    @MainActor static func walkPreview(step: Int, context: ModelContext, now: Date = .now) -> WalkPosition? {
        guard step >= 1 else { return nil }
        let periods = WalkPeriods.pick(now: now)
        let writer = WalkWriter(context: context, userId: userId, periods: periods)
        var s = WalkState()
        s.step = step
        s.areas = WalkLoad.areas((try? context.fetch(FetchDescriptor<GoalArea>())) ?? [], me: userId)
        func area(_ name: String) -> UUID? { s.areas.first { $0.name == name }?.id }
        s.kept = ["Health", "Home", "People"].compactMap(area)

        let script: [(WalkLevel, String, String)] = [
            (.year, "Feel strong again", "Health"), (.year, "Finish the bathroom", "Home"),
            (.year, "More slow weekends together", "People"),
            (.season, "Bathroom done by February", "Home"), (.season, "Lift twice a week", "Health"),
            (.month, "Pick the tile and pay the deposit", "Home"),
            (.week, "Send the contractor the deposit, today", "Home"), (.week, "Choose the tile, Saturday", "Home"),
        ]
        var planted = Set<UUID>()
        for (level, words, areaName) in script where level.rawValue <= min(step, 5) {
            guard let said = WalkWords.said(words, level: level, today: periods.today) else { continue }
            let areaId = area(areaName)
            let parent = s.items.first { $0.level.rawValue == level.rawValue - 1 && $0.areaId == areaId }
            let item = WalkItem(id: UUID(), level: level, title: said.title, areaId: areaId,
                                parentId: parent?.id, day: said.day)
            if let a = s.area(areaId) { writer.ensureArea(a) }
            writer.create(item, parent: parent)
            s.items.append(item)
            s.lastPlanted[level] = item.id
            planted.insert(item.id)
        }
        if step >= 5, let first = s.items(on: .week).first {
            writer.setFirstThing(first.id, previous: nil)
            s.firstThing = first.id
        }
        if (2...5).contains(step), let level = WalkLevel(rawValue: step), let above = WalkLevel(rawValue: step - 1) {
            let parents = s.items(on: above)
            let index = step == 2 ? 1 : 0
            if parents.indices.contains(index) { s.focus[level] = parents[index].id }
        }
        return WalkPosition(s, status: .inProgress, planted: planted, periods: periods, now: now)
    }

    #if os(iOS)
    /// Drives an open walk into the states that need a touch, for screenshots
    /// (nobody can tap or type in this simulator). Every step is a reducer event
    /// or a compass action, as a person's touch would send:
    /// - `ground`: back up from Year onto the ground (the kept peaks).
    /// - `open`: a tap on the light, so the compass points open.
    /// - `hold`: a press held and slid onto the point below (Walk on, or Quick start), hovered.
    /// - `speak`: a hold that reaches speaking; the words come through the model's real
    ///   listening path from `walkListener`, which hears them as soon as it starts.
    /// - `type`: the Type it point: the one-line field, empty.
    /// - `select`: a tap on the newest flag the walk planted on this step (Today: the first thing).
    /// - `undo`: a flag typed and planted, so the Undo pill shows.
    /// - `next`: the Walk on point, so a step is entered as a person arrives on it (Today's calendar line).
    /// With `-SymphonyWalkExamples` the Examples point is chosen first, so the step's example flags show.
    /// With `-SymphonyWalkSheet up` the ending's handle is tapped last, so the sheet stands raised.
    @MainActor static func showWalk(_ model: WalkModel, _ steps: [String]) {
        if walkExamples { model.choose(.examples) }
        for step in steps {
            switch step {
            case "ground":
                if model.state.step == 1, !model.state.ground { model.choose(.back) }
            case "open":
                model.send(.orbDown)
                model.send(.orbUp(heldMs: 0))
            case "hold":
                model.send(.orbDown)
                model.send(.orbMoved(WalkOrb.position(of: .s)))
            case "speak":
                model.send(.orbDown)
                model.send(.orbHeld)
            case "type":
                model.choose(.type)
            case "select":
                let s = model.state
                let id = s.level == .today ? s.firstThing
                    : s.level.flatMap { level in s.items(on: level).last(where: \.mine)?.id }
                if let id { model.send(.bannerTapped(id)) }
            case "undo":
                model.choose(.type)
                model.send(.typeChanged("Two early nights a week"))
                model.send(.typeSubmitted("Two early nights a week"))
            case "next":
                model.choose(.next)
            default:
                break
            }
        }
        if walkSheetUp { model.send(.sheetHandle) }
    }

    /// With `speak` among the `-SymphonyWalkOrb` steps, the demo walk listens through
    /// `DemoWalkListener` (nobody can speak to this simulator); otherwise through the
    /// real `Dictation`.
    @MainActor static var walkListener: WalkListening? {
        walkOrb.contains("speak") ? DemoWalkListener(words: "Pick up the tile samples") : nil
    }
    #endif

    // MARK: Seed

    static func seed(_ ctx: ModelContext) {
        let me = userId
        let today = PlanCalendar.day(Date())
        let ws = PlanCalendar.weekStart(today)
        let cal = PlanCalendar.calendar

        func member(_ name: String, _ initials: String, _ color: String, _ order: Int) -> FamilyMember {
            let m = FamilyMember(userId: me, name: name, initials: initials, color: color, syncStatus: .synced)
            m.displayOrder = order
            ctx.insert(m)
            return m
        }
        let alex = member("Alex", "A", "blue", 0)
        let iris = member("Iris", "I", "pink", 1)
        let liam = member("Liam", "L", "teal", 2)
        let mia = member("Mia", "M", "orange", 3)

        @discardableResult
        func task(_ title: String, _ context: String?, _ who: FamilyMember? = nil, bucket: String = "inbox",
                  on date: Date? = nil, allDay: Bool = true, created: Int = 0) -> SymphonyTask {
            let t = SymphonyTask(userId: me, title: title, scheduledFor: date, context: context, syncStatus: .synced)
            t.bucket = bucket
            t.isAllDay = date != nil && allDay
            t.assignedTo = who?.id
            t.createdAt = Date(timeIntervalSince1970: 1_780_000_000 + Double(created))
            t.lastSyncedAt = Date()
            ctx.insert(t)
            return t
        }
        func commit(_ t: SymphonyTask, _ level: String, _ start: Date, _ status: String = "open") {
            ctx.insert(TaskCommitment(taskId: t.id, level: level, periodStart: start, status: status, syncStatus: .synced))
        }

        // Today
        let passport = task("Renew the passport", "family", alex, bucket: "timed", on: today)
        ctx.insert(TaskFocus(taskId: passport.id, userId: me, date: today, syncStatus: .synced))
        task("Send the quarterly report", "work", alex, bucket: "timed", on: today, created: 1)
        let prep = task("Mia's birthday prep", "family", mia, bucket: "timed",
                        on: cal.date(bySettingHour: 16, minute: 0, second: 0, of: today), allDay: false)
        prep.notes = "Party is Saturday — the cake needs two days' notice."
        for (i, (title, done)) in [("Order the cake", false), ("Wrap the presents", false),
                                   ("Buy candles and napkins", false), ("Confirm the guest list", true)].enumerated() {
            let s = task(title, nil, bucket: "inbox", created: 10 + i)
            s.parentTaskId = prep.id
            s.completed = done
        }

        // Unfinished from yesterday
        task("Return the library books", "family", liam, bucket: "timed", on: PlanCalendar.addDays(today, -1))

        // This week's list (commitments), weekend, and a dated day
        for (i, (title, ctx, who)) in [("Call the plumber about the leak", "family", iris),
                                       ("Order school shoes for Liam", "family", alex),
                                       ("Draft the board update", "work", alex),
                                       ("Book the vet for Pepper", "family", iris)].enumerated() {
            let t = task(title, ctx, who, bucket: "week", created: 100 + i)
            t.weekStart = ws
            commit(t, "week", ws)
        }
        // Deliberately long: titles must stay fully readable on every surface.
        let garage = task("Clean out the garage and take the old paint cans, broken chairs and bike parts to the county drop-off",
                          "family", alex, bucket: "week", created: 110)
        garage.weekStart = ws
        garage.weekendStart = PlanCalendar.weekendSaturday(ofWeek: ws)
        commit(garage, "week", ws)
        let deposit = task("Pay the camp deposit", "family", alex, bucket: "timed", on: PlanCalendar.addDays(ws, 1), created: 111)
        commit(deposit, "week", ws)

        // Last week, still open → review
        let gate = task("Fix the gate latch", "family", alex, bucket: "week", created: 120)
        gate.weekStart = PlanCalendar.addDays(ws, -7)
        commit(gate, "week", PlanCalendar.addDays(ws, -7))

        // Month + season
        let ms = PlanCalendar.monthStart(today)
        let goal = task("Ship the board pack", "work", alex, bucket: "month", created: 130)
        goal.isGoal = true
        commit(goal, "month", ms)
        for (i, title) in ["Book the dentist for Mia", "Plan the fall garden", "Renew car registration"].enumerated() {
            let t = task(title, "family", alex, bucket: "month", created: 131 + i)
            t.monthStart = ms
            commit(t, "month", ms)
        }
        let ss = PlanCalendar.season(containing: today).start
        let sGoal = task("A calmer school morning", "family", nil, bucket: "quarter", created: 140)
        sGoal.isGoal = true
        commit(sGoal, "season", ss)
        let sTask = task("Winterize the sprinklers", "family", alex, bucket: "quarter", created: 141)
        commit(sTask, "season", ss)
        // More of the season, so the month's sheet above reads like a list.
        for (i, title) in ["Plan winter vacation", "Get a babysitter bench", "A chore chart the kids run"].enumerated() {
            let t = task(title, "family", nil, bucket: "quarter", created: 142 + i)
            commit(t, "season", ss)
        }
        let sDone = task("Fix up the kids' rooms", "family", nil, bucket: "quarter", created: 145)
        sDone.completed = true
        commit(sDone, "season", ss, "done")

        // Year goals
        for (i, name) in ["Family dinner four nights a week", "Run a half marathon", "Grow the consulting practice"].enumerated() {
            let g = Goal(id: UUID(), userId: me, name: name, year: PlanCalendar.year(of: today))
            g.sortOrder = i
            ctx.insert(g)
        }
        // Last year: two left open (the Year's sheet above), one done, one let go.
        for (i, (name, status)) in [("Read twenty books together", "active"), ("Paint the porch", "active"),
                                    ("Learn to bake bread", "completed"), ("Start a podcast", "archived")].enumerated() {
            let g = Goal(id: UUID(), userId: me, name: name, year: PlanCalendar.year(of: today) - 1)
            g.status = status
            g.sortOrder = i
            ctx.insert(g)
        }

        // Inbox
        task("Book passport photos", nil, created: 200)
        task("Look into a new dentist for Liam", "family", alex, created: 199)
        task("Reply to the landlord", nil, created: 198)
        task("Idea: family hike in October", "personal", iris, created: 197)

        // Routines
        func routine(_ name: String, _ pattern: RecurrencePattern, time: String? = nil, _ context: String, _ who: FamilyMember?) {
            let r = Routine(userId: me, name: name, recurrencePattern: pattern, syncStatus: .synced)
            r.timeOfDay = time
            r.context = context
            r.assignedTo = who?.id
            ctx.insert(r)
        }
        let todayKey = RoutineRules.weekdayKey(today)
        routine("Take morning meds", RecurrencePattern(type: "weekly", days: [todayKey]), time: "08:30", "personal", alex)
        routine("Water the tomatoes", RecurrencePattern(type: "weekly", days: [todayKey]), "family", liam)
        routine("Piano practice", RecurrencePattern(type: "weekly", days: [todayKey]), "family", liam)
        routine("Mow the lawn", RecurrencePattern(type: "weekly", days: []), "family", alex)
        // Tomorrow: several untimed routines with long names, so Week's
        // "Also due" line must shorten names while keeping "+N more".
        let tomorrowKey = RoutineRules.weekdayKey(PlanCalendar.addDays(today, 1))
        routine("Practice the recital pieces for the autumn concert with the metronome",
                RecurrencePattern(type: "weekly", days: [tomorrowKey]), "family", mia)
        routine("Sort the recycling and take the bins down to the curb",
                RecurrencePattern(type: "weekly", days: [tomorrowKey]), "family", liam)
        routine("Water the front garden beds", RecurrencePattern(type: "weekly", days: [tomorrowKey]), "family", liam)
        routine("Check the bike tires", RecurrencePattern(type: "weekly", days: [tomorrowKey]), "family", alex)

        try? ctx.save()
    }
}
#endif

import SwiftUI

extension View {
    /// In a DEBUG demo launch, swap in the seeded in-memory store. A no-op
    /// otherwise (and always in release builds).
    @ViewBuilder
    func demoContainerIfRequested() -> some View {
        #if DEBUG
        if DemoMode.isOn { self.modelContainer(DemoMode.sharedContainer) } else { self }
        #else
        self
        #endif
    }
}

#if DEBUG && os(iOS)
/// Debug demo only: a listener that hears fixed words the moment it starts, so a
/// screenshot shows them arriving on the rising flag through `WalkModel`'s own path.
@MainActor final class DemoWalkListener: WalkListening {
    let words: String
    var problem: String?
    var onWords: ((String) -> Void)?
    var onEnd: (() -> Void)?

    init(words: String) { self.words = words }

    func start() async { onWords?(words) }
    func finish() { onEnd?() }
    func stop() {}
}
#endif
