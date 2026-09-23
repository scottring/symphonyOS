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

    static let userId = UUID(uuidString: "00000000-0000-4000-8000-00000000D3E0")!

    static var user: User? {
        User(id: userId, appMetadata: [:], userMetadata: [:], aud: "authenticated",
             createdAt: Date(), updatedAt: Date())
    }

    static func container(for types: [any PersistentModel.Type]) -> ModelContainer {
        let container = try! ModelContainer(for: Schema(types), configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        seed(ModelContext(container))
        return container
    }

    static let types: [any PersistentModel.Type] = [
        SymphonyTask.self, Project.self, Routine.self, Contact.self, FamilyMember.self,
        ActionableInstance.self, EventNote.self, WeeklyTemplate.self, Household.self, UserProfile.self,
        SymphonyList.self, SymphonyListItem.self, TaskCommitment.self, TaskFocus.self, Goal.self, PendingChange.self,
    ]

    @MainActor static let sharedContainer: ModelContainer = container(for: types)

    /// Sample calendar events: school drop-off on weekdays, a Monday dentist
    /// visit, Saturday soccer.
    static func events(on date: Date) -> [TimelineItem] {
        let cal = PlanCalendar.calendar
        let day = PlanCalendar.day(date)
        let weekday = cal.component(.weekday, from: day)   // 1 Sun … 7 Sat
        func event(_ title: String, _ h: Int, _ m: Int) -> TimelineItem {
            TimelineItem(id: "demo-\(title)-\(PlanCalendar.ymd(day))", type: .event, title: title,
                         startTime: cal.date(bySettingHour: h, minute: m, second: 0, of: day),
                         isAllDay: false, completed: false, context: nil, entityId: UUID(),
                         eventKey: "demo-\(title)-\(PlanCalendar.ymd(day))")
        }
        var out: [TimelineItem] = []
        if (2...6).contains(weekday) { out.append(event("School drop-off", 8, 0)) }
        if weekday == 2 { out.append(event("Dentist — Mia", 15, 30)) }
        if weekday == 7 { out.append(event("Soccer — Liam", 9, 0)) }
        return out
    }

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

        // Year goals
        for (i, name) in ["Family dinner four nights a week", "Run a half marathon", "Grow the consulting practice"].enumerated() {
            let g = Goal(id: UUID(), userId: me, name: name, year: PlanCalendar.year(of: today))
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
