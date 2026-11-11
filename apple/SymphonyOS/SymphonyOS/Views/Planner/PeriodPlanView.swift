import SwiftUI
import SwiftData

/// Month, Season and Year, each a sheet of paper in its own words
/// (paper-style horizons, 2026-11-04): one list, then the next ruled line to
/// write on. The sheet above folds out on one edge and this period's calendar
/// on the other, both for reading. Nothing here brings an item down from the
/// sheet above or ties one to it; translating Fall into November is the
/// planning, done in your own words.
struct PeriodPlanView: View {
    enum Level { case month, season, year }

    let level: Level
    var onTitle: () -> Void = {}

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext

    @Query private var tasks: [SymphonyTask]
    @Query private var commitments: [TaskCommitment]
    @Query private var goals: [Goal]
    @Query private var households: [Household]

    enum GoalEdit: Identifiable {
        case existing(Goal)
        var id: String {
            switch self {
            case .existing(let g): g.id.uuidString
            }
        }
    }
    @State private var editing: GoalEdit?

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var date: Date { appState.selectedDate }
    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    private var plan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: [], routines: [], instances: [], goals: goals,
                     userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue, seasons: seasons)
    }

    private var season: PlanCalendar.Season { PlanCalendar.season(containing: date, boundaries: seasons) }

    private var title: String {
        switch level {
        case .month: return date.formatted(.dateTime.month(.wide))
        case .season: return season.name
        case .year: return String(PlanCalendar.year(of: date))
        }
    }

    private var subtitle: String {
        switch level {
        case .month: return date.formatted(.dateTime.month(.wide).year())
        case .season:
            return "\(season.start.formatted(.dateTime.month(.wide).day())) – \(season.lastDay.formatted(.dateTime.month(.wide).day()))"
        case .year: return "The year's goals"
        }
    }

    private var unit: String {
        switch level { case .month: "month"; case .season: "season"; case .year: "year" }
    }

    /// "November", "Fall", "2026": the period's own word.
    private var periodWord: String {
        switch level {
        case .month: return date.formatted(.dateTime.month(.wide))
        case .season: return season.name
        case .year: return String(PlanCalendar.year(of: date))
        }
    }

    private var lens: String? { appState.domainFilter.contextValue }

    var body: some View {
        let plan = plan
        let above = aboveSheet(plan)
        PaperFoldView(horizon: unit, aboveLabel: above.edge, aboveCount: above.rows.count,
                      calendarLabel: "\(periodWord) calendar") {
            header
        } above: {
            SheetAbove(kicker: above.kicker, title: above.title, rows: above.rows, doneCount: above.doneCount,
                       foot: "For reading. Write \(periodWord) in its own words.", empty: above.empty)
        } calendar: {
            calendarSheet
        } sheet: {
            switch level {
            case .year: yearContent(plan)
            case .month: periodContent(plan.sheet(level: "month", start: PlanCalendar.monthStart(date)), level: "month",
                                       start: PlanCalendar.monthStart(date))
            case .season: periodContent(plan.sheet(level: "season", start: season.start), level: "season", start: season.start)
            }
        }
        .background(Color.bgBase.ignoresSafeArea())
        .statusBarScrim()
        // Room for the dock, as on Week and Today: the calendar's edge at the
        // foot of a long sheet scrolls clear of it.
        .safeAreaInset(edge: .bottom, spacing: 0) { Color.clear.frame(height: appState.bottomInset) }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .sheet(item: $editing) { edit in
            switch edit {
            case .existing(let g): GoalEditorSheet(goal: g, year: g.year)
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 0) {
            PlannerHeader(title: title, subtitle: subtitle, onTitle: onTitle) {
                HStack(spacing: 0) {
                    DomainMenu()
                    CircleIconButton(systemImage: "chevron.left", label: "Previous \(unit)") { appState.step(-1, seasons: seasons) }
                    CircleIconButton(systemImage: "chevron.right", label: "Next \(unit)") { appState.step(1, seasons: seasons) }
                    if !appState.showsCurrentPeriod(seasons: seasons) {
                        BackToNowPill(label: "This \(unit)") { appState.goToCurrentPeriod() }
                    }
                    PlannerOptionsMenu()
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 6)
        }
    }

    // MARK: The sheet above (for reading)

    private struct Above {
        var kicker: String
        /// The edge's name ("Fall 2026"); the sheet's title says what it holds ("Fall goals").
        var edge: String
        var title: String
        var rows: [(id: UUID, title: String)]
        var doneCount: Int
        var empty: String
    }

    /// Month reads its season, Season the year, Year last year's open goals
    /// (carrying one in is the Year session's look back, not done here).
    private func aboveSheet(_ plan: PlanSnapshot) -> Above {
        let year = PlanCalendar.year(of: date)
        switch level {
        case .month:
            let s = plan.sheet(level: "season", start: season.start)
            return Above(kicker: "Season · \(Self.range(season.start, season.lastDay))",
                         edge: "\(season.name) \(PlanCalendar.year(of: season.start))", title: "\(season.name) goals",
                         rows: s.open.map { ($0.id, $0.title) }, doneCount: s.doneCount,
                         empty: "No \(season.name) goals yet.")
        case .season:
            return Above(kicker: "Year", edge: String(year), title: "\(year) goals",
                         rows: plan.openYearGoals(year).map { ($0.id, $0.name) }, doneCount: plan.doneYearGoals(year),
                         empty: "No \(year) goals yet.")
        case .year:
            return Above(kicker: "Last year", edge: String(year - 1), title: "\(year - 1) goals",
                         rows: plan.openYearGoals(year - 1).map { ($0.id, $0.name) }, doneCount: plan.doneYearGoals(year - 1),
                         empty: "Nothing left open from \(year - 1).")
        }
    }

    /// This sheet's kicker: "Month · Nov 1 – 30", "Season · Sep 1 – Nov 30", "Year".
    private var sheetKicker: String {
        switch level {
        case .month:
            let start = PlanCalendar.monthStart(date)
            let end = PlanCalendar.addDays(PlanCalendar.calendar.date(byAdding: .month, value: 1, to: start) ?? start, -1)
            return "Month · \(Self.range(start, end))"
        case .season: return "Season · \(Self.range(season.start, season.lastDay))"
        case .year: return "Year"
        }
    }

    /// "Write a November goal", "Write an October goal", "Write a 2026 goal".
    static func writePlaceholder(_ periodWord: String) -> String {
        "Write \(aOrAn(periodWord)) \(periodWord) goal"
    }

    /// The web's aOrAn (ConstellationPage): "an" before a vowel or an 8.
    static func aOrAn(_ word: String) -> String {
        guard let first = word.lowercased().first else { return "a" }
        return "aeiou8".contains(first) ? "an" : "a"
    }

    static func range(_ first: Date, _ last: Date) -> String {
        "\(first.formatted(.dateTime.month(.abbreviated).day())) – \(last.formatted(.dateTime.month(.abbreviated).day()))"
    }

    // MARK: This period's calendar (for reading)

    @ViewBuilder
    private var calendarSheet: some View {
        let cal = PlanCalendar.calendar
        switch level {
        case .month:
            let start = PlanCalendar.monthStart(date)
            CalendarSheet(kicker: "What’s already claimed", title: periodWord, start: start,
                          end: cal.date(byAdding: .month, value: 1, to: start) ?? start)
        case .season:
            CalendarSheet(kicker: "Fixed dates · \(Self.range(season.start, season.lastDay))", title: periodWord,
                          start: season.start, end: season.end)
        case .year:
            let start = cal.date(from: DateComponents(year: PlanCalendar.year(of: date), month: 1, day: 1)) ?? date
            CalendarSheet(kicker: "The 12 months", title: periodWord, start: start,
                          end: cal.date(byAdding: .year, value: 1, to: start) ?? start)
        }
    }

    // MARK: Month / season

    /// The period's own list, in its own words: one list, then the next ruled
    /// line to write on. No verbs that move anything to another list.
    @ViewBuilder
    private func periodContent(_ sheet: PlanSnapshot.Sheet, level: String, start: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetHeading(kicker: sheetKicker, title: "\(periodWord) goals")
            ForEach(sheet.open, id: \.id) { task in SheetLine(task: task) }
            WriteLine(placeholder: Self.writePlaceholder(periodWord)) { text in
                PlanWriter(context: modelContext, userId: userId)
                    .createPeriodTask(title: text, level: level, periodStart: start, context: lens)
            }
            doneLine(sheet.doneCount)
        }
        .padding(.horizontal, 20)
    }

    private func doneLine(_ n: Int) -> some View {
        Group {
            if n > 0 {
                Text("\(n) done").font(.bodySmall).foregroundStyle(Paper.faint).padding(.top, 14)
            }
        }
    }

    // MARK: Year

    @ViewBuilder
    private func yearContent(_ plan: PlanSnapshot) -> some View {
        let year = PlanCalendar.year(of: date)
        VStack(alignment: .leading, spacing: 0) {
            SheetHeading(kicker: sheetKicker, title: "\(periodWord) goals")
            ForEach(plan.openYearGoals(year), id: \.id) { goal in
                Button { editing = .existing(goal) } label: { goalLine(goal) }
                    .buttonStyle(.plain)
                    .accessibilityHint("Edit goal")
            }
            WriteLine(placeholder: Self.writePlaceholder(String(year))) { text in
                PlanWriter(context: modelContext, userId: userId)
                    .createGoal(name: text, notes: nil, context: lens, year: year)
            }
            doneLine(plan.doneYearGoals(year))
        }
        .padding(.horizontal, 20)
    }

    // MARK: Pieces

    private func goalLine(_ goal: Goal) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(goal.name)
                .font(Paper.line)
                .foregroundStyle(Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if goal.context != nil { ContextDot(context: goal.context) }
        }
        .padding(.vertical, 9)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { Rectangle().fill(Paper.rule).frame(height: 1) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Goal: \(goal.name)")
    }

}
