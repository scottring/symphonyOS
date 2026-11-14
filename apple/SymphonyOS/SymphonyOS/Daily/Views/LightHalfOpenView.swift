#if os(iOS)
import SwiftUI
import SwiftData
import UIKit

/// The iPhone Duo set down half open, for a light household ("Duo, half open" on the boards).
/// The half you look at, upright like a laptop's screen or the left page of a book, shows the
/// time, what is next and the signpost over the scenery, under the walk's own shade; it takes no
/// touch at all (it may stand at an angle, or face away), and its sign is not followed or put
/// away. The half you touch shows To do today with the ring, today's open tasks (each a tick, the
/// done ones as one count) and the bar, whose one line slot carries Undo and the listening line.
///
/// It keeps what the old half-open display does around its edges: the screen stays on while it is
/// up, the day turns at midnight, and `-TodaySize` pins its size in Debug (scaled down to fit a
/// smaller simulator). It owns its own `DailyModel` (pre-flight finding 8); a light page under it
/// stays drawn but inert (`DailyGate.coversPage`, ruling D14), so this bar is the only one that can
/// listen, write or answer a Tell Symphony. Everything it shows is read by `DailyTentPage` and placed by
/// `DailyMetrics.tent`; it only draws, and sends what is touched to the model.
struct LightHalfOpenView: View {
    let posture: DuoPosture

    init(posture: DuoPosture) {
        self.posture = posture
    }

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Oldest first, as sync and the walk pick the household whose settings the phone follows.
    @Query(sort: \Household.createdAt) private var households: [Household]
    @Query private var tasks: [SymphonyTask]
    @Query private var goals: [Goal]
    @Query private var focus: [TaskFocus]
    @Query private var commitments: [TaskCommitment]
    @Query private var instances: [ActionableInstance]
    @State private var calendar = CalendarFeed.shared
    @State private var model: DailyModel?
    /// Where the rows stand, so the row an Undo would change is kept clear of the line slot.
    @State private var frames = DailyRowFrames()
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    private var across: Bool { posture == .laptop }
    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    var body: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .global)
            let size = TodayView.pinnedSize ?? proxy.size
            let split = Self.pinnedSplit ?? HalfOpen.split(fold: appState.dockLayout.fold, origin: frame.origin,
                                                            size: size, across: across)
            let tent = DailyMetrics.tent(size: size, split: split, across: across)
            Group {
                if let model, let userId = auth.currentUser?.id {
                    display(model, userId: userId, tent: tent)
                } else {
                    DailyPalette.sky
                }
            }
            .frame(width: size.width, height: size.height, alignment: .topLeading)
            #if DEBUG
            // `-TodaySize 626x890` pins this to a Duo screen's size; a smaller simulator sees it whole.
            .scaleEffect(Self.fit(size, in: proxy.size), anchor: .topLeading)
            #endif
        }
        .background(DailyPalette.paper.ignoresSafeArea())
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .task(id: model.map { calendar.readKey(for: $0.today) }) {
            guard let model else { return }
            await calendar.refresh(model.today, maxAge: 60)
        }
        // A display on the table: it stays on while Symphony is open.
        .onAppear {
            keepAwake()
            appState.dailyPanel = nil               // Inbox or More left open would stand over the display
            if model == nil { makeModel() }
            answerTell()
            applyDemoStates()
        }
        // Once more after appearing: when the old display gives way to this one, its own clearing may
        // come after this view's appear.
        .task { keepAwake() }
        .onDisappear {
            // Cleared only when the phone is no longer half open: when the household's edition swaps
            // this display for the old one, the old one keeps the screen on.
            // Signed out while half open: nobody's display is up any more, so the screen may sleep.
            if !staysAwake { UIApplication.shared.isIdleTimerDisabled = false }
            model?.close()
            model = nil
        }
        .onChange(of: auth.currentUser?.id) { _, _ in
            makeModel()
            if !staysAwake { UIApplication.shared.isIdleTimerDisabled = false }
        }
        .onChange(of: scenePhase) { _, phase in model?.sceneChanged(DailyModel.Scene(phase)) }
        // The Lock Screen's Tell Symphony control or a `symphony://tell` link: this bar listens, in
        // sight; asked for while the walk shows, it waits and is answered as the walk closes.
        .onChange(of: appState.tellRequested) { _, _ in answerTell() }
        .onChange(of: appState.walkShowing) { _, showing in
            model?.walkShowingChanged(showing)      // never a live microphone under the walk
            answerTell()
        }
    }

    /// The screen stays on while the phone is set down half open, for someone signed in
    /// (`DailyGate.staysAwake`).
    private func keepAwake() {
        if staysAwake { UIApplication.shared.isIdleTimerDisabled = true }
    }

    private var staysAwake: Bool {
        DailyGate.staysAwake(halfOpen: appState.posture.isHalfOpen, signedIn: auth.currentUser != nil)
    }

    // MARK: The display

    private func display(_ model: DailyModel, userId: UUID, tent: DailyTent) -> some View {
        // Read again each minute, so the time moves on and an event that has started gives way.
        // The one clock: the same minute tick reads the day again (past midnight the date, the rows
        // and the time turn together) and keeps the screen on.
        TimelineView(.everyMinute) { context in
            let now = DailyClock.now()
            let page = DailyTentPage(read(model, userId: userId, now: now))
            ZStack(alignment: .topLeading) {
                look(page, tent, model: model, now: now)
                    .accessibilitySortPriority(2)
                touch(page, tent, model: model)
                    .accessibilitySortPriority(1)
            }
            .coordinateSpace(.named(DailyRowFrames.space))
            .onChange(of: context.date) { _, _ in
                model.refreshDay()
                keepAwake()
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
        .accessibilityIdentifier("daily.halfOpen")
    }

    private func read(_ model: DailyModel, userId: UUID, now: Date) -> DailyTodayPage {
        DailyTodayPage.read(tasks: tasks, goals: goals, focus: focus, commitments: commitments,
                            events: calendar.items(for: model.today) ?? [], instances: instances,
                            today: model.today, now: now, me: userId, seasons: seasons,
                            pulledUp: model.pulledUp, dismissed: model.dismissed)
    }

    // MARK: Where you look

    /// The sky takes every touch on this half and does nothing with it (none passes to the page
    /// under the display); everything drawn on it takes none.
    private func look(_ page: DailyTentPage, _ tent: DailyTent, model: DailyModel, now: Date) -> some View {
        ZStack(alignment: .topLeading) {
            DailyPalette.sky
            ZStack(alignment: .topLeading) {
                Image(WalkArt.Cut.halfOpen(across: across).imageName)
                    .resizable()
                    .interpolation(.high)
                    .frame(width: tent.picture.width, height: tent.picture.height)
                    .offset(x: tent.picture.minX - tent.look.minX, y: tent.picture.minY - tent.look.minY)
                    .accessibilityHidden(true)
                DailyTopShade(solid: tent.veil.solid, height: tent.veil.length)
                time(tent, model: model, now: now)
                if let next = page.next { nextLine(next, tent) }
                if let sign = page.sign, tent.sign != .none {
                    // Not followed and not put away here: no tap or swipe reaches it, and it does nothing.
                    SignpostView(sign: sign, metrics: tent.sign, tappable: false, tap: {}, putAway: {})
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(sign.stillLabel)
                        .accessibilityIdentifier("daily.halfOpen.sign")
                }
            }
            .allowsHitTesting(false)
        }
        .frame(width: tent.look.width, height: tent.look.height, alignment: .topLeading)
        .clipped()
        .background(DailyPalette.sky.ignoresSafeArea())
        .offset(x: tent.look.minX, y: tent.look.minY)
        .accessibilityElement(children: .contain)
    }

    private func time(_ tent: DailyTent, model: DailyModel, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(DailyCopy.clock(now))
                .font(DailyPalette.crimson(tent.timeSize))
                .monospacedDigit()
                .lineLimit(1)
                .frame(height: tent.timeSize, alignment: .center)
            Text(DailyCopy.date(model.today))
                .font(DailyPalette.sans(tent.dateSize))
                .tracking(0.3)
                .opacity(0.92)
        }
        .foregroundStyle(.white)
        .shadow(color: DailyPalette.navy.opacity(0.7), radius: 6, x: 0, y: 2)
        .offset(x: tent.time.x - tent.look.minX, y: tent.time.y - tent.look.minY)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("daily.halfOpen.time")
    }

    private func nextLine(_ next: DailyDay.Next, _ tent: DailyTent) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(DailyCopy.nextAt(next.start).uppercased())
                .font(DailyPalette.sansSemiBold(13))
                .tracking(1.8)
                .foregroundStyle(DailyPalette.gold)
            Text(next.title)
                .font(DailyPalette.crimson(tent.nextSize))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(width: tent.next.width, alignment: .leading)
        .shadow(color: DailyPalette.navy.opacity(0.8), radius: 6, x: 0, y: 2)
        .offset(x: tent.next.minX - tent.look.minX, y: tent.next.minY - tent.look.minY)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(DailyCopy.nextEvent(next.title, at: next.start))
    }

    // MARK: Where you touch

    private func touch(_ page: DailyTentPage, _ tent: DailyTent, model: DailyModel) -> some View {
        ZStack(alignment: .topLeading) {
            DailyPalette.paper
                .frame(width: tent.touch.width, height: tent.touch.height)
                .offset(x: tent.touch.minX, y: tent.touch.minY)
                .accessibilityHidden(true)
            foldShade(tent)
            header(page, tent)
                .accessibilitySortPriority(3)
            rows(page, tent, model: model)
                .accessibilitySortPriority(2)
            if model.bar.slot != .empty { slotPaper(tent) }
            DailyBarView(model: model, metrics: tent.bar, placeholder: DailyCopy.placeholder(.today, periods: model.periods),
                         listening: DailyCopy.listening(.today), icons: false, textSize: tent.barTextSize)
                .accessibilitySortPriority(1)
        }
        .accessibilityElement(children: .contain)
    }

    /// The soft shade the upright half casts on the paper along the fold.
    private func foldShade(_ tent: DailyTent) -> some View {
        LinearGradient(colors: [DailyPalette.ink.opacity(0.2), DailyPalette.ink.opacity(0)],
                       startPoint: across ? .top : .leading, endPoint: across ? .bottom : .trailing)
            .frame(width: tent.fold.width, height: tent.fold.height)
            .offset(x: tent.fold.minX, y: tent.fold.minY)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func header(_ page: DailyTentPage, _ tent: DailyTent) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text(DailyCopy.toDoToday.uppercased())
                .font(DailyPalette.sansSemiBold(13))
                .tracking(1.8)
                .foregroundStyle(DailyPalette.muted)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
            if let ring = page.ring { DailyRing(done: ring.done, total: ring.total, diameter: tent.ring) }
        }
        .frame(width: tent.header.width, height: tent.header.height)
        .offset(x: tent.header.minX, y: tent.header.minY)
        .accessibilityElement(children: .contain)
    }

    /// The open rows scroll in their own space and the header and bar stay put; the done count
    /// follows them. While the line slot says something the list can be scrolled clear of it, and
    /// a row added with Undo showing is scrolled clear of it if it covers it.
    private func rows(_ page: DailyTentPage, _ tent: DailyTent, model: DailyModel) -> some View {
        ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 4) {
                    if page.nothing {
                        Text(WalkCopy.nothingToday)
                            .font(DailyPalette.crimson(tent.titleSize))
                            .foregroundStyle(DailyPalette.soft)
                            .padding(.leading, 10)
                    }
                    VStack(spacing: tent.rowGap) {
                        ForEach(page.open) { row in
                            TentRow(row: row, tent: tent) { tick(row, model: model) }
                                .dailyRowFrame(row.id, in: frames)
                        }
                    }
                    if let line = page.doneLine {
                        Text(line)
                            .font(DailyPalette.sans(14))
                            .foregroundStyle(DailyPalette.muted)
                            .padding(.leading, 10)
                            .frame(minHeight: 18)
                            .accessibilityIdentifier("daily.halfOpen.done")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, model.bar.slot != .empty ? DailyMetrics.tentSlotHeight : 0)
            }
            .scrollBounceBehavior(.basedOnSize)
            .dailyListFrame(frames)
            .onChange(of: model.reveal) { _, reveal in
                guard let reveal else { return }
                frames.keepInSight(reveal.id, above: tent.slot.minY, proxy: proxy, animated: !reduceMotion)
            }
        }
        .frame(width: tent.rows.width, height: tent.rows.height)
        .offset(x: tent.rows.minX, y: tent.rows.minY)
        .accessibilityElement(children: .contain)
    }

    /// The paper the line slot stands on over the rows' foot, while it says something.
    private func slotPaper(_ tent: DailyTent) -> some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [DailyPalette.paper.opacity(0), DailyPalette.paper], startPoint: .top, endPoint: .bottom)
                .frame(height: 12)
            DailyPalette.paper
        }
        .frame(width: tent.slot.width, height: tent.slot.height)
        .offset(x: tent.slot.minX, y: tent.slot.minY)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: Touches

    private func tick(_ row: DailyDay.Row, model: DailyModel) {
        // Here a done row goes into a count, so a tick offers Undo (ruling D15).
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { model.tickWithUndo(row) }
    }

    /// Tell asked for from outside, as the model answers it (`DailyGate.tell`): this bar listens,
    /// types, or waits for the walk; never a sheet, and never the page under the display.
    private func answerTell() {
        model?.answerTell(appState)
    }

    private func makeModel() {
        model?.close()
        guard let userId = auth.currentUser?.id else {
            model = nil
            return
        }
        #if DEBUG
        let listener = DemoMode.isOn ? DemoMode.dailyListener : nil    // `-SymphonyDailyState speak`
        let memory = DemoMode.isOn ? DemoMode.signMemory : SignpostMemory()
        #else
        let listener: WalkListening? = nil
        let memory = SignpostMemory()
        #endif
        // Speech on the phone only: with no stand-in, the model's own listener (`DailyModel.makeListener`).
        model = DailyModel(context: modelContext, userId: userId, seasons: seasons, listener: listener, memory: memory)
    }

    /// `-SymphonyDailyState speak` or `undo`: the bar listening, or one task added with Undo showing.
    private func applyDemoStates() {
        #if DEBUG
        guard DemoMode.isOn, !demoStatesApplied, let model else { return }
        demoStatesApplied = true
        DemoMode.showDaily(model, DemoMode.dailyStates)
        #endif
    }

    #if DEBUG
    /// `-HalfOpenSplit 400` (demo only): the fold at that point, as a real Duo may report it.
    private static let pinnedSplit: CGFloat? = DemoMode.isOn ? ProcessInfo.processInfo.arguments
        .split(separator: "-HalfOpenSplit", maxSplits: 1).dropFirst().first?.first.flatMap { Double($0) }.map { CGFloat($0) } : nil

    /// The pinned size scaled down to the room there is (1 with nothing pinned, or room enough).
    private static func fit(_ size: CGSize, in room: CGSize) -> CGFloat {
        guard TodayView.pinnedSize != nil, size.width > 0, size.height > 0, room.width > 0, room.height > 0 else { return 1 }
        return min(1, room.width / size.width, room.height / size.height)
    }
    #else
    private static let pinnedSplit: CGFloat? = nil
    #endif
}

/// One of today's open tasks on the half you touch: a large circle and its words, the whole row
/// one tick. The board's laptop and book sizes come from `DailyTent`.
private struct TentRow: View {
    let row: DailyDay.Row
    let tent: DailyTent
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: tent.rowSpacing) {
                Circle()
                    .strokeBorder(DailyPalette.openCircle, lineWidth: 2.5)
                    .frame(width: tent.circle, height: tent.circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title)
                        .font(DailyPalette.sansMedium(tent.titleSize))
                        .foregroundStyle(DailyPalette.ink)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    if let goal = row.forGoal {
                        HStack(spacing: 6) {
                            DailyFlag(colour: DailyPalette.lineageFlag, poleWidth: 1.4)
                                .frame(width: 12, height: 14)
                            Text(forLine(goal))
                                .lineLimit(1)
                                .truncationMode(.tail)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, tent.rowPadding)
            .frame(maxWidth: .infinity)
            .frame(height: tent.row)
            .background(RoundedRectangle(cornerRadius: 20).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(DailyPalette.line, lineWidth: 1))
            .contentShape(RoundedRectangle(cornerRadius: 20))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.rowLabel(row.title, forGoal: row.forGoal))
        .accessibilityValue(WalkCopy.rowOpen)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("daily.halfOpen.row")
    }

    /// `WalkCopy.forGoal`, with the goal's name set apart, at the board's half-open sizes.
    private func forLine(_ goal: String) -> AttributedString {
        var text = AttributedString(WalkCopy.forGoal(goal))
        text.font = DailyPalette.sans(tent.lineageSize)
        text.foregroundColor = DailyPalette.lineageInk
        if let range = text.range(of: goal, options: .backwards) {
            text[range].font = DailyPalette.crimson(tent.goalSize)
            text[range].foregroundColor = DailyPalette.green
        }
        return text
    }
}
#endif
