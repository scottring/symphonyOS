#if os(iOS)
import SwiftUI
import SwiftData

/// Today on the page, for a light household: a band of the mountain, the row of words,
/// the signpost, and the paper with the date, the ring, the next event and today's rows,
/// each saying what it is for. Everything it shows is read by `DailyTodayPage` and placed
/// by `DailyMetrics`; it only draws, and sends what is touched to the model. The page runs from
/// the window's top to its foot but stands within its side edges (clear of the system's column on
/// the Duo's outside screen): `size` is that, and the top and foot insets are the window's own.
struct LightTodayView: View {
    let model: DailyModel
    let userId: UUID
    let seasons: [SeasonBoundary]?
    let size: CGSize
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let layout: TodayLayout
    /// Where the walk's light stood, in this page's points, for the handover (`DailyHandover.start`).
    let handoverFrom: (centre: CGPoint, diameter: CGFloat)
    /// The light half-open display covers this page (the Planner's `DailyGate.coversPage`, its one source).
    let covered: Bool
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
    @Query private var goalAreas: [GoalArea]
    @State private var calendar = CalendarFeed.shared
    /// This person's stored walk, read whenever the page appears and whenever a walk closes.
    @State private var walkPosition: WalkPosition?
    /// A row's Details, open in the task's own screen.
    @State private var opened: TimelineItem?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The sheet lowered by its handle over the whole plan, or not.
    @State private var lookBack = DailyLookBack()
    /// The handover: how far the walk's light is on its way down to the bar (nil: not travelling),
    /// and how far below its place the sheet stands as it rises.
    @State private var travel: Double?
    @State private var sheetDrop: CGFloat = 0
    /// Counts the travels, so a travel ended early by a touch does not arrive a second time.
    @State private var travelRun = 0
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    var body: some View {
        // Read again each minute, so an event that has started gives way to the next.
        TimelineView(.everyMinute) { _ in
            let page = read(now: DailyClock.now())
            let line = DailyTodayHooks.walkLine(walkPosition, goalCount: goals.count, edition: appState.edition)
            let m = metrics(waiting: line != nil)
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
                    DailyBand(picture: m.picture, cut: m.todayCut, height: m.band.height + sheetDrop)
                }
                DailyTopShade(solid: m.shadeSolid, height: m.shade)
                DailyNavRow(current: .today, gap: m.navGap, go: go)
                    .frame(width: size.width)
                    .offset(y: m.navTop)
                if let sign = page.sign, m.sign != .none, low == nil {
                    SignpostView(sign: sign, metrics: m.sign, tap: { follow(sign) },
                                 putAway: { model.dismiss(sign.kind) })
                }
                DailySheet(top: low?.sheetTop ?? m.sheetTop, radius: m.sheetRadius, grabber: low?.grabber ?? m.grabber,
                           lookBack: low?.lookBack ?? m.lookBack, onLookBack: handleTapped, label: lookBack.label(on: .today),
                           strip: low?.strip) {
                    if let low { header(page, m, at: low.header) } else { sheet(page, m, line: line) }
                }
                .offset(y: sheetDrop)
                .allowsHitTesting(paper == nil)
                .modifier(DailySheetEndsTyping())        // a tap on the sheet, or a scroll, puts the keyboard away (S41)
                .accessibilityHidden(paper != nil)
                if low != nil {
                    DailyWholePlanPaper(lookBack: $lookBack, paper: paper, size: size, navTop: m.navTop)
                }
                if low == nil {
                    DailyPaperFade(fade: m.bar.fade, size: size)
                    DailyBarView(model: model, metrics: m.bar, placeholder: DailyCopy.placeholder(.today, periods: model.periods),
                                 shortPlaceholder: DailyCopy.shortPlaceholder(.today, periods: model.periods),
                                 listening: DailyCopy.listening(.today), lightShown: travel == nil, touched: { interrupt(.touch) })
                }
                if let travel {
                    HandoverLight(progress: travel, from: handoverFrom, to: DailyHandover.end(bar: m.bar))
                        .frame(width: size.width, height: size.height)
                }
                #if DEBUG
                Color.clear.frame(width: 0, height: 0)
                    .onAppear { applyDemoStates(page) }
                #endif
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .background(DailyPalette.sky)
            .coordinateSpace(.named(DailyRowFrames.space))
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.today")
        .sheet(item: $opened) { item in OpenedItemSheet(item: item, date: model.today, userId: userId) }
        .task(id: calendar.readKey(for: model.today)) { await calendar.refresh(model.today, maxAge: 60) }
        // The bar adds to today; the stored walk is read; a Tell from the Lock Screen's control or a
        // `symphony://tell` link makes the bar listen, no sheet (asked while the walk shows, it is answered
        // as the walk closes), the whole plan rising first so the bar that answers is there; then the
        // handover, if a walk just ended here. Shared with the spread (`DailyTodayHooks`).
        .modifier(DailyTodayHooks(model: model, userId: userId, walkPosition: $walkPosition, goalCount: goals.count,
                                  beforeTell: {
                                      lookBack.tellArrives(asked: appState.tellRequested, walkShowing: appState.walkShowing,
                                                           covered: model.covered)
                                  },
                                  tellTaken: { opened = nil }, appeared: startHandover))
        // An ordinary walk just finished onto this page (`DailyHandover.plays`): the light comes down to the bar.
        .onChange(of: appState.handover) { _, _ in startHandover() }
        // Listening, a note or Undo taking the line slot ends the travel at once.
        .onChange(of: model.bar.slot) { _, slot in interrupt(.slot(slot)) }
        // Set down half open (the display covers this page, which stays, inert): the travel ends with no
        // line, and a row's Details closes, so the display and its bar are seen, not a sheet over them.
        .onChange(of: covered) { _, covered in
            if covered { interrupt(.covered) }
            if !DailyGate.keepsDetails(covered: covered) { opened = nil }
        }
    }

    // MARK: Reading

    private func read(now: Date) -> DailyTodayPage {
        DailyTodayPage.read(tasks: tasks, goals: goals, focus: focus, commitments: commitments,
                            events: calendar.items(for: model.today) ?? [], instances: instances,
                            today: model.today, now: now, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp, dismissed: model.dismissed)
    }

    private func metrics(waiting: Bool) -> DailyMetrics {
        let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: safeTop, safeBottom: safeBottom,
                                       waiting: waiting)
        return DailyMetrics.today(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape, waiting: waiting)
    }

    // MARK: The sheet

    @ViewBuilder
    private func sheet(_ page: DailyTodayPage, _ m: DailyMetrics, line: DailyGate.WalkLine?) -> some View {
        if let line, let frame = m.waiting { walkButton(line, frame) }
        header(page, m, at: m.header)
        if let next = page.next {
            DailyNextCard(next: next)
                .frame(width: m.card.width, height: m.card.height)
                .offset(x: m.card.minX, y: m.card.minY)
        }
        let top = page.next == nil ? m.rowsTopNoCard : m.rowsTop
        DailyTodayList(model: model, page: page, frame: CGRect(x: 0, y: top, width: size.width, height: size.height - top),
                       inset: m.inset, rowHeight: m.row, rowGap: m.rowGap, clearOf: m.bar.fade.minY,
                       details: { opened = DailyTodayList.details($0) })
    }

    private func header(_ page: DailyTodayPage, _ m: DailyMetrics, at frame: CGRect) -> some View {
        DailyPageHeader(eyebrow: DailyCopy.today, title: DailyCopy.date(model.today),
                        ring: page.ring.map { ($0.done, $0.total) }, ringDiameter: m.ring, frame: frame)
    }

    private func walkButton(_ line: DailyGate.WalkLine, _ frame: CGRect) -> some View {
        DailyWalkLine(line: line, frame: frame)
    }

    // MARK: Touches

    /// A tap follows the sign. A sign that takes you somewhere is put away for the day
    /// (`putAwayWhenFollowed`); "First, today" only lights its row.
    private func follow(_ sign: Signpost.Sign) {
        DailySignFollower(model: model, appState: appState, goals: goals, tasks: tasks, goalAreas: goalAreas,
                          walkPosition: walkPosition, seasons: seasons, userId: userId, open: open).follow(sign)
    }

    /// The handle lowers the sheet over the whole plan, reading the ridge as it goes, or raises it.
    private func handleTapped() {
        interrupt(.handle)
        let ridge = DailyLookBack.ridge(goalAreas, me: userId, saved: walkPosition)
        for event in lookBack.handleTapped(areas: ridge.areas, kept: ridge.kept) { model.send(event) }
    }

    // MARK: The handover

    /// Plays the handover once it is asked for, as `DailyHandover.play` decides: with the bar on
    /// screen the sheet rises from `sheetDrop` lower on the walk's sheet curve while the light
    /// travels down for `travelMs`; with Reduce Motion nothing moves and the halo and line fade in;
    /// with no bar on screen nothing plays (and the line is not spent).
    private func startHandover() {
        guard appState.handover else { return }
        appState.handover = false
        switch DailyHandover.play(lowered: lookBack.lowered, sheetOver: sheetOver, reduceMotion: reduceMotion,
                                  slotTaken: model.bar.slot != .empty) {
        case .skip:
            return
        case .still:
            withAnimation(.easeIn(duration: 0.25)) { model.handoverArrived() }
        case .travel:
            travelRun += 1
            let run = travelRun
            var still = Transaction()
            still.disablesAnimations = true
            withTransaction(still) {
                sheetDrop = DailyHandover.sheetDrop
                travel = 0
            }
            // After the low sheet and the light at the start are drawn, both move.
            DispatchQueue.main.async {
                guard travelRun == run, travel != nil else { return }
                withAnimation(WalkEndingView.move) { sheetDrop = 0 }
                // Eased at both ends, so the travel is still under way once the walk has faded.
                withAnimation(.timingCurve(0.45, 0, 0.25, 1, duration: Double(DailyHandover.travelMs) / 1000)) {
                    travel = 1
                } completion: {
                    arrive(run)
                }
            }
        }
    }

    /// Anything over the page that hides the bar: Inbox, More, a row's details, the half-open display.
    private var sheetOver: Bool { DailyTodayHooks.sheetOver(detailsOpen: opened != nil, appState) }

    /// Whether the bar is still on screen as the light lands (asked again: a sheet may have opened).
    private var barShown: Bool {
        DailyHandover.play(lowered: lookBack.lowered, sheetOver: sheetOver, reduceMotion: reduceMotion) != .skip
    }

    /// The travelling light reaches the bar: it is the bar's light from here on.
    private func arrive(_ run: Int) {
        guard travelRun == run, travel != nil else { return }
        travel = nil
        withAnimation(.easeIn(duration: 0.25)) { model.handoverArrived(barShown: barShown) }
    }

    /// Something happened during the travel, as `DailyHandover.interrupt` reads it: a touch on the
    /// bar or the slot taken snaps the light home and it arrives; the handle (taking the bar away)
    /// ends it with no arrival. A sheet that had not begun to rise rises.
    private func interrupt(_ interruption: DailyHandover.Interruption) {
        let cut = DailyHandover.interrupt(interruption)
        guard cut.ends, travel != nil else { return }
        travelRun += 1
        var still = Transaction()
        still.disablesAnimations = true
        withTransaction(still) { travel = nil }
        if sheetDrop != 0 { withAnimation(reduceMotion ? nil : WalkEndingView.move) { sheetDrop = 0 } }
        guard cut.arrives else { return }
        // After the touch has done what it asks: a tap on the light listening first takes the
        // slot, so the line is not shown, and not spent.
        DispatchQueue.main.async { model.handoverArrived(barShown: barShown) }
    }


    #if DEBUG
    /// `-SymphonyDailyState point`: the sign's row lit, as a tap on "First, today" lights it;
    /// `speak` and `undo`: the bar listening, or one task added with Undo showing (`DemoMode.showDaily`);
    /// `more` or `inbox`: that sheet open over the page; `lookback`: the handle tapped, the whole plan behind;
    /// `handover`: the light just handed over, with its halo and line; `travel`: held halfway down.
    private func applyDemoStates(_ page: DailyTodayPage) {
        guard DemoMode.isOn, !demoStatesApplied else { return }
        demoStatesApplied = true
        if DemoMode.dailyStates.contains("point"), let sign = page.sign, case .light = sign.target { follow(sign) }
        DemoMode.showDaily(model, DemoMode.dailyStates)
        if let panel = DemoMode.dailyPanel { appState.dailyPanel = panel }
        if DemoMode.dailyStates.contains("lookback") { handleTapped() }
        // `lookbackpaper`: the handle tapped and the year cloth's paper raised over the whole plan.
        if DemoMode.dailyStates.contains("lookbackpaper") {
            handleTapped()
            lookBack.tap(.lookBackPaper(.year))
        }
        // `details` (with `speak`): a moment later the first row's Details opens, as its menu would,
        // the bar letting go first (`sheetOpening`).
        if DemoMode.dailyStates.contains("details"), let row = page.rows.first {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(1200))
                model.sheetOpening()
                opened = DailyTodayList.details(row)
            }
        }
        switch DemoMode.handoverHold {
        case .settled?:
            model.handoverArrived()
        case .travel(let progress)?:
            sheetDrop = DailyHandover.sheetDrop
            travel = progress
        case nil:
            break
        }
    }
    #endif
}
#endif
