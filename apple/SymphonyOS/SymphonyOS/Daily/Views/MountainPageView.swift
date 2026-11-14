#if os(iOS)
import SwiftUI
import SwiftData
import UIKit

/// The walk's own 390 × 844 stage on a light page: the mountain (`WalkWorldView`) for a
/// state, scaled to fit the window and letterboxed in the walk's ground colour as `WalkView`
/// does it, with `over` drawn in stage points on top. The layout is the walk's own, planted
/// by hand (`footing: .natural`). Unlike `WalkWorldView` it is an accessibility container,
/// so its peaks and flags are read together, and `over` is given the walk's stage and
/// keyboard lift as the walk's own controls are.
struct MountainStage<Over: View>: View {
    let state: WalkState
    let today: Date
    let actions: (WalkLayout.Banner) -> [(name: String, run: () -> Void)]
    let onLabel: (WalkLayout.Label) -> Void
    let onBanner: (WalkLayout.Banner, WalkLayout.Post) -> Void
    let over: Over
    /// The keyboard's top edge in screen points, while it is up.
    @State private var keyboardTop: CGFloat?

    init(state: WalkState, today: Date,
         actions: @escaping (WalkLayout.Banner) -> [(name: String, run: () -> Void)] = { _ in [] },
         onLabel: @escaping (WalkLayout.Label) -> Void,
         onBanner: @escaping (WalkLayout.Banner, WalkLayout.Post) -> Void,
         @ViewBuilder over: () -> Over) {
        self.state = state
        self.today = today
        self.actions = actions
        self.onLabel = onLabel
        self.onBanner = onBanner
        self.over = over()
    }

    var body: some View {
        let art = WalkArt.overlookSquare
        let layout = WalkLayout.make(state, today: today, art: art, footing: .natural)
        GeometryReader { geo in
            let stage = WalkStage(device: geo.size, stage: art.stage)
            ZStack(alignment: .topLeading) {
                WalkPalette.ground
                    .accessibilityHidden(true)
                ZStack(alignment: .topLeading) {
                    WalkWorldView(layout: layout, art: art, actions: actions, onLabel: onLabel, onBanner: onBanner)
                    over
                }
                .frame(width: art.stage.width, height: art.stage.height, alignment: .topLeading)
                .scaleEffect(stage.scale, anchor: .topLeading)
                .offset(x: stage.origin.x, y: stage.origin.y)
                .environment(\.walkStage, stage)
                .environment(\.walkKeyboardLift, lift(stage, root: geo.frame(in: .global), height: art.stage.height))
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .topLeading)
        }
        .accessibilityElement(children: .contain)
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            keyboardTop = frame.minY
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardTop = nil
        }
    }

    /// As `WalkView`: how far, in stage points, the stage's bottom is under the keyboard.
    private func lift(_ stage: WalkStage, root: CGRect, height: CGFloat) -> CGFloat {
        guard let keyboardTop else { return 0 }
        return max(0, height - stage.toStage(CGPoint(x: 0, y: keyboardTop - root.minY)).y)
    }
}

/// Month, Season or Year for a light household: the walk's own mountain at that level with
/// the person's flags standing on it (no question, no light), the row of words, the page's
/// heading, the hint, the add bar at the foot in its night look, and a small panel when a
/// flag is chosen. Everything it shows is read by `MountainPage`; it fetches the rows,
/// draws, and sends what is touched to the page and its effects to the model.
///
/// The mountain is the stage, scaled; the row of words, the heading, the panel, the hint
/// and the bar stand in the window's own points where Today's do (`DailyMetrics.today`), so
/// they keep the safe area and their 44-point touch shapes on every phone.
struct MountainPageView: View {
    let level: WalkLevel
    let model: DailyModel
    let userId: UUID
    /// The window from top to foot, within its side edges; the top and foot insets are the window's own.
    let size: CGSize
    let safeTop: CGFloat
    let safeBottom: CGFloat
    let layout: TodayLayout
    /// A word in the row of words.
    let go: (Horizon) -> Void

    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query private var goals: [Goal]
    @Query private var tasks: [SymphonyTask]
    /// Oldest first, as sync and the walk pick the household whose settings the phone follows.
    @Query(sort: \Household.createdAt) private var households: [Household]
    @State private var page: MountainPage?
    /// Read once per appearance (pre-flight finding 12), so area ids hold while the page is up.
    @State private var areas: [WalkArea] = []
    @State private var position: WalkPosition?
    @State private var keyboardUp = false
    /// The page's top-left on the screen, so the fold the screen reports is read in the page's space.
    @State private var origin: CGPoint = .zero
    #if DEBUG
    @State private var demoStatesApplied = false
    #endif

    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    /// The horizon this level is, in the row of words.
    private var horizon: Horizon { Horizon.allCases.first { DailyGate.mountain($0) == level } ?? .month }

    var body: some View {
        let flags = readFlags()
        let m = metrics
        ZStack(alignment: .topLeading) {
            stage
                .accessibilitySortPriority(4)
            scrim(m)
            // Opened flat, the spread's four words, so the last ("Week and today") leads back to it,
            // split at the fold as the spread's are, so none crosses it.
            DailyNavRow(current: horizon, gap: m.navGap, words: DailySpread.navWords(on: layout),
                        label: DailySpread.navLabel(on: layout),
                        split: DailySpread.navSplit(on: layout, fold: DailyFold.reported(appState, origin: origin, size: size)),
                        go: go)
                .frame(width: size.width)
                .offset(y: m.navTop)
                .accessibilitySortPriority(6)
            heading(flags.periods, m)
                .accessibilitySortPriority(5)
            if let panel = page?.panel, !keyboardUp {
                let place = DailyMetrics.mountainPanel(size: size, line: m.bar.line, layout: layout)
                MountainPanel(panel: panel, moving: page?.moving == true, wraps: place.beside, send: apply)
                    .frame(width: place.frame.width, height: place.frame.height, alignment: .bottom)
                    .offset(x: place.frame.minX)
                    .accessibilitySortPriority(3)
            }
            MountainHint(model: model, words: DailyCopy.hint(level), bar: m.bar)
                .accessibilitySortPriority(2)
            DailyBarView(model: model, metrics: m.bar, placeholder: DailyCopy.placeholder(horizon, periods: flags.periods),
                         shortPlaceholder: DailyCopy.shortPlaceholder(horizon),
                         listening: DailyCopy.listening(horizon), night: true)
                .accessibilitySortPriority(1)
        }
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .background(WalkPalette.ground)
        .dynamicTypeSize(...DailyPalette.largestChrome)       // the stage's page: nothing grows past extra large
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.mountain.\(horizon.rawValue)")
        .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { origin = $0 }
        .onAppear { appear() }
        .onChange(of: flags) { _, flags in
            page?.read(flags, areas: areas, saved: position?.kept ?? [], savedAreas: position?.areas ?? [])
            hang()
        }
        .onDisappear {
            // Another mountain page may already have taken the bar; only this page's own goes.
            guard model.page == .goal(level) else { return }
            model.page = .today
            model.hanging = nil
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            keyboardUp = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            keyboardUp = false
        }
    }

    // MARK: Numbers

    /// The heading's top under the row of words (the board's 102 under 44).
    private static let headingTop: CGFloat = 58
    /// The navy scrim starts this far above the bar's field (the board's 650 over 754).
    private static let scrimAbove: CGFloat = 104

    /// Today's numbers on this window: the row of words and the bar stand where Today's do.
    private var metrics: DailyMetrics {
        let shape = DailyMetrics.shape(for: layout, height: size.height, safeTop: safeTop, safeBottom: safeBottom,
                                       waiting: false)
        return DailyMetrics.today(size: size, safeTop: safeTop, safeBottom: safeBottom, shape: shape)
    }

    // MARK: Reading

    /// Where the walk is saved, as the main view reads it (the demo keeps its own store).
    private var walkStore: WalkPositionStore {
        #if DEBUG
        if DemoMode.isOn { return DemoMode.walkStore }
        #endif
        return WalkPositionStore()
    }

    /// The page's flags from every row, by their links (`MountainPage.flags`), with a row whose
    /// pull-up can still be undone left out, as it is everywhere while its Undo shows.
    private func readFlags() -> MountainPage.Flags {
        let hidden = model.pulledUp
        return MountainPage.flags(level: level, goals: goals.filter { $0.id != hidden },
                                  tasks: tasks.filter { $0.id != hidden },
                                  selected: appState.selectedDate, today: model.today, seasons: seasons,
                                  me: userId, areas: areas)
    }

    private func appear() {
        position = walkStore.load(for: userId)
        areas = MountainPage.areas((try? modelContext.fetch(FetchDescriptor<GoalArea>())) ?? [], me: userId,
                                   saved: position?.areas ?? [])
        var made = MountainPage(level: level, flags: readFlags(), areas: areas, saved: position?.kept ?? [],
                                savedAreas: position?.areas ?? [])
        #if DEBUG
        var walkDownNow = false
        if DemoMode.isOn, !demoStatesApplied {
            demoStatesApplied = true
            DemoMode.showMountain(&made, DemoMode.dailyStates)
            walkDownNow = DemoMode.dailyStates.contains("walkdown")     // with `select`: Walk it down tapped
        }
        #endif
        page = made
        model.page = .goal(level)
        hang()
        #if DEBUG
        if walkDownNow { apply(.walkDown) }
        #endif
    }

    /// Where a goal added from the bar hangs: the page's kept areas, zoomed peak, focused flag and periods.
    private func hang() {
        model.hanging = page?.hanging
    }

    // MARK: Touches

    /// A tap the walk's layout reads, as this page's event.
    private func send(_ tap: WalkEvent?) {
        guard let tap, let event = MountainPage.event(for: tap) else { return }
        apply(event)
    }

    private func apply(_ event: MountainPage.Event) {
        guard var p = page else { return }
        let effects = p.apply(event)
        page = p
        carryOut(effects)
        hang()
    }

    /// One of a flag's VoiceOver actions, on that flag whatever was chosen before.
    private func perform(_ event: MountainPage.Event, on id: UUID) {
        guard var p = page else { return }
        let effects = p.perform(event, on: id)
        page = p
        carryOut(effects)
        hang()
    }

    private func carryOut(_ effects: [MountainPage.Effect]) {
        for effect in effects {
            switch effect {
            case .setArea(let id, let level, let to, let from):
                let area = to.flatMap { id in areas.first { $0.id == id } }
                guard to == nil || area != nil else { continue }
                model.setArea(id, level: level, to: area, from: from)
            case .pullUp(let id, let level):
                model.pullUp(id, level: level)
            case .walkDown(let id):
                // The walk opens one level down, about this flag, and comes back to this page.
                guard let page else { continue }
                let down = DailyWalkDown.page(page, flag: id, from: horizon, date: appState.selectedDate,
                                              periods: model.periods, now: model.today, seasons: seasons,
                                              userId: userId)
                for event in down?.bar ?? [] { model.send(event) }     // the bar lets go first
                appState.walkDown = down
            case .open(let horizon):
                appState.horizon = horizon
            }
        }
    }

    /// VoiceOver's actions on a flag: `MountainPage.actions(for:)` as it is, so each flag's
    /// list keeps its shape between renders.
    private func actions(_ banner: WalkLayout.Banner) -> [(name: String, run: () -> Void)] {
        guard let page, let id = banner.itemId else { return [] }
        return page.actions(for: id).map { event in (name: name(event, page), run: { perform(event, on: id) }) }
    }

    private func name(_ event: MountainPage.Event, _ page: MountainPage) -> String {
        switch event {
        case .walkDown: DailyCopy.walkItDown
        case .moveTo(let id): DailyCopy.moveTo(page.areas.first { $0.id == id }?.name ?? "")
        case .pullUp: WalkCopy.pullUp
        case .flag, .peak, .post, .moveTapped, .letGo: ""
        }
    }

    // MARK: Pieces

    @ViewBuilder private var stage: some View {
        if let page {
            MountainStage(state: page.walkState, today: model.today, actions: actions,
                          onLabel: { send(.areaTapped($0.id)) },
                          onBanner: { banner, post in send(WalkLayout.tapEvent(banner, on: post)) }) {
                EmptyView()
            }
            .frame(width: size.width, height: size.height)
            // A tap on the mountain, not on a flag or a peak, lets go of the chosen flag.
            .contentShape(Rectangle())
            .onTapGesture { apply(.letGo) }
        } else {
            WalkPalette.ground
        }
    }

    /// "November" over "to Monday the 30th", centred under the row of words.
    private func heading(_ periods: WalkPeriods, _ m: DailyMetrics) -> some View {
        let words = DailyCopy.heading(level, periods: periods, today: model.today)
        return VStack(spacing: 2) {
            Text(words.title)
                .font(DailyPalette.crimson(40))
                .frame(minHeight: 46)
            Text(words.sub)
                .font(DailyPalette.sans(14.5))
                .opacity(0.9)
        }
        .foregroundStyle(.white)
        .multilineTextAlignment(.center)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .shadow(color: DailyPalette.navy.opacity(0.6), radius: 5, x: 0, y: 2)
        .padding(.horizontal, 16)
        .frame(width: size.width)
        .offset(y: m.navTop + Self.headingTop)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    /// The navy scrim at the foot, under the hint and the bar.
    private func scrim(_ m: DailyMetrics) -> some View {
        let top = m.bar.field.minY - Self.scrimAbove
        return LinearGradient(colors: [DailyPalette.navy.opacity(0), DailyPalette.navy.opacity(0.82)],
                              startPoint: .top, endPoint: .bottom)
            .frame(width: size.width, height: max(0, size.height - top))
            .offset(y: top)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

/// The hint above the bar ("Tap a flag to move it or walk it down"), in the bar's one line
/// slot while the bar has nothing of its own there: Undo, a note and the listening line
/// take its place. Its own view, so the bar's typing redraws only this, not the mountain.
private struct MountainHint: View {
    let model: DailyModel
    let words: String
    let bar: DailyMetrics.Bar

    var body: some View {
        if model.bar.slot == .empty {
            Text(words)
                .font(DailyPalette.sans(12.5))
                .foregroundStyle(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .shadow(color: DailyPalette.navy.opacity(0.9), radius: 3, x: 0, y: 1)
                .frame(width: max(0, bar.fade.width - 32), height: DailyMetrics.minTouch)
                .offset(x: bar.fade.minX + 16, y: bar.line - 18)
                .allowsHitTesting(false)
        }
    }
}

/// The chosen flag's panel: its line when the page has one, then Walk it down (where the
/// page offers it), Move to and Pull it up; with Move to open, the areas it can go to.
/// Each chip is drawn 36 high and takes a 44-point touch.
private struct MountainPanel: View {
    let panel: (line: String?, canWalkDown: Bool, moveTo: [WalkArea])
    let moving: Bool
    /// Beside the stage (opened flat, `DailyMetrics.mountainPanel`) the chips wrap onto more lines.
    var wraps = false
    let send: (MountainPage.Event) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let line = panel.line {
                Text(line)
                    .font(DailyPalette.sans(12.5))
                    .foregroundStyle(DailyPalette.soft)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if wraps {
                DailyChipFlow(spacing: 6, lineSpacing: 0) { chips }
            } else {
                // One row that scrolls sideways when the areas do not fit, so the panel keeps its
                // height and never rises over the peaks' labels.
                ScrollView(.horizontal) {
                    HStack(spacing: 6) { chips }
                }
                .scrollIndicators(.hidden)
                .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            }
        }
        .padding(EdgeInsets(top: 10, leading: 12, bottom: 8, trailing: 12))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 18).fill(DailyPalette.paper)
            .shadow(color: DailyPalette.navy.opacity(0.35), radius: 11, x: 0, y: 8))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("daily.panel")
    }

    /// Walk it down (where the page offers it), Move to and Pull it up; with Move to open, its areas.
    @ViewBuilder private var chips: some View {
        if moving {
            Text(WalkCopy.moveTo.uppercased())
                .font(DailyPalette.sansSemiBold(11))
                .tracking(1.3)
                .foregroundStyle(DailyPalette.muted)
                .frame(height: DailyMetrics.minTouch)
                .accessibilityHidden(true)
            ForEach(panel.moveTo) { area in
                chip(area.name, fill: .white, line: DailyPalette.line, ink: DailyPalette.ink,
                     read: DailyCopy.moveTo(area.name)) { send(.moveTo(area.id)) }
            }
        } else {
            if panel.canWalkDown {
                chip(DailyCopy.walkItDown, fill: DailyPalette.chipFill, line: DailyPalette.chipLine,
                     ink: DailyPalette.deepGreen) { send(.walkDown) }
            }
            chip(WalkCopy.moveTo, fill: .white, line: DailyPalette.line, ink: DailyPalette.ink) { send(.moveTapped) }
            chip(WalkCopy.pullUp, fill: DailyPalette.nextFill, line: DailyPalette.nextLine, ink: DailyPalette.rust) {
                send(.pullUp)
            }
        }
    }

    private func chip(_ words: String, fill: Color, line: Color, ink: Color, read: String? = nil,
                      _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(words)
                .font(DailyPalette.sansMedium(14))
                .foregroundStyle(ink)
                .lineLimit(1)
                .padding(.horizontal, 13)
                .frame(height: 36)
                .background(Capsule().fill(fill))
                .overlay(Capsule().strokeBorder(line, lineWidth: 1))
                .frame(minWidth: DailyMetrics.minTouch, minHeight: DailyMetrics.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(read ?? words)
    }
}
#endif
