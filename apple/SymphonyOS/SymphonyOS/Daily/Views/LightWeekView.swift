#if os(iOS)
import SwiftUI
import SwiftData

/// Week on the page, for a light household: a band of the mountain with up to two of this
/// month's goals as small flags, the row of words, and the paper with the week by day (today
/// first, calendar events as quiet lines, the days behind folded to one line, Any day last).
/// A task's circle ticks it; a tap on its words chooses it and raises the Move to panel, whose
/// chips move it or pull it up; every move and pull-up offers Undo. Everything it shows is read
/// by `DailyWeek` and placed by `DailyMetrics`; it only draws, and sends what is touched to the
/// model. The page ignores the safe area: `size` is the whole window, the insets its own.
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
    @State private var chosen: Chosen?
    /// The fold opened: the days behind, then anything still open from earlier weeks.
    @State private var unfolded = false
    /// The Move to panel's top, in the page's space, while it shows.
    @State private var panelTop: CGFloat?
    @State private var frames = DailyRowFrames()
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    private struct Chosen: Equatable {
        let id: UUID
        let day: Date?
    }

    /// The 4 points above the list leave room for a chosen card's halo.
    private static let halo: CGFloat = 4
    /// The day labels' column, and the gap after it (the board's 44 and 8).
    private static let labelWidth: CGFloat = 44, labelGap: CGFloat = 8

    private var weekStart: Date { PlanCalendar.weekStart(appState.selectedDate) }

    var body: some View {
        let week = read()
        let m = metrics
        let low = lookBack.sheet(on: m, safeBottom: safeBottom)
        ZStack(alignment: .topLeading) {
            if low != nil {
                DailyWholePlan(lookBack: $lookBack, goals: goals, tasks: tasks, periods: model.periods,
                               today: model.today, me: userId, size: size)
            } else {
                DailyBand(picture: m.picture, height: m.band.height, veil: 0.97)
            }
            DailyTopShade(solid: m.shadeSolid, height: m.shade)
            if low == nil {
                DailyBandFlags(flags: DailyMetrics.bandFlags(bandGoals, width: size.width, navTop: m.navTop),
                               open: { go(.month) })
            }
            DailyNavRow(current: .week, gap: m.navGap, go: go)
                .frame(width: size.width)
                .offset(y: m.navTop)
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
            if low == nil {
                DailyPaperFade(fade: m.bar.fade, size: size)
                if let chosen { movePanel(chosen, m) }
                DailyBarView(model: model, metrics: m.bar, placeholder: DailyCopy.placeholder(.week, periods: model.periods),
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
            readWalk()
        }
        .onChange(of: appState.walkPaused) { _, _ in readWalk() }
        // A Tell taken while the whole plan shows: the sheet rises first, so the bar that answers is
        // there (a Tell from outside also opens Today, which answers it).
        .onChange(of: appState.tellRequested) { _, asked in
            lookBack.tellArrives(asked: asked, walkShowing: appState.walkShowing)
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
        VStack(alignment: .leading, spacing: 1) {
            Text(week.eyebrow.uppercased())
                .font(DailyPalette.sansMedium(11))
                .tracking(1.5)
                .foregroundStyle(DailyPalette.muted)
            Text(week.range)
                .font(DailyPalette.crimson(27))
                .foregroundStyle(DailyPalette.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(minHeight: 32)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(width: frame.width, height: frame.height, alignment: .leading)
        .offset(x: frame.minX, y: frame.minY)
    }

    /// The list scrolls in its own space from its top to the page's foot, and can be scrolled clear
    /// of the fade, and of the Move to panel while it shows. The row a change touched (Undo showing)
    /// and the chosen row are scrolled clear of what covers them.
    private func list(_ week: DailyWeek.Week, _ m: DailyMetrics) -> some View {
        let halo = Self.halo
        let scroll = CGRect(x: 0, y: m.rowsTop - halo, width: size.width, height: size.height - m.rowsTop + halo)
        let covered = min(m.bar.fade.minY, panelTop ?? .infinity)
        return ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    // A line between groups; the fold's own line stands over the first one under it.
                    let opened = unfolded ? week.past : nil
                    if let past = week.past {
                        fold(past)
                        if let opened {
                            ForEach(Array(opened.days.enumerated()), id: \.element.id) { i, day in
                                dayGroup(day, rule: i > 0, m)
                            }
                            if !opened.earlier.isEmpty { earlierGroup(opened.earlier, rule: !opened.days.isEmpty, m) }
                        }
                    }
                    let above = opened.map { !$0.days.isEmpty || !$0.earlier.isEmpty } ?? false
                    ForEach(Array(week.days.enumerated()), id: \.element.id) { i, day in
                        dayGroup(day, rule: i > 0 || above, m)
                    }
                }
                .padding(.horizontal, m.inset)
                .padding(.top, halo)
                .padding(.bottom, size.height - covered + halo)
            }
            .dailyListFrame(frames)
            .onChange(of: model.reveal) { _, reveal in
                guard let reveal else { return }
                frames.keepInSight(reveal.id, above: m.bar.fade.minY, proxy: proxy, animated: !reduceMotion)
            }
            // The chosen row is kept clear of the panel as the panel comes up, and as another row is chosen.
            .onChange(of: panelTop) { _, top in
                guard let top, let chosen else { return }
                frames.keepInSight(chosen.id, above: top - 6, proxy: proxy, animated: !reduceMotion)
            }
            .onChange(of: chosen) { _, chosen in
                guard let chosen, let top = panelTop else { return }
                frames.keepInSight(chosen.id, above: top - 6, proxy: proxy, animated: !reduceMotion)
            }
        }
        .frame(width: scroll.width, height: scroll.height)
        .offset(y: scroll.minY)
    }

    /// The days behind today as one line: their names, and what was done if anything was.
    private func fold(_ past: DailyWeek.Past) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { unfolded.toggle() }
        } label: {
            HStack {
                Text(past.label)
                Spacer(minLength: 8)
                if let done = past.doneLine { Text(done) }
            }
            .font(DailyPalette.sans(13))
            .foregroundStyle(DailyPalette.muted)
            .lineLimit(1)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, minHeight: DailyMetrics.minTouch)
            .overlay(alignment: .bottom) { Rectangle().fill(DailyPalette.line).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(past.label)
        .accessibilityValue([past.doneLine, unfolded ? DailyCopy.foldOpen : DailyCopy.foldClosed]
            .compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("daily.week.fold")
    }

    /// One day: its label beside its first line, 8 above it and a line between days.
    private func dayGroup(_ day: DailyWeek.Day, rule: Bool, _ m: DailyMetrics) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(day.lines.enumerated()), id: \.element.id) { i, line in
                HStack(spacing: Self.labelGap) {
                    if i == 0 { dayLabel(day) } else { Color.clear.frame(width: Self.labelWidth, height: 1) }
                    lineView(line, day: day.date, m)
                }
            }
        }
        .padding(.top, DailyMetrics.weekDayTop)
        .overlay(alignment: .top) {
            if rule { Rectangle().fill(DailyPalette.line).frame(height: 1).accessibilityHidden(true) }
        }
    }

    /// The rows still open from before this week, under the days behind: the same circle and words,
    /// with no day beside them.
    private func earlierGroup(_ rows: [DailyWeek.Earlier], rule: Bool, _ m: DailyMetrics) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(rows) { earlier in
                HStack(spacing: Self.labelGap) {
                    Color.clear.frame(width: Self.labelWidth, height: 1)
                    taskCard(earlier.row, day: earlier.day, m)
                }
            }
        }
        .padding(.top, DailyMetrics.weekDayTop)
        .overlay(alignment: .top) {
            if rule { Rectangle().fill(DailyPalette.line).frame(height: 1).accessibilityHidden(true) }
        }
    }

    private func dayLabel(_ day: DailyWeek.Day) -> some View {
        let ink = day.isToday ? DailyPalette.rust : DailyPalette.muted
        return VStack(alignment: .leading, spacing: 0) {
            Text(day.label)
                .font(DailyPalette.sansSemiBold(10.5))
                .tracking(1.3)
            Text(day.number)
                .font(DailyPalette.crimson(20))
                .frame(height: 22)
        }
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.leading, 6)
        .frame(width: Self.labelWidth, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func lineView(_ line: DailyWeek.Line, day: Date?, _ m: DailyMetrics) -> some View {
        switch line {
        case let .event(_, time, title):
            HStack(spacing: 10) {
                if !time.isEmpty {
                    Text(time)
                        .font(DailyPalette.crimson(16))
                        .foregroundStyle(DailyPalette.rust)
                }
                Text(title)
                    .font(DailyPalette.sans(14.5))
                    .foregroundStyle(DailyPalette.soft)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.leading, 10)
            .frame(maxWidth: .infinity, minHeight: 30, alignment: .leading)
            .accessibilityElement(children: .combine)
        case .task(let row):
            taskCard(row, day: day, m)
        case .open:
            Text(DailyCopy.open)
                .font(DailyPalette.sans(13))
                .foregroundStyle(DailyPalette.openCircle)
                .padding(.leading, 10)
                .frame(maxWidth: .infinity, minHeight: 34, alignment: .leading)
        }
    }

    /// A task: its circle (44 to the touch, the board's 2 in plus a 40 button) and its words (a tap chooses it, a second lets go), on a
    /// white card with a gold halo while chosen. VoiceOver reads it as one row: activating ticks it,
    /// as on Today, and its actions move it to each day the chips offer or pull it up.
    private func taskCard(_ row: DailyDay.Row, day: Date?, _ m: DailyMetrics) -> some View {
        let isChosen = chosen?.id == row.id
        let chips = DailyWeek.chips(for: day, weekStart: weekStart, today: model.today)
        return HStack(spacing: 2) {
            Button { model.toggle(row) } label: {
                circle(row.done)
                    .frame(width: DailyMetrics.minTouch, height: DailyMetrics.minTouch)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { choose(row, day: day) } label: {
                VStack(alignment: .leading, spacing: 0) {
                    Text(row.title)
                        .font(DailyPalette.sansMedium(15.5))
                        .foregroundStyle(row.done ? DailyPalette.doneInk : DailyPalette.ink)
                        .strikethrough(row.done, color: DailyPalette.strike)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .frame(minHeight: 19)
                    if let goal = row.forGoal { lineage(goal) }
                }
                .frame(maxWidth: .infinity, minHeight: DailyMetrics.minTouch, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.trailing, 4)
        .frame(maxWidth: .infinity, minHeight: m.row)
        .background(RoundedRectangle(cornerRadius: 14).fill(.white))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(DailyPalette.line, lineWidth: 1))
        .overlay {
            if isChosen {
                RoundedRectangle(cornerRadius: 14).inset(by: -3).strokeBorder(DailyPalette.gold, lineWidth: 3)
            }
        }
        .padding(.bottom, m.rowGap)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.rowLabel(row.title, forGoal: row.forGoal))
        .accessibilityValue(row.done ? WalkCopy.rowDone : WalkCopy.rowOpen)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { model.toggle(row) }
        .accessibilityActions {
            ForEach(chips) { chip in
                Button(DailyCopy.moveTo(chip.label)) { move(row.id, to: chip.day) }
            }
            Button(WalkCopy.pullUp) { pullUp(row.id) }
        }
        .dailyRowFrame(row.id, in: frames)
    }

    private func circle(_ done: Bool) -> some View {
        ZStack {
            if done {
                Circle().fill(DailyPalette.green)
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                Circle().strokeBorder(DailyPalette.openCircle, lineWidth: 2)
            }
        }
        .frame(width: 22, height: 22)
    }

    /// "for" in the lineage ink, the goal's name in Crimson Pro green, after a small flag.
    private func lineage(_ goal: String) -> some View {
        var text = AttributedString(WalkCopy.forGoal(goal))
        text.font = DailyPalette.sans(12)
        text.foregroundColor = DailyPalette.lineageInk
        if let range = text.range(of: goal, options: .backwards) {
            text[range].font = DailyPalette.crimson(14)
            text[range].foregroundColor = DailyPalette.green
        }
        return HStack(spacing: 5) {
            DailyFlag(colour: DailyPalette.lineageFlag, poleWidth: 1.4)
                .frame(width: 9, height: 11)
            Text(text)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .frame(minHeight: 15)
    }

    // MARK: Move to

    /// The panel above the bar's line: "MOVE TO", a chip for each other day this week from today
    /// (`DailyWeek.chips`), then the walk's pull-up in rust.
    private func movePanel(_ chosen: Chosen, _ m: DailyMetrics) -> some View {
        let chips = DailyWeek.chips(for: chosen.day, weekStart: weekStart, today: model.today)
        // The panel's foot stands at the top of the bar's line slot (44 high from `line - 18`, as
        // `DailyBarView` draws it), so an Undo there stays in sight.
        let foot = m.bar.line - 18
        return ZStack(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 8) {
                Text(DailyCopy.moveTo.uppercased())
                    .font(DailyPalette.sansSemiBold(11))
                    .tracking(1.3)
                    .foregroundStyle(DailyPalette.muted)
                    .accessibilityAddTraits(.isHeader)
                // Each chip is 44 to the touch round a 36 drawing, so lines touch-to-touch stand 8 apart.
                DailyChipFlow(spacing: 6, lineSpacing: 0) {
                    ForEach(chips) { chip in
                        chipButton(chip.label, fill: DailyPalette.chipFill, line: DailyPalette.chipLine,
                                   ink: DailyPalette.deepGreen, spoken: DailyCopy.moveTo(chip.label)) {
                            move(chosen.id, to: chip.day)
                        }
                    }
                    chipButton(WalkCopy.pullUp, fill: DailyPalette.nextFill, line: DailyPalette.nextLine,
                               ink: DailyPalette.rust, spoken: WalkCopy.pullUp) {
                        pullUp(chosen.id)
                    }
                }
            }
            .padding(EdgeInsets(top: 10, leading: 12, bottom: 8, trailing: 12))
            .frame(width: size.width - 24, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(DailyPalette.line, lineWidth: 1))
            .shadow(color: DailyPalette.navy.opacity(0.16), radius: 11, x: 0, y: 8)
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(DailyRowFrames.space)).minY } action: {
                panelTop = $0
            }
            .onDisappear { panelTop = nil }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("daily.moveTo")
            .offset(x: 12)
        }
        .frame(width: size.width, height: foot, alignment: .bottomLeading)
        .transition(.opacity)
    }

    /// A chip: 36 high on the board, 44 to the touch.
    private func chipButton(_ label: String, fill: Color, line: Color, ink: Color, spoken: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(DailyPalette.sansMedium(14))
                .foregroundStyle(ink)
                .lineLimit(1)
                .padding(.horizontal, 13)
                .frame(minWidth: DailyMetrics.minTouch, minHeight: 36)
                .background(Capsule().fill(fill))
                .overlay(Capsule().strokeBorder(line, lineWidth: 1))
                .frame(minHeight: DailyMetrics.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spoken)
    }

    // MARK: Touches

    /// A tap on a task's words chooses it; a second tap on the same words lets go.
    private func choose(_ row: DailyDay.Row, day: Date?) {
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) {
            chosen = chosen?.id == row.id ? nil : Chosen(id: row.id, day: day)
        }
    }

    /// A chip moves the task and closes the panel; Undo shows.
    private func move(_ id: UUID, to day: Date?) {
        model.move(id, to: day)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { chosen = nil }
    }

    /// The task goes from the week at once (written once its Undo can no longer be used); the panel closes.
    private func pullUp(_ id: UUID) {
        model.pullUp(id, level: .week)
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.18)) { chosen = nil }
    }

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
        // A moment after the page is up, as a tap would come, so the list can scroll the row clear of the panel.
        if states.contains("select"), let pick = DemoMode.weekChoice(week) {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                chosen = Chosen(id: pick.row.id, day: pick.day)
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
