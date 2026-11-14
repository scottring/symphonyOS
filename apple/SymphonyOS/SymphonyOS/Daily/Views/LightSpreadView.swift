#if os(iOS)
import SwiftUI
import SwiftData

/// The Duo opened flat and held sideways, for a light household: Today and Week as one spread.
/// One band of the mountain across both pages with the row of words (Year · Season · Month ·
/// "Week and today"), the signpost over the right page and up to two of this month's goals as
/// flags over the left; one sheet across both, with a soft shade down the fold. The left page is
/// the week of the selected date, as the phone's Week page (`DailySpread.left`: for this week the
/// rest of it, after today, then the days behind folded to one line); the right page is always
/// today. On the left page a task's circle ticks it, a tap on its words chooses it and the Move to
/// panel stands over the left page.
/// The right page is Today as on the phone (the date and the ring, the next event, today's rows)
/// with the one bar: More at the left page's foot, Inbox at the right's. One model for both pages
/// (the Planner's): one bar, one Undo, one listening state. Everything it shows is read by
/// `DailyTodayPage` and `DailyWeek` and placed by `DailyMetrics.spread`; it only draws, and sends
/// what is touched to the model. The pages meet where the screen says (`HalfOpen.split`).
struct LightSpreadView: View {
    let model: DailyModel
    let userId: UUID
    let seasons: [SeasonBoundary]?
    let size: CGSize
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let layout: TodayLayout
    /// A word in the row of words, and a band flag (Month).
    let go: (Horizon) -> Void
    /// A page on a date: where a sign leads.
    let open: (Horizon, Date) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
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
    /// The left page's task whose words were tapped; the Move to panel stands over the left page for it.
    @State private var chosen: DailyWeekChoice?
    /// The fold opened: the days behind, then anything still open from earlier weeks.
    @State private var unfolded = false
    /// The Move to panel's top, in the page's space, while it shows.
    @State private var panelTop: CGFloat?
    /// The page's left edge on the screen, so the fold the screen reports is read in the page's space.
    @State private var origin: CGPoint = .zero
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    /// The left page's week: the selected date's, as the phone's Week page follows it.
    private var weekStart: Date { DailySpread.weekStart(selected: appState.selectedDate) }

    var body: some View {
        // Read again each minute, so an event that has started gives way to the next.
        TimelineView(.everyMinute) { _ in
            let page = read(now: DailyClock.now())
            let week = readWeek()
            let line = DailyTodayHooks.walkLine(walkPosition, goalCount: goals.count, edition: appState.edition)
            let s = metrics(waiting: line != nil)
            ZStack(alignment: .topLeading) {
                DailyBand(picture: s.picture, height: s.band.height)
                DailyTopShade(solid: s.shadeSolid, height: s.shade)
                DailyNavRow(current: .week, gap: s.navGap, words: DailySpread.navWords(on: layout),
                            label: DailySpread.navLabel(on: layout), split: DailySpread.navSplit(on: layout, fold: s.fold),
                            go: go)
                    .frame(width: size.width)
                    .offset(y: s.navTop)
                    .accessibilitySortPriority(8)
                if let sign = page.sign, s.sign != .none {
                    SignpostView(sign: sign, metrics: s.sign, tap: { follow(sign) },
                                 putAway: { model.dismiss(sign.kind) })
                        .accessibilitySortPriority(7)
                }
                DailyBandFlags(flags: DailyMetrics.spreadFlags(bandGoals, on: s), open: { go(.month) })
                    .accessibilitySortPriority(6)
                DailySheet(top: s.sheetTop, radius: s.sheetRadius, grabber: .zero, lookBack: nil, onLookBack: {}) {
                    EmptyView()
                }
                leftPage(week, s)
                    .accessibilitySortPriority(5)
                rightPage(page, s, line: line)
                    .accessibilitySortPriority(4)
                DailyPaperFade(fade: s.bar.fade, size: size)
                foldShade(s)
                if let chosen {
                    DailyMovePanel(model: model, weekStart: weekStart, chosen: chosen, frame: s.panel,
                                   picked: $chosen, top: $panelTop)
                        .accessibilitySortPriority(4.5)
                }
                DailyBarView(model: model, metrics: s.bar, placeholder: DailyCopy.placeholder(.today, periods: model.periods),
                             shortPlaceholder: DailyCopy.shortPlaceholder(.today), listening: DailyCopy.listening(.today))
                    .accessibilitySortPriority(3)
                #if DEBUG
                Color.clear.frame(width: 0, height: 0)
                    .onAppear { applyDemoStates(page, week) }
                #endif
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            .background(DailyPalette.sky)
            .coordinateSpace(.named(DailyRowFrames.space))
        }
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { origin = $0 }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.spread")
        .sheet(item: $opened) { item in OpenedItemSheet(item: item, date: model.today, userId: userId) }
        .task(id: calendar.readKey(for: model.today)) { await calendar.refresh(model.today, maxAge: 60) }
        .task(id: calendar.readKey(for: weekStart)) { await calendar.refreshWeek(weekStart) }
        // The bar adds to today; the stored walk is read, and a Tell from outside makes the one bar
        // listen (never the old sheet), as on Today; then the handover, if a walk just ended here.
        .modifier(DailyTodayHooks(model: model, userId: userId, walkPosition: $walkPosition, goalCount: goals.count,
                                  tellTaken: { opened = nil }, appeared: startHandover))
        // An ordinary walk just finished onto this page (`DailyHandover.plays`): the bar's light takes the halo.
        .onChange(of: appState.handover) { _, _ in startHandover() }
        // Set down half open (the display covers this page, which stays, inert): a row's Details closes, so
        // the display and its bar are seen, not a sheet over them (`DailyGate.keepsDetails`), as on Today.
        .onChange(of: covered) { _, covered in
            if !DailyGate.keepsDetails(covered: covered) { opened = nil }
        }
        // Another week on the left page: nothing chosen or unfolded carries over from the last one.
        .onChange(of: weekStart) { _, _ in
            chosen = nil
            unfolded = false
        }
    }

    // MARK: Reading

    private func read(now: Date) -> DailyTodayPage {
        DailyTodayPage.read(tasks: tasks, goals: goals, focus: focus, commitments: commitments,
                            events: calendar.items(for: model.today) ?? [], instances: instances,
                            today: model.today, now: now, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp, dismissed: model.dismissed)
    }

    private func readWeek() -> DailyWeek.Week {
        DailyWeek.make(tasks: tasks, goals: goals, commitments: commitments, focus: focus,
                       events: { calendar.items(for: $0) ?? [] }, weekStart: weekStart, today: model.today,
                       me: userId, pulledUp: model.pulledUp)
    }

    private var bandGoals: [Signpost.Named] {
        DailyWeek.bandGoals(tasks: tasks, goals: goals, commitments: commitments, focus: focus,
                            weekStart: weekStart, today: model.today, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp)
    }

    /// The spread on this window, the pages meeting where the screen reports its fold.
    private func metrics(waiting: Bool) -> DailySpread {
        let fold = DailyFold.reported(appState, origin: origin, size: size)
        return DailyMetrics.spread(size: size, safeTop: safeTop, safeBottom: safeBottom, fold: fold, waiting: waiting)
    }

    // MARK: The pages

    /// The left page (`DailySpread.left`): for this week "The rest of this week" over the range, the
    /// days after today and Any day, then the days behind folded to one line; for another week the
    /// Week page's heading and every day.
    private func leftPage(_ week: DailyWeek.Week, _ s: DailySpread) -> some View {
        let left = DailySpread.left(week, today: model.today)
        return ZStack(alignment: .topLeading) {
            DailyPageHeader(eyebrow: left.eyebrow, title: left.range, ringColumn: false, frame: s.weekHeaderFrame)
            DailyWeekList(model: model, weekStart: weekStart, days: left.days, past: left.past,
                          look: .spread, frame: s.weekScroll, inset: DailyMetrics.spreadHalo, rowHeight: s.weekRow,
                          rowGap: 0, clearOf: s.bar.fade.minY, panelTop: panelTop,
                          chosen: $chosen, unfolded: $unfolded)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.spread.week")
    }

    /// The right page: the waiting walk's line if any, Today over the date with the ring, the next
    /// event, today's rows.
    private func rightPage(_ page: DailyTodayPage, _ s: DailySpread, line: DailyGate.WalkLine?) -> some View {
        let top = page.next == nil ? s.rowsTopNoCard : s.rowsTop
        let scroll = s.rowsScroll
        return ZStack(alignment: .topLeading) {
            if let line, let frame = s.waiting { DailyWalkLine(line: line, frame: frame) }
            DailyPageHeader(eyebrow: DailyCopy.today, title: DailyCopy.date(model.today),
                            ring: page.ring.map { ($0.done, $0.total) }, ringDiameter: s.ring, frame: s.todayHeader)
            if let next = page.next {
                DailyNextCard(next: next)
                    .frame(width: s.card.width, height: s.card.height)
                    .offset(x: s.card.minX, y: s.card.minY)
            }
            DailyTodayList(model: model, page: page,
                           frame: CGRect(x: scroll.minX, y: top, width: scroll.width, height: size.height - top),
                           inset: DailyMetrics.spreadHalo, rowHeight: s.row, rowGap: s.rowGap, clearOf: s.bar.fade.minY,
                           details: { opened = DailyTodayList.details($0) })
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.spread.today")
    }

    /// The soft shade down the fold, where the pages meet: it reads and takes nothing.
    private func foldShade(_ s: DailySpread) -> some View {
        LinearGradient(stops: [.init(color: DailyPalette.ink.opacity(0), location: 0),
                               .init(color: DailyPalette.ink.opacity(0.07), location: 0.48),
                               .init(color: DailyPalette.ink.opacity(0.12), location: 0.5),
                               .init(color: DailyPalette.ink.opacity(0.07), location: 0.52),
                               .init(color: DailyPalette.ink.opacity(0), location: 1)],
                       startPoint: .leading, endPoint: .trailing)
            .frame(width: s.foldShade.width, height: s.foldShade.height)
            .offset(x: s.foldShade.minX, y: s.foldShade.minY)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    // MARK: Touches

    private func follow(_ sign: Signpost.Sign) {
        DailySignFollower(model: model, appState: appState, goals: goals, tasks: tasks, goalAreas: goalAreas,
                          walkPosition: walkPosition, seasons: seasons, userId: userId, open: open).follow(sign)
    }

    /// The handover, as `DailyHandover.play` decides it on this window: the light does not travel
    /// here (`DailyHandover.travels`), so the bar's light takes the halo and the line shows the
    /// first time; with a sheet over the page nothing plays (and the line is not spent).
    private func startHandover() {
        guard appState.handover else { return }
        appState.handover = false
        switch DailyHandover.play(lowered: false, sheetOver: sheetOver, reduceMotion: reduceMotion,
                                  slotTaken: model.bar.slot != .empty, travels: DailyHandover.travels(on: layout)) {
        case .skip:
            return
        case .still, .travel:
            withAnimation(.easeIn(duration: 0.25)) { model.handoverArrived() }
        }
    }

    /// The light half-open display covers this page (`DailyGate.coversPage`).
    private var covered: Bool {
        DailyGate.coversPage(edition: appState.edition, halfOpen: appState.posture.isHalfOpen, phone: DailyDevice.phone)
    }

    /// Anything over the page that hides the bar: Inbox, More, a row's details, the half-open display.
    private var sheetOver: Bool { DailyTodayHooks.sheetOver(detailsOpen: opened != nil, appState) }

    #if DEBUG
    /// The demo's states, as on Today and Week: `point`, `speak`, `undo`, `more`, `inbox`, `handover`
    /// as on Today; `select`: the left page's first task chosen, its Move to panel up; `unfold`: the fold open.
    private func applyDemoStates(_ page: DailyTodayPage, _ week: DailyWeek.Week) {
        guard DemoMode.isOn, !demoStatesApplied else { return }
        demoStatesApplied = true
        let states = DemoMode.dailyStates
        if states.contains("point"), let sign = page.sign, case .light = sign.target { follow(sign) }
        DemoMode.showDaily(model, states)
        if let panel = DemoMode.dailyPanel { appState.dailyPanel = panel }
        if states.contains("unfold") { unfolded = true }
        if DemoMode.handoverHold != nil { model.handoverArrived() }
        let rest = DailyWeek.Week(start: week.start, eyebrow: week.eyebrow, range: week.range, past: week.past,
                                  days: DailySpread.left(week, today: model.today).days)
        if states.contains("select"), let pick = DemoMode.weekChoice(rest) {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                chosen = DailyWeekChoice(id: pick.row.id, day: pick.day)
            }
        }
    }
    #endif
}

#endif
