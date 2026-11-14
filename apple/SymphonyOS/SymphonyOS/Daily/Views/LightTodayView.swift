#if os(iOS)
import SwiftUI
import SwiftData

/// Today on the page, for a light household: a band of the mountain, the row of words,
/// the signpost, and the paper with the date, the ring, the next event and today's rows,
/// each saying what it is for. Everything it shows is read by `DailyTodayPage` and placed
/// by `DailyMetrics`; it only draws, and sends what is touched to the model. The page
/// ignores the safe area: `size` is the whole window and the insets are the window's own.
struct LightTodayView: View {
    let model: DailyModel
    let userId: UUID
    let seasons: [SeasonBoundary]?
    let size: CGSize
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let layout: TodayLayout
    /// A word in the row of words.
    let go: (Horizon) -> Void
    /// A page on a date: where a sign leads.
    let open: (Horizon, Date) -> Void

    @Environment(AppState.self) private var appState
    @Query private var tasks: [SymphonyTask]
    @Query private var goals: [Goal]
    @Query private var focus: [TaskFocus]
    @Query private var commitments: [TaskCommitment]
    @Query private var instances: [ActionableInstance]
    @State private var calendar = CalendarFeed.shared
    /// This person's stored walk, read whenever the page appears and whenever a walk closes.
    @State private var walkPosition: WalkPosition?
    /// A row's Details, open in the task's own screen.
    @State private var opened: TimelineItem?
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    var body: some View {
        // Read again each minute, so an event that has started gives way to the next.
        TimelineView(.everyMinute) { _ in
            let page = read(now: DailyClock.now())
            let line = walkLine
            let m = metrics(waiting: line != nil)
            ZStack(alignment: .topLeading) {
                DailyBand(picture: m.picture, height: m.band.height)
                DailyNavRow(current: .today, gap: m.navGap, go: go)
                    .frame(width: size.width)
                    .offset(y: m.navTop)
                if let sign = page.sign, m.sign != .none {
                    SignpostView(sign: sign, metrics: m.sign, tap: { follow(sign) },
                                 putAway: { model.dismiss(sign.kind) })
                }
                DailySheet(top: m.sheetTop, radius: m.sheetRadius, lookBack: m.lookBack,
                           onLookBack: {}) {    // Task 15 wires the whole plan
                    sheet(page, m, line: line)
                }
                fade(m)
                DailyBarView(model: model, metrics: m.bar, placeholder: DailyCopy.placeholder(.today, periods: model.periods),
                             listening: DailyCopy.listening(.today))
                #if DEBUG
                Color.clear.frame(width: 0, height: 0)
                    .onAppear { applyDemoStates(page) }
                #endif
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .background(DailyPalette.sky)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.today")
        .sheet(item: $opened) { item in OpenedItemSheet(item: item, date: model.today, userId: userId) }
        .task(id: calendar.readKey(for: model.today)) { await calendar.refresh(model.today, maxAge: 60) }
        .onAppear {
            readWalk()
            answerTell()
        }
        // The Lock Screen's Tell Symphony control or a `symphony://tell` link: the bar listens, no sheet.
        .onChange(of: appState.tellRequested) { _, _ in answerTell() }
        // A walk that ends lands on Today (`goToToday`) and says whether one is left waiting.
        .onChange(of: appState.walkPaused) { _, _ in readWalk() }
        .onChange(of: appState.selectedDate) { _, _ in readWalk() }
        .onChange(of: goals.count) { _, _ in readWalk() }
    }

    // MARK: Reading

    private func read(now: Date) -> DailyTodayPage {
        DailyTodayPage.read(tasks: tasks, goals: goals, focus: focus, commitments: commitments,
                            events: calendar.items(for: model.today) ?? [], instances: instances,
                            today: model.today, now: now, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp, dismissed: model.dismissed)
    }

    private var walkLine: DailyGate.WalkLine? {
        #if DEBUG
        if DemoMode.isOn, DemoMode.dailyStates.contains("waiting") { return .waiting }
        #endif
        return DailyGate.walkLine(walkPosition, goalCount: goals.count, edition: appState.edition)
    }

    /// Where the walk is saved, as the main view reads it (the demo keeps its own store).
    private var walkStore: WalkPositionStore {
        #if DEBUG
        if DemoMode.isOn { return DemoMode.walkStore }
        #endif
        return WalkPositionStore()
    }

    private func readWalk() { walkPosition = walkStore.load(for: userId) }

    private func metrics(waiting: Bool) -> DailyMetrics {
        let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: safeTop, safeBottom: safeBottom,
                                       waiting: waiting)
        return DailyMetrics.today(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape, waiting: waiting)
    }

    // MARK: The sheet

    @ViewBuilder
    private func sheet(_ page: DailyTodayPage, _ m: DailyMetrics, line: DailyGate.WalkLine?) -> some View {
        if let line, let frame = m.waiting { walkButton(line, frame) }
        header(page, m)
        if let next = page.next {
            DailyNextCard(next: next)
                .frame(width: m.card.width, height: m.card.height)
                .offset(x: m.card.minX, y: m.card.minY)
        }
        let top = page.next == nil ? m.rowsTopNoCard : m.rowsTop
        if page.rows.isEmpty {
            Text(WalkCopy.nothingToday)
                .font(DailyPalette.crimson(19))
                .foregroundStyle(DailyPalette.soft)
                .frame(width: size.width - 2 * m.inset - 12, alignment: .leading)
                .offset(x: m.inset + 6, y: top + 6)
        } else {
            rows(page, m, top: top)
        }
    }

    private func header(_ page: DailyTodayPage, _ m: DailyMetrics) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(DailyCopy.today.uppercased())
                    .font(DailyPalette.sansMedium(11))
                    .tracking(1.5)
                    .foregroundStyle(DailyPalette.muted)
                Text(DailyCopy.date(model.today))
                    .font(DailyPalette.crimson(27))
                    .foregroundStyle(DailyPalette.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minHeight: 32)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            if let ring = page.ring { DailyRing(done: ring.done, total: ring.total, diameter: m.ring) }
        }
        .frame(width: m.header.width, height: m.header.height)
        .offset(x: m.header.minX, y: m.header.minY)
    }

    /// The rows scroll in their own space from their top to the page's foot, and can be
    /// scrolled clear of the fade; the 4 points above leave room for a lit row's halo.
    private func rows(_ page: DailyTodayPage, _ m: DailyMetrics, top: CGFloat) -> some View {
        let halo: CGFloat = 4
        return ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: m.rowGap) {
                ForEach(page.rows) { row in
                    DailyRow(row: row, height: m.row, lit: model.lit == row.id,
                             toggle: { model.toggle(row) },
                             setFirst: {
                                 let mark = page.firstMark(toggling: row)
                                 model.setFirst(mark.id, previous: mark.previous)
                             },
                             details: { opened = details(row) },
                             pullUp: { model.pullUp(row.id, level: .week) })
                }
            }
            .padding(.horizontal, m.inset)
            .padding(.top, halo)
            .padding(.bottom, size.height - m.bar.fade.minY + halo)
        }
        .frame(width: size.width, height: size.height - top + halo)
        .offset(y: top - halo)
    }

    private func walkButton(_ line: DailyGate.WalkLine, _ frame: CGRect) -> some View {
        let words = line == .waiting ? DailyCopy.walkWaiting : DailyCopy.walkWhenReady
        return Button {
            switch line {
            case .waiting: appState.resumeWalk()                    // Settings' "Pick the walk back up"
            case .whenReady: appState.walkReplayRequested = true    // from the top
            }
        } label: {
            Text(words)
                .font(DailyPalette.sansMedium(13))
                .foregroundStyle(DailyPalette.deepGreen)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(width: frame.width, height: frame.height)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .offset(x: frame.minX, y: frame.minY)
        .accessibilityIdentifier("daily.walkWaiting")
    }

    /// The paper fades in over the rows where the bar stands, and stays paper to the foot.
    private func fade(_ m: DailyMetrics) -> some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [DailyPalette.paper.opacity(0), DailyPalette.paper], startPoint: .top, endPoint: .bottom)
                .frame(height: m.bar.fade.height)
            DailyPalette.paper
        }
        .frame(width: size.width, height: max(0, size.height - m.bar.fade.minY))
        .offset(y: m.bar.fade.minY)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: Touches

    /// A tap follows the sign. A sign that takes you somewhere is put away for the day
    /// (`putAwayWhenFollowed`); "First, today" only lights its row.
    private func follow(_ sign: Signpost.Sign) {
        switch sign.target {
        case .light(let id):
            model.light(id)
        case .week(let day):
            open(.week, day)
        case .page(let horizon, let day):
            open(horizon, day)
        case .walkDown:
            return      // Task 15 walks the goal down, and puts the sign away then.
        }
        if sign.putAwayWhenFollowed { model.dismiss(sign.kind) }
    }

    /// Tell asked for from outside: any sheet over the page closes, so the listening bar is seen.
    private func answerTell() {
        guard appState.tellRequested else { return }
        appState.tellRequested = false
        appState.dailyPanel = nil
        opened = nil
        model.tellAsked()
    }

    private func details(_ row: DailyDay.Row) -> TimelineItem {
        TimelineItem(id: "task-\(row.id.uuidString)", type: .task, title: row.title, startTime: nil, isAllDay: true,
                     completed: row.done, context: "personal", entityId: row.id)
    }

    #if DEBUG
    /// `-SymphonyDailyState point`: the sign's row lit, as a tap on "First, today" lights it;
    /// `speak` and `undo`: the bar listening, or one task added with Undo showing (`DemoMode.showDaily`);
    /// `more` or `inbox`: that sheet open over the page.
    private func applyDemoStates(_ page: DailyTodayPage) {
        guard DemoMode.isOn, !demoStatesApplied else { return }
        demoStatesApplied = true
        if DemoMode.dailyStates.contains("point"), let sign = page.sign, case .light = sign.target { follow(sign) }
        DemoMode.showDaily(model, DemoMode.dailyStates)
        if let panel = DemoMode.dailyPanel { appState.dailyPanel = panel }
    }
    #endif
}
#endif
