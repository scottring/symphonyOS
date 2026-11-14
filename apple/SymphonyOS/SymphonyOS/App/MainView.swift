import SwiftUI
import SwiftData
#if os(iOS)
import PhotosUI
#endif

struct MainView: View {
    var body: some View {
        #if os(iOS)
        iOSMainView()
        #else
        MacMainView()
            .onAppear { CalendarFeed.shared.edition = .full }   // the Mac app has no light edition
        #endif
    }
}

// MARK: - iOS Tab View

#if os(iOS)
struct iOSMainView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Query private var households: [Household]
    @State private var showCapture = false
    @State private var hinge: HingeReader.Reading?
    /// The walk, while it is open (`considerWalk()`).
    @State private var walk: WalkModel?
    /// The Debug demo's walk (`-SymphonyWalk`) opens once per launch.
    @State private var demoWalkOpened = false

    private var dock: some View {
        @Bindable var state = appState
        return SymphonyDock(activeTab: $state.activeTab, tabs: AppTab.visible(in: appState.edition)) { showCapture = true }
            // Report the dock's real height (it grows with text size) so the
            // floating capture bar and toolbars sit exactly above it.
            .background(GeometryReader { proxy in
                Color.clear
                    .onAppear { appState.dockHeight = proxy.size.height }
                    .onChange(of: proxy.size.height) { _, h in appState.dockHeight = h }
            })
    }

    /// The same dock as a side column, where the system puts its own bars
    /// (iPhone Duo: outside screen, and inside screen held sideways). There
    /// that's inside the status-bar column, below the clock and camera, so
    /// it's placed by the frame the system gives a bar of its width.
    @ViewBuilder private var sideDock: some View {
        @Bindable var state = appState
        let layout = appState.dockLayout
        if layout.edge != .bottom {
            ZStack(alignment: .topLeading) {
                Color.clear
                SymphonyDock(activeTab: $state.activeTab, tabs: AppTab.visible(in: appState.edition), edge: layout.edge, iconsOnly: layout.iconsOnly) { showCapture = true }
                    .frame(width: layout.frame.width, height: layout.frame.height, alignment: .top)
                    .offset(x: layout.frame.minX, y: layout.frame.minY)
            }
            .environment(\.layoutDirection, .leftToRight) // the frame is in window coordinates
            .ignoresSafeArea()
        }
    }

    /// The content stops at the side dock's inner side, which can sit
    /// further in than the safe area.
    private func sidePadding(_ edge: DockEdge) -> CGFloat {
        let layout = appState.dockLayout
        return layout.edge == edge ? max(0, layout.contentInset - layout.safeInset) : 0
    }

    private func applyEdition() {
        #if DEBUG
        let demoEdition: Edition? = DemoMode.isOn
            ? (ProcessInfo.processInfo.arguments.contains("-SymphonyLight") ? .light : .full) : nil
        #else
        let demoEdition: Edition? = nil
        #endif
        let edition: Edition
        if let demoEdition {
            edition = demoEdition
        } else {
            let memory = EditionMemory()
            let userId = auth.currentUser?.id
            let editions = households.map(\.edition)
            edition = Edition.resolve(editions, lastKnown: memory.lastKnown(for: userId))
            if !editions.isEmpty { memory.remember(edition, for: userId) }
        }
        let changedToLight = edition == .light && appState.edition != .light
        appState.edition = edition
        CalendarFeed.shared.edition = edition   // nil until here: no calendar read goes to the wrong source
        if changedToLight {
            if appState.activeTab == .routines { appState.activeTab = .planner }
            appState.domainFilter = .all
        }
    }

    var body: some View {
        @Bindable var state = appState
        Group {
            // The dock's `.safeAreaInset` was briefly attached to each
            // NavigationStack's OWN content (inside the stack) instead of here,
            // to get the floating QuickCaptureBar to see the reserved space
            // (see the padding comment in TodayView/InboxView). That traded one
            // bug for another: a NavigationLink push (More → Settings, say)
            // installs a new hosting controller that covers the root view the
            // inset was attached to, and the dock — living inside that same
            // view-controller boundary — went with it (F4). Attaching the inset
            // to this `Group`, OUTSIDE every NavigationStack, keeps the dock in
            // its own layer above the stack's own view-controller churn, so it
            // now survives pushes. The tradeoff: this boundary doesn't forward
            // the inset down into Today/Inbox's own content, so their floating
            // capture bar instead gets an explicit `.padding(.bottom:
            // SymphonyDock.height)` sized to match.
            switch state.activeTab {
            case .planner:
                NavigationStack { PlannerView() }
            case .inbox:
                NavigationStack { InboxView() }
            case .routines:
                NavigationStack { RoutineListView() }
            case .more:
                NavigationStack { MoreView() }
            }
        }
        // While typing, the keyboard owns the bottom edge: hide the dock so
        // the capture bar sits right on the keyboard instead of above a dock.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if appState.dockLayout.edge == .bottom && !appState.keyboardVisible { dock }
        }
        // A side dock leaves the bottom edge to the keyboard, so it stays up.
        .padding(.leading, sidePadding(.leading))
        .padding(.trailing, sidePadding(.trailing))
        .overlay { sideDock }
        .background {
            Color.bgBase.ignoresSafeArea()
            DockLayoutReader { layout in appState.dockLayout = layout }
            HingeReader { reading in hinge = reading }
        }
        .accessibilityHidden(walk != nil)
        // The walk covers the dock; the half-open display still covers the walk.
        .overlay {
            if let walk {
                WalkView(model: walk)
                    .id(ObjectIdentifier(walk))     // a new walk (a new day) starts with fresh view state
                    .transition(.opacity)
            }
        }
        // Set down partly open: the half-open display, over everything.
        .overlay {
            if appState.posture.isHalfOpen {
                HalfOpenView(posture: appState.posture)
                    .transition(.opacity)
            }
        }
        .onChange(of: hinge) { _, _ in updatePosture() }
        .onChange(of: appState.dockLayout) { _, _ in updatePosture() }
        // A walk there at launch (a resume) shows at once, with no fade over Today.
        .onAppear { updatePosture(); applyEdition(); considerWalk(animated: false) }
        // MainView is mounted only while signed in; forget the edition, and take
        // the walk down, when it goes.
        .onDisappear {
            CalendarFeed.shared.edition = nil
            closeWalk()
            appState.walkReplayRequested = false
            appState.walkResumeRequested = false
        }
        .onChange(of: households.map(\.edition)) { _, _ in applyEdition() }
        .onChange(of: appState.initialSyncFinished) { _, _ in considerWalk() }
        .onChange(of: appState.edition) { _, _ in considerWalk() }
        .onChange(of: appState.walkReplayRequested) { _, _ in considerWalk() }
        .onChange(of: appState.walkResumeRequested) { _, _ in considerWalk() }
        // Someone else signed in (or nobody is): the walk up, and a replay still
        // waiting, are not theirs.
        .onChange(of: auth.currentUser?.id) { _, _ in
            closeWalk()
            appState.walkReplayRequested = false
            appState.walkResumeRequested = false
            considerWalk()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            appState.keyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            appState.keyboardVisible = false
        }
        .sheet(isPresented: $showCapture) {
            if let userId = auth.currentUser?.id {
                CaptureSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
        .onChange(of: appState.posture) { _, posture in
            // Opening the phone flat after the last step leaves nothing to come back to.
            if posture == .flat, let cook = appState.cook, cook.isLast, cook.timer == nil { appState.cook = nil }
        }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            // A walk left up overnight reopens on today's periods.
            if let walk, WalkEntry.dayHasTurned(walkDay: walk.periods.today, now: .now) {
                closeWalk()
                considerWalk()
            }
            // Re-drive photo captures that never finished (offline snap, killed app).
            guard appState.edition.allows(.photoCapture) else { return }
            Task { await PhotoCaptureService.retryPending(modelContext: modelContext) }
        }
    }
}

extension iOSMainView {
    /// Opens the walk when `WalkEntry.decide` says so: by itself for a new person in a
    /// light household, resumed where it was left, replayed from Settings, or picked back up
    /// after Leave for now (`AppState.resumeWalk()`). Called on appear and whenever the first
    /// pull finishes, the edition changes, a replay or a resume is asked for or someone else
    /// signs in; each time it first reads whether a paused walk is waiting (`walkPaused`); it does nothing while a walk is up, and before the first
    /// pull only a resume or a replay may open (`WalkEntry.mayDecide`). It fades in, except
    /// on appear (`animated: false`), where it is there from the start. The households and
    /// goals are counted from the store as it is now, not from a `@Query` that may lag.
    ///
    /// Debug demo: `-SymphonyDemo -SymphonyWalk [-SymphonyWalkStep N] [-SymphonyWalkOrb …]`
    /// opens it once, over an empty in-memory store or over the mockup's preview at step N,
    /// then drives it into a state for a screenshot. A demo saves its position only in
    /// `DemoMode.walkStore`, emptied at launch, so Leave for now can be picked back up within one run.
    private func considerWalk(animated: Bool = true) {
        let userId = auth.currentUser?.id
        #if DEBUG
        let demo = DemoMode.isOn
        let demoWalk = demo && DemoMode.isWalk && !demoWalkOpened
        #else
        let demo = false
        let demoWalk = false
        #endif
        #if DEBUG
        let store: WalkPositionStore? = demo ? DemoMode.walkStore : WalkPositionStore()
        #else
        let store: WalkPositionStore? = WalkPositionStore()
        #endif
        let position = userId.flatMap { store?.load(for: $0) }
        appState.walkPaused = store?.hasPausedWalk(for: userId) ?? false
        // Oldest first, as sync picks the household whose settings the phone follows.
        let householdRows = (try? modelContext.fetch(FetchDescriptor<Household>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
        let replay = appState.walkReplayRequested
        let resume = appState.walkResumeRequested
        guard WalkEntry.mayDecide(walkUp: walk != nil, signedIn: auth.isAuthenticated && userId != nil,
                                  initialSyncFinished: appState.initialSyncFinished, position: position,
                                  replay: replay, resume: resume, householdEditions: householdRows.map(\.edition)),
              let userId else { return }
        if replay { appState.walkReplayRequested = false }
        if resume { appState.walkResumeRequested = false }
        let goalCount = (try? modelContext.fetchCount(FetchDescriptor<Goal>())) ?? 0
        let entry = WalkEntry.decide(replay: replay, resume: resume, demoWalk: demoWalk, position: position,
                                     householdEditions: householdRows.map(\.edition),
                                     initialSyncFinished: appState.initialSyncFinished, goalCount: goalCount)
        guard entry != .none else { return }
        // Walking the mountain again over a paused walk starts from the top and clears the pause.
        if WalkEntry.clearsPause(entry, position: position) {
            store?.forget(for: userId)
            appState.walkPaused = false
        }
        let opening: (entry: WalkEntry, position: WalkPosition?, listener: WalkListening?)
        #if DEBUG
        if demoWalk {
            demoWalkOpened = true
            let preview = DemoMode.walkStep.flatMap { DemoMode.walkPreview(step: $0, context: modelContext) }
            opening = (preview == nil ? .start : .resume, preview, DemoMode.walkListener)
        } else {
            opening = (entry, position, nil)
        }
        #else
        opening = (entry, position, nil)
        #endif
        // The edition from the same rows the decision read (the demo's is its launch argument).
        let edition = demo ? appState.edition
            : Edition.resolve(householdRows.map(\.edition), lastKnown: EditionMemory().lastKnown(for: userId))
        let model = WalkModel(context: modelContext, userId: userId, entry: opening.entry, position: opening.position,
                              edition: edition, seasons: householdRows.first?.seasons,
                              store: store, listener: opening.listener)
        model.onEnd = { _ in
            closeWalk()
            // Leave for now: Today, with the walk waiting to be picked up.
            appState.walkPaused = store?.hasPausedWalk(for: userId) ?? false
            appState.activeTab = .planner
            appState.horizon = .today
            appState.goToToday()
        }
        // Never under a sheet or behind a keyboard: whatever field has the keyboard lets it
        // go, and the dock's capture sheet closes. (Today's own Tell and Add sheets, and the
        // half-open display's Tell sheet, are kept by those views and can still sit above it.)
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        showCapture = false
        withAnimation(animated ? walkFade : nil) { walk = model }
        #if DEBUG
        // Driven once it is up, so a step that ends the walk (`leave`) takes it down as a person's would.
        if demoWalk { DemoMode.showWalk(model, DemoMode.walkOrb) }
        #endif
    }

    private var walkFade: Animation { .easeInOut(duration: reduceMotion ? 0.15 : 0.4) }

    /// Takes the walk down: listening is cancelled and its timers stop. What it planted
    /// is already saved, rows and position both.
    private func closeWalk() {
        guard let walk else { return }
        walk.close()
        withAnimation(walkFade) { self.walk = nil }
    }

    private func updatePosture() {
        let next: DuoPosture
        if let pinned = HalfOpen.pinned {
            next = pinned
            #if DEBUG
            if HalfOpen.pinnedCooking, appState.edition.allows(.dinner), appState.cook == nil, let dinner = DemoMode.dinner(on: .now) {
                appState.cook = CookSession(dinner: dinner)
            }
            #endif
        } else {
            next = HalfOpen.posture(angle: hinge?.angle, partlyOpen: hinge?.partlyOpen ?? false,
                                    fold: appState.dockLayout.fold, window: appState.dockLayout.window,
                                    current: appState.posture)
        }
        guard next != appState.posture else { return }
        withAnimation(.easeInOut(duration: 0.3)) { appState.posture = next }
    }
}

// MARK: - Dock metrics (shared with TodayView/InboxView's floating capture bar)

/// The dock's own content height above the home indicator — NOT the full
/// `.safeAreaInset` height (which also swallows the home indicator strip via
/// `ignoresSafeArea(edges: .bottom)`). Measured from the dock's accessibility
/// frame in the simulator: a tab button's frame spanned y 790.7–833.7 while
/// the window was 874pt tall, i.e. 43pt of visible tab content sits directly
/// above the (already-safe-area-respecting) bottom edge. TodayView/InboxView's
/// `VStack { Spacer(); QuickCaptureBar() }` pads its bottom by this amount so
/// the floating capture bar clears the dock (see F4 in MainView's iOSMainView).
#endif
enum DockMetrics {
    #if os(iOS)
    static let height: CGFloat = 43
    #else
    static let height: CGFloat = 0   // no dock on the Mac sidebar layout
    #endif
}
#if os(iOS)

// MARK: - Custom Dock (5 slots: Planner · Inbox · ＋ · Routines · More)

private struct SymphonyDock: View {
    @Binding var activeTab: AppTab
    /// The tabs this edition shows (`AppTab.visible(in:)`), in order.
    let tabs: [AppTab]
    var edge: DockEdge = .bottom
    /// The outside screen: icons alone, no + (Today's Tell bar has it).
    var iconsOnly = false
    var onAdd: () -> Void

    var body: some View {
        if edge == .bottom { bottomBar } else { sideColumn }
    }

    // Side column: "+" on top, then the tabs, as the system's vertical bars.
    private var sideColumn: some View {
        VStack(spacing: iconsOnly ? 14 : 4) {
            if !iconsOnly {
                addButton
                    .padding(.bottom, 10)
            }
            ForEach(tabs) { t in tab(t, icon: t.icon, label: t.rawValue) }
            Spacer(minLength: 0)
        }
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
        .padding(.top, 8)
    }

    private var bottomBar: some View {
        HStack(alignment: .center, spacing: 0) {
            ForEach(tabs.prefix(2)) { t in tab(t, icon: t.icon, label: t.rawValue) }
            addSlot
            ForEach(tabs.dropFirst(2)) { t in tab(t, icon: t.icon, label: t.rawValue) }
        }
        // Like the system tab bar: labels stop growing at a readable size and
        // the large-content viewer (long-press) shows them bigger.
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
        .padding(.top, 10)
        .padding(.horizontal, 6)
        .background(
            Color.bgBase.opacity(0.97)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.cardBorder).frame(height: 1)
                }
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func tab(_ t: AppTab, icon: String, label: String) -> some View {
        Button {
            activeTab = t
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: iconsOnly ? 21 : 20, weight: activeTab == t ? .semibold : .regular))
                if !iconsOnly { Text(label).font(.captionBold) }
            }
            .foregroundStyle(activeTab == t ? Color.ink : Color.textTertiary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(activeTab == t ? .isSelected : [])
        .accessibilityShowsLargeContentViewer {
            Image(systemName: icon)
            Text(label)
        }
    }

    // The center "+" is its own equal-width slot (so it sits between Inbox and
    // Projects without overlapping them) and is visually larger than the tabs.
    private var addSlot: some View {
        addButton
            .frame(maxWidth: .infinity)
            .offset(y: -8)
    }

    private var addButton: some View {
        Button(action: onAdd) {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.ink))
                .shadow(color: Color.cardShadow, radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Add")
    }
}

// MARK: - Capture Sheet (dock "+": typed capture, or snap a page → parse-page)

struct CaptureSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var appState
    @Query private var familyMembers: [FamilyMember]

    private enum Phase: Equatable {
        case idle
        case uploading
        case parsing(storagePath: String)
        /// `storagePath == nil` means the upload never succeeded (or the file
        /// couldn't even be decoded) — Retry must re-upload, not re-parse.
        case failed(storagePath: String?, message: String)
        case committing
    }

    @State private var phase: Phase = .idle
    @State private var showScanner = false
    @State private var showPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var review: PageResult?
    /// The JPEG bytes for the in-flight snap, kept until upload succeeds so a
    /// post-upload-failure Retry can re-upload without re-picking a photo.
    /// Cleared on upload success and on Cancel; left nil when the source data
    /// couldn't even be decoded (see `snap`), which is what hides Retry then.
    @State private var pendingJpeg: Data?
    /// Set when a commit finished with `outcome.failures > 0` — spec §4.7:
    /// failures are counted AND reported, not just felt as a haptic. The sheet
    /// stays up until the user acknowledges, then dismisses.
    @State private var commitFailureMessage: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                QuickCaptureBar(userId: userId)

                if appState.edition.allows(.paperCapture) {
                HStack(spacing: 12) {
                    captureOption(title: "Snap a page", systemImage: "doc.viewfinder") { showScanner = true }
                    captureOption(title: "Choose photo", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                }
                .padding(.horizontal, 16)

                Text("Photograph a handwritten plan. Every line lands on its day, this week, or the inbox — you review before anything is added.")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                }

                Spacer(minLength: 0)
            }
            .padding(.top, 12)
            .background(Color.bgBase)
            .navigationTitle("Add")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Add").font(.displayMedium).foregroundStyle(Color.textPrimary)
                }
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .overlay { progressOverlay }
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScanner { data in
                    showScanner = false
                    if let data { Task { await snap(imageData: data) } }
                }
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) { await snap(imageData: data) }
                    photoItem = nil
                }
            }
            .sheet(item: $review) { result in
                PageReviewSheet(result: result, members: familyMembers,
                                onCommit: { items, notes in
                                    review = nil
                                    Task { await commit(items: items, notes: notes, storagePath: result.storagePath) }
                                },
                                onCancel: { review = nil; phase = .idle })
            }
            .alert(alertTitle, isPresented: isFailed) {
                if case .failed(let path, _) = phase {
                    if let path {
                        // Parse failed; the image is already uploaded — retry
                        // parsing only, never re-upload.
                        Button("Retry") { Task { await parse(storagePath: path) } }
                    } else if pendingJpeg != nil {
                        // Upload failed (or never ran); the JPEG is still in
                        // memory — retry the upload.
                        Button("Retry") { Task { await retryUpload() } }
                    }
                    // else: the source data couldn't be decoded as an image
                    // at all (see `snap`) — retrying would just fail again,
                    // so no Retry button.
                }
                Button("Cancel", role: .cancel) { phase = .idle; pendingJpeg = nil }
            } message: {
                if case .failed(_, let message) = phase { Text(message) }
            }
            .alert("Some items couldn't be saved", isPresented: Binding(
                get: { commitFailureMessage != nil },
                set: { if !$0 { commitFailureMessage = nil } }
            )) {
                Button("OK") { commitFailureMessage = nil; dismiss() }
            } message: {
                Text(commitFailureMessage ?? "")
            }
        }
    }

    private var isFailed: Binding<Bool> {
        Binding(get: { if case .failed = phase { return true } else { return false } },
                set: { if !$0, case .failed = phase { phase = .idle } })
    }

    private var alertTitle: String {
        if case .failed(let path, _) = phase {
            return path == nil ? "Couldn't upload the page" : "Couldn't read the page"
        }
        return ""
    }

    @ViewBuilder
    private var progressOverlay: some View {
        switch phase {
        case .uploading, .parsing, .committing:
            VStack(spacing: 10) {
                ProgressView().controlSize(.large)
                Text(phase == .uploading ? "Uploading…" : phase == .committing ? "Adding…" : "Reading the page…")
                    .font(.bodySmall).foregroundStyle(Color.textSecondary)
            }
            .padding(24)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        default:
            EmptyView()
        }
    }

    private func captureOption(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage).font(.system(size: 24))
                Text(title).font(.captionBold)
            }
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .cardStyle(padding: 0)
        }
        .buttonStyle(.plain)
    }

    // MARK: Flow: upload → parse → review → commit

    private func snap(imageData: Data) async {
        guard let ui = UIImage(data: imageData) else {
            phase = .failed(storagePath: nil, message: "That file isn't an image.")
            return
        }
        let jpeg = ui.jpegData(compressionQuality: 0.8) ?? imageData
        pendingJpeg = jpeg
        await upload(jpeg: jpeg)
    }

    private func retryUpload() async {
        guard let jpeg = pendingJpeg else { phase = .idle; return }
        await upload(jpeg: jpeg)
    }

    private func upload(jpeg: Data) async {
        phase = .uploading
        do {
            let path = try await PageIngest.upload(jpeg: jpeg, userId: userId)
            pendingJpeg = nil
            await parse(storagePath: path)
        } catch {
            // Keep pendingJpeg — Retry re-uploads the same bytes, no re-pick.
            phase = .failed(storagePath: nil, message: "Upload failed: \(error.localizedDescription)")
        }
    }

    private func parse(storagePath: String) async {
        phase = .parsing(storagePath: storagePath)
        do {
            let result = try await PageIngest.parse(storagePath: storagePath, members: familyMembers)
            phase = .idle
            review = result
        } catch {
            // The image stays uploaded — Retry re-parses without re-uploading.
            phase = .failed(storagePath: storagePath, message: error.localizedDescription)
        }
    }

    private func commit(items: [PageItem], notes: [PageNote], storagePath: String?) async {
        phase = .committing
        let outcome = await PageIngest.commit(items: items, notes: notes, storagePath: storagePath,
                                              userId: userId, members: familyMembers, modelContext: modelContext)
        phase = .idle
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(outcome.failures == 0 ? .success : .warning)
        #endif
        // Failures are counted AND reported (spec §4.7) — don't dismiss silently;
        // let the user see that something didn't land before the sheet closes.
        guard outcome.failures > 0 else { dismiss(); return }
        let itemWord = outcome.failures == 1 ? "item" : "items"
        commitFailureMessage = "\(outcome.failures) \(itemWord) couldn't be saved. The page image is kept in your attachments."
    }
}
#endif

// MARK: - macOS Split View

#if os(macOS)
struct MacMainView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState
        NavigationSplitView {
            List(selection: $state.activeSidebarItem) {
                ForEach(SidebarItem.allCases) { item in
                    Label(item.rawValue, systemImage: item.icon)
                        .tag(item)
                }
            }
            .navigationTitle("Symphony")
        } detail: {
            switch appState.activeSidebarItem {
            case .today:
                TodayView()
            case .inbox:
                InboxView()
            case .projects:
                ProjectListView()
            case .routines:
                RoutineListView()
            case .contacts:
                ContactListView()
            case .settings:
                SettingsView()
            }
        }
    }
}
#endif

struct MoreView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            if [Feature.projects, .lists, .contacts].contains(where: { appState.edition.allows($0) }) {
            Section {
                // Routines moved to the dock; Projects moved here from it.
                if appState.edition.allows(.projects) {
                NavigationLink {
                    ProjectListView()
                } label: {
                    Label("Projects", systemImage: "folder")
                }
                }

                if appState.edition.allows(.lists) {
                NavigationLink {
                    ListsView()
                } label: {
                    Label("Lists", systemImage: "checklist")
                }
                }

                if appState.edition.allows(.contacts) {
                NavigationLink {
                    ContactListView()
                } label: {
                    Label("Contacts", systemImage: "person.2")
                }
                }
            }
            .listRowBackground(Color.bgElevated)
            }

            Section {
                NavigationLink {
                    CalendarSettingsView()
                } label: {
                    Label("Calendar", systemImage: "calendar")
                }

                NavigationLink {
                    SettingsView()
                } label: {
                    Label("Settings", systemImage: "gear")
                }
            }
            .listRowBackground(Color.bgElevated)

            Section {
                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .foregroundStyle(Color.feedbackRed)
            }
            .listRowBackground(Color.bgElevated)
        }
        .scrollContentBackground(.hidden)
        .background(Color.bgBase)
        .navigationTitle("More")
    }
}

