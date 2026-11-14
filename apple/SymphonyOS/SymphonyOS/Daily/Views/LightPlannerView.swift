#if os(iOS)
import SwiftUI
import SwiftData
import UIKit

/// The Planner for a light household. It owns the one `DailyModel`, measures the window,
/// works out its `TodayLayout`, and for the horizon on screen draws the light page where
/// `DailyGate.shows` says one is built; everywhere else it draws `full()`, the Planner
/// every household has. The model reads the day again when the app becomes active and
/// once a minute (so a new day arrives past midnight), and is told the page went away
/// (`.left`) when it disappears or the app goes to the background.
struct LightPlannerView<Full: View>: View {
    private let full: () -> Full

    init(@ViewBuilder full: @escaping () -> Full) {
        self.full = full
    }

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    /// Oldest first, as sync and the walk pick the household whose settings the phone follows.
    @Query(sort: \Household.createdAt) private var households: [Household]
    @State private var model: DailyModel?
    /// The Planner's own size inside the safe area, as `TodayView` measures it for its layout.
    @State private var size: CGSize = .zero
    /// The window's own safe area (the dock's inset left out).
    @State private var insets = UIEdgeInsets.zero
    #if DEBUG
    @State private var demoPageOpened = false
    #endif

    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    private var layout: TodayLayout {
        TodayLayout.decide(width: size.width, height: size.height, sideBars: appState.dockLayout.edge != .bottom)
    }

    private var showsLight: Bool { DailyGate.shows(appState.horizon, edition: appState.edition, layout: layout) }

    /// The dock gives way to the bar on this window and this page (`DailyGate.hidesDock`).
    private var hidesDock: Bool { DailyGate.hidesDock(on: appState.horizon, edition: appState.edition, layout: layout) }

    /// The light half-open display is up over this Planner (`DailyGate.coversPage`). A light page
    /// stays as it was under it, drawn but inert (no touch, hidden from VoiceOver, its model
    /// `covered`: its bar cannot start and it takes no Tell), so nothing open on it is lost; the old
    /// page is taken away (`DailyGate.dropsPage`), since its own Tell sheet cannot be held back.
    private var covered: Bool { DailyGate.coversPage(edition: appState.edition, halfOpen: appState.posture.isHalfOpen) }

    var body: some View {
        ZStack {
            if DailyGate.dropsPage(covered: covered, lightPage: showsLight) {
                DailyPalette.sky.ignoresSafeArea()
            } else if showsLight, let level = DailyGate.mountain(appState.horizon) {
                mountain(level)
            } else if showsLight {
                light
            } else {
                full()
            }
        }
        .allowsHitTesting(!covered)
        .accessibilityHidden(covered)
        .background {
            Color.clear
                .onGeometryChange(for: CGSize.self) { $0.size } action: { size = TodayView.pinnedSize ?? $0 }
            WindowInsetsReader { insets = $0 }
        }
        .onAppear {
            // Appearing again (a sheet or a pushed page going away) keeps the model, its Undo and its lit row.
            if model == nil { makeModel() }
            if covered { model?.cover() }        // set down half open before the Planner appeared
            appState.dailyHidesDock = hidesDock
            openDemoPage()
        }
        .onChange(of: hidesDock) { _, hides in appState.dailyHidesDock = hides }
        // Set down half open: the page stays, inert, and lets go of the keyboard; its bar stops and
        // the display's own bar takes over. Opened flat: the page is as it was, on today's day.
        .onChange(of: covered) { _, covered in
            if covered {
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                model?.cover()
            } else {
                model?.uncover()
            }
        }
        // A walk shows over whatever light page is up: its bar never listens under it.
        .onChange(of: appState.walkShowing) { _, showing in model?.walkShowingChanged(showing) }
        // Gone (another tab, signed out, the household become full): the dock comes back, and the
        // model stops listening and cancels its timers (a pending pull-up is written).
        .onDisappear {
            appState.dailyHidesDock = false
            model?.close()
            model = nil
        }
        .onChange(of: auth.currentUser?.id) { _, _ in makeModel() }
        .onChange(of: scenePhase) { _, phase in model?.sceneChanged(DailyModel.Scene(phase)) }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                model?.refreshDay()
            }
        }
    }

    @ViewBuilder private var light: some View {
        if let model, let userId = auth.currentUser?.id {
            GeometryReader { proxy in
                let page = TodayView.pinnedSize ?? proxy.size
                switch appState.horizon {
                case .today:
                    LightTodayView(model: model, userId: userId, seasons: seasons, size: page,
                                   safeTop: insets.top, safeBottom: insets.bottom, layout: layout,
                                   go: go, open: open)
                        .frame(width: page.width, height: page.height)
                case .week:
                    LightWeekView(model: model, userId: userId, seasons: seasons, size: page,
                                  safeTop: insets.top, safeBottom: insets.bottom, layout: layout, go: go)
                        .frame(width: page.width, height: page.height)
                default:
                    full()      // a page the gate lists but this switch does not draw yet: the Planner every household has
                }
            }
            .ignoresSafeArea()
            .toolbar(.hidden, for: .navigationBar)
            .onDisappear { model.send(.left) }
        } else {
            DailyPalette.sky.ignoresSafeArea()
        }
    }

    /// Month, Season and Year: the mountain at that level, a fresh page for each.
    @ViewBuilder private func mountain(_ level: WalkLevel) -> some View {
        if let model, let userId = auth.currentUser?.id {
            GeometryReader { proxy in
                let page = TodayView.pinnedSize ?? proxy.size
                MountainPageView(level: level, model: model, userId: userId, size: page, safeTop: insets.top,
                                 safeBottom: insets.bottom, layout: layout, go: go)
                    .frame(width: page.width, height: page.height)
            }
            .ignoresSafeArea()
            .toolbar(.hidden, for: .navigationBar)
            .onDisappear { model.send(.left) }
            .id(level)
        } else {
            DailyPalette.sky.ignoresSafeArea()
        }
    }

    private func makeModel() {
        guard let userId = auth.currentUser?.id else {
            model?.close()
            model = nil
            return
        }
        model?.close()
        #if DEBUG
        let listener = DemoMode.isOn ? DemoMode.dailyListener : nil    // `-SymphonyDailyState speak`
        // A demo forgets the signs put away on earlier launches, as it forgets the walk.
        let memory = DemoMode.isOn ? DemoMode.signMemory : SignpostMemory()
        #else
        let listener: WalkListening? = nil
        let memory = SignpostMemory()
        #endif
        model = DailyModel(context: modelContext, userId: userId, seasons: seasons, listener: listener, memory: memory)
        if covered { model?.cover() }
    }

    /// A word in the row of words: the date the walk's period for it opens on, then the page.
    private func go(_ horizon: Horizon) {
        if let date = WalkPeriods.switcherDate(for: horizon, viewing: appState.horizon, edition: appState.edition,
                                               now: DailyClock.now(), seasons: seasons) {
            appState.selectedDate = date
        }
        appState.horizon = horizon
    }

    private func open(_ horizon: Horizon, _ date: Date) {
        appState.selectedDate = date
        appState.horizon = horizon
    }

    /// `-SymphonyDailyPage`: the demo opens on that page, once.
    private func openDemoPage() {
        #if DEBUG
        guard DemoMode.isOn, DemoMode.isDaily, !demoPageOpened, let page = DemoMode.dailyPage else { return }
        demoPageOpened = true
        go(page)
        #endif
    }
}

extension DailyModel.Scene {
    /// The scene's phase, as the model reads it (`DailyModel.sceneChanged`).
    init(_ phase: ScenePhase) {
        switch phase {
        case .active: self = .active
        case .background: self = .background
        default: self = .inactive
        }
    }
}

/// Reports the window's own safe-area insets, now and whenever they change (a turn, a
/// fold). The dock's inset is SwiftUI's, not the window's, so it is never counted.
private struct WindowInsetsReader: UIViewRepresentable {
    let onChange: (UIEdgeInsets) -> Void

    func makeUIView(context: Context) -> ReaderView {
        let view = ReaderView()
        view.onChange = onChange
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: ReaderView, context: Context) { view.onChange = onChange }

    final class ReaderView: UIView {
        var onChange: ((UIEdgeInsets) -> Void)?
        private var last: UIEdgeInsets?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            report()
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            report()
        }

        override func safeAreaInsetsDidChange() {
            super.safeAreaInsetsDidChange()
            report()
        }

        private func report() {
            guard let window, window.safeAreaInsets != last else { return }
            let insets = window.safeAreaInsets
            last = insets
            let onChange = onChange
            // After this layout pass: SwiftUI state can't change mid-layout.
            DispatchQueue.main.async { onChange?(insets) }
        }
    }
}
#endif
