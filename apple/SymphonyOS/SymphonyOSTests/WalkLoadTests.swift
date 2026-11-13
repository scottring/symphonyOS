import Testing
import Foundation
import SwiftData
@testable import Symphony

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

// Reading the plan back: exactly what WalkWriter writes, shown to the walk.
@MainActor
struct WalkLoadTests {
    let me = UUID()
    let other = UUID()
    let periods = WalkPeriods.pick(now: day(2026, 11, 13), weekStartsOn: 0)

    private func makeContext() throws -> ModelContext {
        let container = try ModelContainer(
            for: SymphonyTask.self, Goal.self, GoalArea.self, TaskCommitment.self, TaskFocus.self,
            PendingChange.self, Routine.self, ActionableInstance.self, FamilyMember.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return ModelContext(container)
    }

    private func all(_ ctx: ModelContext) -> (goals: [Goal], tasks: [SymphonyTask]) {
        ((try? ctx.fetch(FetchDescriptor<Goal>())) ?? [], (try? ctx.fetch(FetchDescriptor<SymphonyTask>())) ?? [])
    }

    private func item(_ level: WalkLevel, _ title: String, area: UUID? = nil, day: Date? = nil) -> WalkItem {
        WalkItem(id: UUID(), level: level, title: title, areaId: area, parentId: nil, day: day)
    }

    private func task(_ title: String, user: UUID? = nil) -> SymphonyTask {
        SymphonyTask(id: UUID(), userId: user ?? me, title: title, completed: false, scheduledFor: nil,
                     context: "personal", notes: nil)
    }

    @Test func sixDefaultsThenMyOwn() {
        let none = WalkLoad.areas([], me: me)
        #expect(none.map(\.name) == WalkClassifier.defaults)
        #expect(Set(none.map(\.id)).count == 6)

        let rows = [GoalArea(userId: me, name: "Learning", sortOrder: 5, context: "personal"),
                    GoalArea(userId: me, name: "Faith", sortOrder: 2, context: "personal")]
        #expect(WalkLoad.areas(rows, me: me).map(\.name) == WalkClassifier.defaults + ["Faith", "Learning"])

        let many = (0..<5).map { GoalArea(userId: me, name: "Extra \($0)", sortOrder: $0, context: "personal") }
        let capped = WalkLoad.areas(many, me: me)
        #expect(capped.count == WalkLoad.maxAreas)
        #expect(capped.last?.name == "Extra 1")
    }

    @Test func anExistingAreaIsReusedByName() {
        let health = GoalArea(userId: me, name: " health ", context: "personal")
        let work = GoalArea(userId: me, name: "Work", context: "work")
        let home = GoalArea(userId: other, name: "Home", context: "family")
        let areas = WalkLoad.areas([health, work, home], me: me)
        #expect(areas.first { $0.name == "Health" }?.id == health.id)
        #expect(areas.first { $0.name == "Work" }?.id != work.id)
        #expect(areas.first { $0.name == "Home" }?.id != home.id)
        #expect(!areas.contains { $0.id == home.id || $0.id == work.id })
    }

    @Test func onlyPlantedRowsAreMine() throws {
        let ctx = try makeContext()
        let w = WalkWriter(context: ctx, userId: me, periods: periods)
        let mineItem = item(.year, "Feel strong again")
        w.create(mineItem, parent: nil)
        let theirs = Goal(id: UUID(), userId: me, name: "Old plan", year: periods.year)
        theirs.context = "personal"
        let family = Goal(id: UUID(), userId: me, name: "Family trip", year: periods.year)
        family.context = "family"
        let archived = Goal(id: UUID(), userId: me, name: "Archived", year: periods.year)
        archived.status = "archived"
        let old = Goal(id: UUID(), userId: me, name: "2026", year: 2026)
        let partner = Goal(id: UUID(), userId: other, name: "Partner", year: periods.year)
        for g in [theirs, family, archived, old, partner] { ctx.insert(g) }
        try ctx.save()

        let (g, t) = all(ctx)
        let items = WalkLoad.items(goals: g, tasks: t, periods: periods, me: me, planted: [mineItem.id])
        #expect(Set(items.map(\.title)) == ["Feel strong again", "Old plan"])
        #expect(items.first { $0.title == "Feel strong again" }?.mine == true)
        #expect(items.first { $0.title == "Old plan" }?.mine == false)
    }

    @Test func eachLevelComesFromItsPeriod() throws {
        let ctx = try makeContext()
        let w = WalkWriter(context: ctx, userId: me, periods: periods)
        let year = item(.year, "Strong"), season = item(.season, "Winter run"), month = item(.month, "Run twice")
        let week = item(.week, "Buy shoes", day: day(2026, 11, 14))
        w.create(year, parent: nil)
        w.create(season, parent: year)
        w.create(month, parent: season)
        w.create(week, parent: month)
        // Stray rows
        let oldSeason = task("Autumn thing"); oldSeason.bucket = "quarter"
        oldSeason.seasonStart = day(2026, 9, 1)
        let letGo = task("Let go"); letGo.sourceId = month.id; letGo.scheduledFor = day(2026, 11, 14)
        letGo.dismissedAt = Date()
        let unlinked = task("Other to-do"); unlinked.scheduledFor = day(2026, 11, 14)
        for t in [oldSeason, letGo, unlinked] { ctx.insert(t) }
        try ctx.save()

        let (g, t) = all(ctx)
        let items = WalkLoad.items(goals: g, tasks: t, periods: periods, me: me,
                                   planted: [year.id, season.id, month.id, week.id])
        #expect(items.map(\.title) == ["Strong", "Winter run", "Run twice", "Buy shoes"])
        #expect(items.map(\.level) == [.year, .season, .month, .week])
        #expect(items.map(\.parentId) == [nil, year.id, season.id, month.id])

        // Not planted, but linked to a shown month item: a week task still loads.
        let linked = task("Linked"); linked.sourceId = month.id; linked.scheduledFor = day(2026, 11, 14)
        ctx.insert(linked); try ctx.save()
        let (g2, t2) = all(ctx)
        let again = WalkLoad.items(goals: g2, tasks: t2, periods: periods, me: me, planted: [])
        #expect(again.contains { $0.title == "Linked" && !$0.mine })
        #expect(again.first { $0.title == "Buy shoes" }?.mine == false)
        let stray = task("Stray"); stray.scheduledFor = day(2026, 11, 14)
        ctx.insert(stray); try ctx.save()
        let (g3, t3) = all(ctx)
        #expect(!WalkLoad.items(goals: g3, tasks: t3, periods: periods, me: me, planted: []).contains { $0.title == "Stray" })
    }

    @Test func aTaskSaidForNextWeekIsStillThere() throws {
        let ctx = try makeContext()
        let w = WalkWriter(context: ctx, userId: me, periods: periods)
        let year = item(.year, "Strong"), season = item(.season, "S"), month = item(.month, "M")
        let nextTue = item(.week, "Tuesday thing", day: day(2026, 11, 17))
        w.create(year, parent: nil); w.create(season, parent: year); w.create(month, parent: season)
        w.create(nextTue, parent: month)
        let linked = task("Linked"); linked.sourceId = month.id; linked.scheduledFor = day(2026, 11, 18)
        let tooLate = task("Too late"); tooLate.sourceId = month.id; tooLate.scheduledFor = day(2026, 11, 22)
        let undated = task("Undated"); undated.sourceId = month.id; undated.weekStart = day(2026, 11, 15)
        for t in [linked, tooLate, undated] { ctx.insert(t) }
        try ctx.save()

        let (g, t) = all(ctx)
        let items = WalkLoad.items(goals: g, tasks: t, periods: periods, me: me,
                                   planted: [year.id, season.id, month.id, nextTue.id])
        let weeks = items.filter { $0.level == .week }
        #expect(weeks.first { $0.title == "Tuesday thing" }?.day == day(2026, 11, 17))
        #expect(weeks.contains { $0.title == "Linked" })
        #expect(!weeks.contains { $0.title == "Too late" })
        #expect(!weeks.contains { $0.title == "Undated" })
    }

    @Test func parentsResolveOrAreNil() {
        let year = Goal(id: UUID(), userId: me, name: "Y", year: periods.year)
        year.context = "personal"
        let season = task("S"); season.bucket = "quarter"; season.seasonStart = periods.season.start
        season.goalId = year.id
        let viaSource = task("M1"); viaSource.bucket = "month"; viaSource.monthStart = periods.monthStart
        viaSource.sourceId = season.id
        let viaGoalTask = task("M2"); viaGoalTask.bucket = "month"; viaGoalTask.monthStart = periods.monthStart
        viaGoalTask.goalTaskId = season.id
        let dangling = task("M3"); dangling.bucket = "month"; dangling.monthStart = periods.monthStart
        dangling.sourceId = UUID()
        let items = WalkLoad.items(goals: [year], tasks: [season, viaSource, viaGoalTask, dangling],
                                   periods: periods, me: me, planted: [])
        func parent(_ title: String) -> UUID? { items.first { $0.title == title }?.parentId }
        #expect(parent("S") == year.id)
        #expect(parent("M1") == season.id)
        #expect(parent("M2") == season.id)
        #expect(parent("M3") == nil)
    }

    @Test func forWalksUp() {
        let goal = Goal(id: UUID(), userId: me, name: "Feel strong again", year: 2027)
        let season = task("Season"); season.goalId = goal.id
        let month = task("Month"); month.sourceId = season.id
        let week = task("Week"); week.sourceId = month.id
        let tasks = [season, month, week]
        #expect(WalkEnding.forGoal(week, tasks: tasks, goals: [goal]) == "Feel strong again")

        let bare = task("Bare season")
        let m2 = task("M2"); m2.sourceId = bare.id
        let w2 = task("W2"); w2.sourceId = m2.id
        #expect(WalkEnding.forGoal(w2, tasks: [bare, m2, w2], goals: [goal]) == "Bare season")

        let loner = task("Loner")
        #expect(WalkEnding.forGoal(loner, tasks: [loner], goals: [goal]) == nil)

        let selfie = task("Self"); selfie.sourceId = selfie.id
        #expect(WalkEnding.forGoal(selfie, tasks: [selfie], goals: [goal]) == nil)

        let a = task("A"), b = task("B")
        a.sourceId = b.id; b.sourceId = a.id
        #expect(WalkEnding.forGoal(a, tasks: [a, b], goals: []) == "B")
    }

    @Test func todaysRowsFirstThingFirst() throws {
        let today = periods.today
        let a = task("A"), b = task("B"), c = task("C")
        for (i, t) in [a, b, c].enumerated() {
            t.scheduledFor = today
            t.createdAt = Date(timeIntervalSince1970: Double(i))
        }
        let theirs = task("Theirs", user: other); theirs.scheduledFor = today
        let fam = task("Family"); fam.context = "family"; fam.scheduledFor = today
        let tomorrow = task("Tomorrow"); tomorrow.scheduledFor = PlanCalendar.addDays(today, 1)
        let rows = WalkEnding.rows(tasks: [a, b, c, theirs, fam, tomorrow], goals: [], today: today, me: me,
                                   firstThing: c.id)
        #expect(rows.map(\.title) == ["C", "A", "B"])
        #expect(rows.map(\.first) == [true, false, false])
        #expect(rows.first?.id == c.id)
    }

    @Test func theNextGoalWithNothingUnderIt() {
        let y1 = item(.year, "One"), y2 = item(.year, "Two"), y3 = item(.year, "Three")
        var s = item(.season, "S"); s.parentId = y1.id
        #expect(WalkEnding.nextToWalk([y1, y2, y3, s])?.id == y2.id)
        var s2 = item(.season, "S2"); s2.parentId = y2.id
        var s3 = item(.season, "S3"); s3.parentId = y3.id
        #expect(WalkEnding.nextToWalk([y1, y2, y3, s, s2, s3]) == nil)
    }
}
