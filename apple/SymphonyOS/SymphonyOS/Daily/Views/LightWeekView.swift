#if os(iOS)
import SwiftUI
import SwiftData

/// Week on the page, for a light household: a band of the mountain with up to two of this
/// month's goals as small flags, the row of words, and the paper with the week by day (today
/// first, calendar events as quiet lines, the days behind folded to one line, Any day last).
/// A task's circle ticks it; a tap on its words chooses it and raises the Move to panel, whose
/// chips move it or pull it up; every move and pull-up offers Undo. Everything it shows is read
/// by `DailyWeek` and placed by `DailyMetrics`; it only draws, and sends what is touched to the
/// model. The page runs from the window's top to its foot within its side edges: `size` is that, the
/// top and foot insets the window's own.
struct LightWeekView: View {
    let model: DailyModel
    let userId: UUID
    let seasons: [SeasonBoundary]?
    let size: CGSize
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let layout: TodayLayout
    /// A word in the row of words, and a band flag (Month).
    let go: (Horizon) -> Void

    @Environment(AppState.self) private var appState
    @Query private var tasks: [SymphonyTask]
    @Query private var goals: [Goal]
    @Query private var focus: [TaskFocus]
    @Query private var commitments: [TaskCommitment]
    @Query private var goalAreas: [GoalArea]
    @State private var calendar = CalendarFeed.shared
    /// This person's stored walk, read whenever the page appears and whenever a walk closes.
    @State private var walkPosition: WalkPosition?
    /// The sheet lowered by its handle over the whole plan, or not.
    @State private var lookBack = DailyLookBack()
    /// The task whose words were tapped, and the day it stands on (nil: Any day, or none).
    @State private var chosen: DailyWeekChoice?
    /// The fold opened: the days behind, then anything still open from earlier weeks.
    @State private var unfolded = false
    /// The Move to panel's top, in the page's space, while it shows.
    @State private var panelTop: CGFloat?
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    private var weekStart: Date { PlanCalendar.weekStart(appState.selectedDate) }

    var body: some View {
        let week = read()
        let m = metrics
        let low = lookBack.sheet(on: m, safeBottom: safeBottom)
        // A cloth's paper over the lowered sheet (F21): nothing under it takes a touch or is read.
        let paper = lookBack.paper(goals: goals, tasks: tasks, periods: model.periods, me: userId)
        ZStack(alignment: .topLeading) {
            if low != nil {
                DailyWholePlan(lookBack: $lookBack, goals: goals, tasks: tasks, periods: model.periods,
                               today: model.today, me: userId, size: size)
                    .allowsHitTesting(paper == nil)
                    .accessibilityHidden(paper != nil)
            } else {
                DailyBand(picture: m.picture, cut: m.weekCut, height: m.band.height, veil: 0.97)
            }
            DailyTopShade(solid: m.shadeSolid, height: m.shade)
            if low == nil {
                DailyBandFlags(flags: DailyMetrics.bandFlags(bandGoals, width: size.width, navTop: m.navTop),
                               open: { go(.month) })
            }
            DailyNavRow(current: .week, gap: m.navGap, go: go)
                .frame(width: size.width)
                .offset(y: m.navTop)
                .accessibilitySortPriority(1)        // read first, before the band's flags under it
            DailySheet(top: low?.sheetTop ?? m.sheetTop, radius: m.sheetRadius, grabber: low?.grabber ?? m.grabber,
                       lookBack: low?.lookBack ?? m.lookBack, onLookBack: handleTapped, label: lookBack.label(on: .week),
                       strip: low?.strip) {
                if let low {
                    header(week, at: low.header)
                } else {
                    header(week, at: m.header)
                    list(week, m)
                }
            }
            .allowsHitTesting(paper == nil)
            .modifier(DailySheetEndsTyping())        // a tap on the sheet, or a scroll, puts the keyboard away (S41)
            .accessibilityHidden(paper != nil)
            if low != nil {
                DailyWholePlanPaper(lookBack: $lookBack, paper: paper, size: size, navTop: m.navTop)
            }
            if low == nil {
                DailyPaperFade(fade: m.bar.fade, size: size)
                if let chosen { movePanel(chosen, m) }
                // The week the page shows, where a task with no day goes ("Add to next week").
                DailyBarView(model: model, metrics: m.bar, placeholder: DailyCopy.weekPlaceholder(weekStart, today: model.today),
                             shortPlaceholder: DailyCopy.weekPlaceholder(weekStart, today: model.today),
                             listening: DailyCopy.listening(.week))
            }
            #if DEBUG
            Color.clear.frame(width: 0, height: 0)
                .onAppear { applyDemoStates(week) }
            #endif
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .background(DailyPalette.sky)
        .coordinateSpace(.named(DailyRowFrames.space))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.week")
        .task(id: calendar.readKey(for: weekStart)) { await calendar.refreshWeek(weekStart) }
        .onAppear {
            model.page = .week
            model.week = weekStart          // the bar reads and files into the week on the page
            readWalk()
        }
        .onChange(of: weekStart) { _, start in model.week = start }
        .onChange(of: appState.walkPaused) { _, _ in readWalk() }
        // A Tell taken while the whole plan shows: the sheet rises first, so the bar that answers is
        // there (a Tell from outside also opens Today, which answers it).
        .onChange(of: appState.tellRequested) { _, asked in
            lookBack.tellArrives(asked: asked, walkShowing: appState.walkShowing, covered: model.covered)
        }
        // The page went away: a pending pull-up is written and its Undo goes (the planner sends the same
        // when the app goes to the background).
        .onDisappear { model.send(.left) }
    }

    // MARK: Reading

    private func read() -> DailyWeek.Week {
        DailyWeek.make(tasks: tasks, goals: goals, commitments: commitments, focus: focus,
                       events: { calendar.items(for: $0) ?? [] }, weekStart: weekStart, today: model.today,
                       me: userId, pulledUp: model.pulledUp)
    }

    private var bandGoals: [Signpost.Named] {
        DailyWeek.bandGoals(tasks: tasks, goals: goals, commitments: commitments, focus: focus,
                            weekStart: weekStart, today: model.today, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp)
    }

    /// Where the walk is saved, as the main view reads it (the demo keeps its own store).
    private var walkStore: WalkPositionStore {
        #if DEBUG
        if DemoMode.isOn { return DemoMode.walkStore }
        #endif
        return WalkPositionStore()
    }

    private func readWalk() { walkPosition = walkStore.load(for: userId) }

    private var metrics: DailyMetrics {
        let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: safeTop, safeBottom: safeBottom,
                                       waiting: false)
        return DailyMetrics.week(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape)
    }

    // MARK: The sheet

    private func header(_ week: DailyWeek.Week, at frame: CGRect) -> some View {
        DailyPageHeader(eyebrow: week.eyebrow, title: week.range, ringColumn: false, frame: frame)
    }

    /// The list scrolls in its own space from its top to the page's foot, and can be scrolled clear
    /// of the fade, and of the Move to panel while it shows. The row a change touched (Undo showing)
    /// and the chosen row are scrolled clear of what covers them.
    private func list(_ week: DailyWeek.Week, _ m: DailyMetrics) -> some View {
        DailyWeekList(model: model, weekStart: weekStart, days: week.days, past: week.past, look: .week,
                      frame: CGRect(x: 0, y: m.rowsTop, width: size.width, height: size.height - m.rowsTop),
                      inset: m.inset, rowHeight: m.row, rowGap: m.rowGap, clearOf: m.bar.fade.minY, panelTop: panelTop,
                      chosen: $chosen, unfolded: $unfolded)
    }

    // MARK: Move to

    /// The panel above the bar's line (`DailyMovePanel`), its foot at the top of the bar's line slot
    /// (44 high from `line - 18`, as `DailyBarView` draws it), so an Undo there stays in sight.
    private func movePanel(_ chosen: DailyWeekChoice, _ m: DailyMetrics) -> some View {
        DailyMovePanel(model: model, weekStart: weekStart, chosen: chosen,
                       frame: CGRect(x: 12, y: 0, width: size.width - 24, height: m.bar.line - 18),
                       picked: $chosen, top: $panelTop)
    }

    // MARK: Touches

    /// The handle lowers the sheet over the whole plan, reading the ridge as it goes, or raises it.
    /// Either way the chosen row and its Move to panel are let go.
    private func handleTapped() {
        chosen = nil
        let ridge = DailyLookBack.ridge(goalAreas, me: userId, saved: walkPosition)
        for event in lookBack.handleTapped(areas: ridge.areas, kept: ridge.kept) { model.send(event) }
    }

    #if DEBUG
    /// `-SymphonyDailyState select`: the first task chosen, its panel up, as a tap on its words would;
    /// `unfold`: the fold open, as a tap on it would; `lookback`: the handle tapped, the whole plan behind.
    private func applyDemoStates(_ week: DailyWeek.Week) {
        guard DemoMode.isOn, !demoStatesApplied else { return }
        demoStatesApplied = true
        let states = DemoMode.dailyStates
        if states.contains("unfold") { unfolded = true }
        if states.contains("lookback") { handleTapped() }
        // `lookbackpaper`: the handle tapped and the year cloth's paper raised over the whole plan.
        if states.contains("lookbackpaper") {
            handleTapped()
            lookBack.tap(.lookBackPaper(.year))
        }
        // `nextweek`: the page on next week, as the "Tomorrow" sign opens it on the week's last day;
        // with `undo`, a moment later one task said there with no day (`DemoMode.showDaily`).
        if states.contains("nextweek") {
            appState.selectedDate = PlanCalendar.addDays(PlanCalendar.weekStart(model.today), 7)
            if states.contains("undo") {
                Task { @MainActor in
                    try? await Task.sleep(for: .milliseconds(800))
                    DemoMode.showDaily(model, ["undo"])
                }
            }
        }
        // A moment after the page is up, as a tap would come, so the list can scroll the row clear of the panel.
        if states.contains("select"), let pick = DemoMode.weekChoice(week) {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                chosen = DailyWeekChoice(id: pick.row.id, title: pick.row.title, day: pick.day)
            }
        }
    }
    #endif
}

/// Chips laid out in lines, as many to a line as fit, the next line under it.
struct DailyChipFlow: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let lines = arrange(subviews, width: width)
        let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(0, lines.count - 1))
        let used = lines.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? used, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for line in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for i in line.items {
                let s = subviews[i].sizeThatFits(.unspecified)
                subviews[i].place(at: CGPoint(x: x, y: y + (line.height - s.height) / 2), proposal: ProposedViewSize(s))
                x += s.width + spacing
            }
            y += line.height + lineSpacing
        }
    }

    private struct Line { var items: [Int] = []; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Line] {
        var lines: [Line] = [Line()]
        for i in subviews.indices {
            let s = subviews[i].sizeThatFits(.unspecified)
            if let last = lines.last, !last.items.isEmpty, last.width + spacing + s.width > width { lines.append(Line()) }
            var line = lines.removeLast()
            line.width += (line.items.isEmpty ? 0 : spacing) + s.width
            line.height = max(line.height, s.height)
            line.items.append(i)
            lines.append(line)
        }
        return lines.filter { !$0.items.isEmpty }
    }
}
#endif
