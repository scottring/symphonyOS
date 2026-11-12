import SwiftUI
import SwiftData
import UserNotifications

/// The Planner's Today: the displayed date's untimed work ("For today"), the
/// way into this week's shelf ("Choose from this week"), tonight's dinner,
/// then the day drawn to scale ("The day", as on the web since 2026-10-06).
/// Unfinished work is one calm line to review deliberately — nothing carries
/// forward on its own.
struct TodayView: View {
    /// Opens the horizon switcher (the title is its button).
    var onTitle: () -> Void = {}

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TimelineViewModel()
    @State private var calendar = GoogleCalendarService.shared
    @State private var dinners = DinnerService.shared
    @State private var showSearch = false
    @State private var searchText = ""
    @State private var showChooser = false
    @State private var showUnfinished = false
    /// A thing tapped on the day column, opened in its details.
    @State private var opened: TimelineItem?
    @Query private var familyMembers: [FamilyMember]
    @FocusState private var searchFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize

    @Query private var allTasks: [SymphonyTask]
    @Query private var routines: [Routine]
    @Query private var instances: [ActionableInstance]
    @Query private var eventNotes: [EventNote]
    @Query private var focusRows: [TaskFocus]
    @Query private var commitments: [TaskCommitment]

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var date: Date { appState.selectedDate }

    private var plan: PlanSnapshot {
        PlanSnapshot(tasks: allTasks, commitments: commitments, focus: focusRows, routines: routines,
                     instances: instances, userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
    }

    /// The night's planned dinner, when the view includes family (meals are
    /// the household's; a Work or Personal view leaves them out).
    private var dinner: Dinner? {
        let context = appState.domainFilter.contextValue
        guard context == nil || context == "family" else { return nil }
        return dinners.dinner(on: date)
    }

    /// Which Today this window gets (TodayLayout: one per iPhone Duo screen
    /// and way of holding it; a regular iPhone keeps its one column). The
    /// window's shape decides, not the device, as Apple's Duo guidance asks.
    @State private var size: CGSize = .zero
    private var layout: TodayLayout {
        #if os(iOS)
        let sideBars = appState.dockLayout.edge != .bottom
        #else
        let sideBars = false
        #endif
        return TodayLayout.decide(width: size.width, height: size.height, sideBars: sideBars)
    }
    #if DEBUG
    static let pinnedSize: CGSize? = {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-TodaySize"), i + 1 < args.count else { return nil }
        let parts = args[i + 1].split(separator: "x").compactMap { Double($0) }
        return parts.count == 2 ? CGSize(width: parts[0], height: parts[1]) : nil
    }()
    #else
    static let pinnedSize: CGSize? = nil
    #endif
    @State private var showWholeDay = false
    @State private var showWeek = false
    @State private var showTell = false
    /// The outside screen's quick add (the Tell bar's +).
    @State private var showAdd = false
    /// The day as a short list, or to scale (web "Show hours"); remembered.
    @AppStorage("today.showHours") private var showHours = false

    var body: some View {
        Group {
            switch layout {
            case .journal: journal
            case .dayPage: dayPage
            case .glance: glance
            case .glanceWide: glanceWide
            case .oneColumn: oneColumn
            }
        }
        #if DEBUG
        // Debug builds only: `-TodaySize 818x626` pins Today to a Duo screen's
        // size on any simulator, to check each layout without folding one.
        .frame(width: Self.pinnedSize?.width, height: Self.pinnedSize?.height)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        #endif
        .onGeometryChange(for: CGSize.self) { $0.size } action: { size = Self.pinnedSize ?? $0 }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.bgBase.ignoresSafeArea())
        .statusBarScrim()
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .sheet(isPresented: $showChooser) {
            ChooserSheet(date: date)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $opened) { item in openedDetail(item) }
        .sheet(isPresented: $showUnfinished) {
            UnfinishedSheet(tasks: viewModel.carriedOverTasks)
                .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showTell) {
            TellSheet(userId: userId).presentationDetents([.medium, .large])
        }
        #if os(iOS)
        .sheet(isPresented: $showAdd) {
            CaptureSheet(userId: userId).presentationDetents([.medium])
        }
        #endif
        // Rebuild from the shared cache first (no blank schedule on return),
        // then refresh the day in the background.
        .onAppear { rebuildTimeline() }
        .task { await calendar.refresh(date, maxAge: 60) }
        .task { await dinners.refresh(date) }
        .onChange(of: appState.selectedDate) { _, _ in
            rebuildTimeline()
            Task { await calendar.refresh(appState.selectedDate, maxAge: 60) }
            Task { await dinners.refresh(appState.selectedDate) }
        }
        .onChange(of: appState.domainFilter) { _, _ in rebuildTimeline() }
        .onChange(of: tasksRevision) { _, _ in rebuildTimeline() }
        .onChange(of: instancesRevision) { _, _ in rebuildTimeline() }
        .onChange(of: focusRows.count) { _, _ in rebuildTimeline() }
        .onChange(of: eventNotesRevision) { _, _ in rebuildTimeline() }
        .onChange(of: eventsRevision) { _, _ in rebuildTimeline() }
        // Tell from the Lock Screen control or a symphony://tell link.
        .onChange(of: appState.tellRequested) { _, asked in
            if asked { appState.tellRequested = false; showTell = true }
        }
        .onAppear { if appState.tellRequested { appState.tellRequested = false; showTell = true } }
    }

    // MARK: - Layouts

    private var oneColumn: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                topControls
                if isSearching {
                    searchResultsContent
                } else {
                    lists
                    day
                }
            }
            .padding(.bottom, 12)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { captureBar }
    }

    /// Outside screen, upright (the approved 2026-11-12 mockup): the date on
    /// one line, what's on now, To do in one row style with finished items
    /// folded away, and the Tell bar. Swipe sideways for another day.
    private var glance: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                GlanceHeading(date: date)
                    .padding(.top, 14)
                GlanceNow(items: viewModel.schedule, isToday: appState.isToday) { opened = $0 }
                    .padding(.top, 8)
                glanceLists
                    .padding(.top, 22)
            }
            .padding(.leading, 20)
            .padding(.trailing, 12)
            .padding(.bottom, 16)
        }
        .simultaneousGesture(daySwipe)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            glanceTellBar
                .padding(.leading, 16)
                .padding(.trailing, 8)
                .padding(.vertical, 8)
                .background(Color.bgBase)
        }
        .safeAreaPadding(.bottom, appState.bottomInset)
    }

    /// Outside screen held sideways (any short, wide window): the date, now
    /// and the Tell bar on the left; To do on the right.
    private var glanceWide: some View {
        HStack(alignment: .top, spacing: 20) {
            VStack(alignment: .leading, spacing: 0) {
                GlanceHeading(date: date)
                GlanceNow(items: viewModel.schedule, isToday: appState.isToday) { opened = $0 }
                    .padding(.top, 10)
                Spacer(minLength: 12)
                glanceTellBar
            }
            .frame(width: min(270, size.width * 0.42))
            .padding(.vertical, 12)
            ScrollView {
                glanceLists
                    .padding(.vertical, 12)
            }
            .frame(maxWidth: .infinity)
            .simultaneousGesture(daySwipe)
        }
        .padding(.leading, 20)
        .padding(.trailing, 8)
        .safeAreaPadding(.bottom, appState.bottomInset)
    }

    /// The outside screen's lists: routines kept until done, To do, a review
    /// of anything unfinished, tonight's dinner.
    @ViewBuilder
    private var glanceLists: some View {
        let carried = appState.isToday
            ? CarriedRoutines.select(routines: routines, instances: instances, today: .now,
                                     domain: appState.domainFilter.contextValue)
            : []
        if !carried.isEmpty {
            StillToDo(carried: carried, today: .now,
                      onDone: { c in settleCarried(c, status: "completed") },
                      onSkip: { c in settleCarried(c, status: "skipped") },
                      plain: true)
            Color.clear.frame(height: 18)
        }
        GlanceToDoList(items: viewModel.forToday, date: date, userId: userId) { opened = $0 }
        if !viewModel.carriedOverTasks.isEmpty {
            let n = viewModel.carriedOverTasks.count
            CalmRow(text: "Review \(n) unfinished \(n == 1 ? "item" : "items")") { showUnfinished = true }
                .padding(.horizontal, -20)
                .padding(.top, 4)
                .accessibilityHint("Decide what happens to each. Nothing moves on its own.")
        }
        if let dinner {
            GlanceDinner(dinner: dinner)
                .padding(.top, 4)
        }
    }

    private var glanceTellBar: some View {
        GlanceTellBar(onTell: { showTell = true }, onAdd: { showAdd = true })
    }

    /// A sideways swipe on the outside screen turns the day.
    private var daySwipe: some Gesture {
        DragGesture(minimumDistance: 30)
            .onEnded { value in
                let dx = value.translation.width, dy = value.translation.height
                guard abs(dx) > 70, abs(dx) > abs(dy) * 2 else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    if dx < 0 { appState.goToNextDay() } else { appState.goToPreviousDay() }
                }
            }
    }

    /// Inside screen, upright: the day page fills the screen; the week hangs
    /// from its top as one line and unfolds over it.
    private var dayPage: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                weekStrip
                if showWeek {
                    WeekPage(date: date, plan: plan, userId: userId)
                        .padding(.horizontal, 22)
                        .padding(.vertical, 12)
                        .background(Color.bgWarm)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }
                pageHead
                    .padding(.horizontal, 22)
                    .padding(.top, 12)
                dayAndToDo(pageWidth: size.width)
            }
            .padding(.bottom, 12)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { captureBar }
    }

    /// Inside screen, sideways: the open journal — the week page on the left,
    /// the day page on the right, meeting at the fold when it runs top to
    /// bottom (iPhone Duo half-open like a book).
    private var journal: some View {
        HStack(spacing: 0) {
            ScrollView {
                WeekPage(date: date, plan: plan, userId: userId)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
            }
            .frame(width: weekPageWidth)
            .background(Color.bgWarm)
            .safeAreaPadding(.bottom, appState.bottomInset)

            Rectangle().fill(Color.cardBorder).frame(width: 1).ignoresSafeArea(edges: .vertical)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    pageHead
                        .padding(.horizontal, 24)
                        .padding(.top, 8)
                    if isSearching { searchResultsContent } else {
                        dayAndToDo(pageWidth: size.width - weekPageWidth)
                    }
                }
                .padding(.bottom, 12)
            }
            .frame(maxWidth: .infinity)
            .safeAreaInset(edge: .bottom, spacing: 0) { captureBar }
        }
    }

    /// The week page's width: about a third of the screen. The Duo reports
    /// its hinge even when it lies flat, and the screen has no crease, so the
    /// split follows the content, not the hinge (paper-style horizons spec).
    private var weekPageWidth: CGFloat {
        min(360, max(280, (size.width * 0.34).rounded()))
    }

    /// How much wider text makes everything (Dynamic Type), for deciding
    /// whether two columns still fit.
    private var textScale: CGFloat {
        switch typeSize {
        case .xSmall, .small, .medium, .large: 1.0
        case .xLarge: 1.1
        case .xxLarge: 1.2
        case .xxxLarge: 1.3
        default: 1.7
        }
    }

    /// The day and To do side by side only when each gets a real column at
    /// this text size (Scott, 2026-11-11: on the Duo they were squeezed to a
    /// letter a line); otherwise one under the other.
    @ViewBuilder
    private func dayAndToDo(pageWidth: CGFloat) -> some View {
        if pageWidth >= 640 * textScale {
            HStack(alignment: .top, spacing: 18) {
                VStack(alignment: .leading, spacing: 0) { dayList }
                    .frame(maxWidth: .infinity, alignment: .leading)
                VStack(alignment: .leading, spacing: 0) { lists }
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.leading, 8)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                dayList
                lists
            }
            .padding(.leading, 8)
        }
    }

    /// The day page's heading: the one-line date and the day in a sentence.
    private var pageHead: some View {
        VStack(alignment: .leading, spacing: 6) {
            JournalHeading(date: date)
            if let sentence = DaySentence.make(schedule: viewModel.schedule, toDo: viewModel.forToday.filter { !$0.completed }.count,
                                               now: .now, isToday: appState.isToday) {
                Text(sentence)
                    .font(.custom("CrimsonPro-Italic", size: 18))
                    .foregroundStyle(Color.textSecondary)
            }
            if showSearch {
                searchField.padding(.top, 6)
            }
        }
        .padding(.bottom, 6)
    }

    /// The week as one line across the top of the upright inside screen.
    private var weekStrip: some View {
        let count = plan.chooserTasks(on: date).count + plan.chooserRoutines(on: date).filter { !$0.chosen }.count
        return Button {
            withAnimation(.easeInOut(duration: 0.25)) { showWeek.toggle() }
        } label: {
            HStack {
                Text(count > 0 ? "This week · \(count) to pick from" : "This week")
                    .font(.bodySmallBold).foregroundStyle(Color.textSecondary)
                Spacer()
                Text(showWeek ? "Fold up" : "Unfold")
                    .font(.bodySmall).foregroundStyle(Color.ink)
                Image(systemName: showWeek ? "chevron.up" : "chevron.down")
                    .font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink)
            }
            .padding(.horizontal, 22)
            .frame(minHeight: 44)
            .background(Color.bgWarm)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(showWeek ? "Folds the week away" : "Shows this week's tasks and routines to pick from")
    }

    /// The day as a short list, or to scale with Show hours.
    @ViewBuilder
    private var dayList: some View {
        HStack(alignment: .firstTextBaseline) {
            Text("The day").eyebrowStyle().accessibilityAddTraits(.isHeader)
            Spacer()
            Button(showHours ? "Short list" : "Show hours") {
                withAnimation(.easeInOut(duration: 0.2)) { showHours.toggle() }
            }
            .font(.bodySmall).foregroundStyle(Color.ink).buttonStyle(.plain)
            .frame(minHeight: 44)
        }
        .padding(.horizontal, 14)
        .padding(.top, 6)
        if showHours {
            TodayDayColumn(items: viewModel.schedule, isToday: appState.isToday, members: familyMembers) { opened = $0 }
                .padding(.horizontal, 8)
        } else {
            DayAgendaList(items: viewModel.schedule, isToday: appState.isToday) { opened = $0 }
                .padding(.horizontal, 8)
        }
    }

    private var topControls: some View {
        Group {
            header
                .padding(.horizontal, 20)
                .padding(.top, 4)

            if showSearch {
                searchField
                    .padding(.horizontal, 20)
                    .padding(.top, 10)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    /// For today, the way into this week's shelf, and tonight's dinner.
    @ViewBuilder
    private var lists: some View {
        let plan = plan
        let dinner = dinner
        let offerTasks = plan.chooserTasks(on: date).count
        let offerRoutines = plan.chooserRoutines(on: date).filter { !$0.chosen }.count

        if !viewModel.carriedOverTasks.isEmpty {
            let n = viewModel.carriedOverTasks.count
            CalmRow(text: "Review \(n) unfinished \(n == 1 ? "item" : "items")") { showUnfinished = true }
                .accessibilityHint("Decide what happens to each. Nothing moves on its own.")
        }

        // "Keep it until it's done": a missed routine stays on today until
        // ticked off or skipped (CarriedRoutines, as on the web).
        if appState.isToday {
            StillToDo(carried: CarriedRoutines.select(routines: routines, instances: instances, today: .now,
                                                      domain: appState.domainFilter.contextValue),
                      today: .now,
                      onDone: { c in settleCarried(c, status: "completed") },
                      onSkip: { c in settleCarried(c, status: "skipped") })
        }

        let forToday = viewModel.forToday
        if !forToday.isEmpty || offerTasks + offerRoutines > 0 {
            Eyebrow(text: "To do")
            ForEach(forToday) { item in card(item) }
        }
        // Beside the week page (the Duo's inside screen) the week is already
        // there to pick from; elsewhere this line leads to it.
        if offerTasks + offerRoutines > 0 && layout != .journal && layout != .dayPage {
            CalmRow(text: "Choose from this week", detail: offerDetail(offerTasks, offerRoutines),
                    shortDetail: "\(offerTasks + offerRoutines)") {
                showChooser = true
            }
        }

        // Tonight's dinner, after what you chose and before the
        // timed day (Scott, 2026-10-07).
        if let dinner {
            Eyebrow(text: appState.isToday ? "Dinner tonight" : "Dinner")
            DinnerCard(dinner: dinner)
                .padding(.horizontal, 16)
                .padding(.vertical, 3)
        }
    }

    /// The day, to scale — every timed thing where it falls, free time named.
    /// Always drawn: an empty day says so.
    @ViewBuilder
    private var day: some View {
        Eyebrow(text: "The day")
        TodayDayColumn(items: viewModel.schedule, isToday: appState.isToday,
                       members: familyMembers) { opened = $0 }
            .padding(.horizontal, 16)
            .padding(.top, 6)

        // First visit to a day: say the calendar is coming instead
        // of showing an empty schedule that then fills in.
        let eventsPending = calendar.items(for: date) == nil && calendar.isLoading(date)
        if eventsPending {
            CalendarLoadingRow()
                .padding(.horizontal, 20)
                .padding(.top, 18)
        }
    }

    // The capture bar is an inset, not an overlay: the list's scroll
    // extent ends above it, so the last card (and every subtask) can
    // always scroll fully into view — with the keyboard up too.
    private var captureBar: some View {
        QuickCaptureBar(userId: userId, defaultDate: date)
            .padding(.top, 4)
            .background(alignment: .bottom) {
                LinearGradient(colors: [Color.bgBase.opacity(0), Color.bgBase], startPoint: .top, endPoint: .center)
                    .ignoresSafeArea()
            }
            .padding(.bottom, appState.bottomInset)
    }

    /// What a tap on the day column opens: a task's details, an event's, or
    /// the routine occurrence (Done / Move / Skip / Edit routine).
    @ViewBuilder
    private func openedDetail(_ item: TimelineItem) -> some View {
        switch item.type {
        case .task:
            if let task = allTasks.first(where: { $0.id == item.entityId }) {
                NavigationStack {
                    TaskDetailView(task: task)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { opened = nil } } }
                }
                .presentationDetents([.large, .medium])
            }
        case .routine:
            if let routine = routines.first(where: { $0.id == item.entityId }) {
                RoutineOccurrenceSheet(routine: routine, date: date, completed: item.completed)
                    .presentationDetents([.medium, .large])
            }
        case .event:
            if let key = item.eventKey {
                NavigationStack {
                    EventDetailView(googleEventId: key, eventTitle: item.title, eventStart: item.startTime,
                                    eventLocation: item.location, recurringEventId: item.recurringEventId,
                                    date: date, userId: userId)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { opened = nil } } }
                }
                .presentationDetents([.large, .medium])
            }
        }
    }

    /// Done or Skip on a carried routine writes its ORIGINAL occurrence.
    private func settleCarried(_ c: CarriedRoutines.Carried, status: String) {
        withAnimation(.easeInOut(duration: 0.2)) {
            PlanWriter(context: modelContext, userId: userId)
                .setOccurrence(entityType: "routine", entityId: c.routine.id.uuidString.lowercased(), on: c.date, status: status)
        }
    }

    private func card(_ item: TimelineItem) -> some View {
        TimelineItemCard(item: item, modelContext: modelContext, userId: userId, date: date)
            .padding(.horizontal, 16)
            .padding(.vertical, 3)
    }

    private func offerDetail(_ tasks: Int, _ routines: Int) -> String {
        var parts: [String] = []
        if tasks > 0 { parts.append("\(tasks) \(tasks == 1 ? "task" : "tasks")") }
        if routines > 0 { parts.append("\(routines) \(routines == 1 ? "routine" : "routines")") }
        return parts.joined(separator: " · ")
    }

    // MARK: - Header

    private var header: some View {
        PlannerHeader(
            title: appState.isToday ? "Today" : date.formatted(.dateTime.weekday(.wide)),
            // Short, so the controls share the title's line (Scott, 2026-11-08).
            subtitle: appState.isToday
                ? date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
                : date.formatted(.dateTime.month(.wide).day()),
            onTitle: onTitle
        ) {
            HStack(spacing: 0) {
                DomainMenu()
                CircleIconButton(systemImage: "chevron.left", label: "Previous day") {
                    withAnimation(.easeInOut(duration: 0.2)) { appState.goToPreviousDay() }
                }
                if !appState.isToday {
                    Button("Today") { withAnimation(.easeInOut(duration: 0.2)) { appState.goToToday() } }
                        .font(.captionBold)
                        .foregroundStyle(Color.ink)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(Color.bgWarm, in: Capsule())
                        .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
                        .frame(minHeight: 44)
                        .buttonStyle(.plain)
                }
                CircleIconButton(systemImage: "chevron.right", label: "Next day") {
                    withAnimation(.easeInOut(duration: 0.2)) { appState.goToNextDay() }
                }
                PlannerOptionsMenu {
                    Button { openSearch() } label: { Label("Search tasks", systemImage: "magnifyingglass") }
                }
            }
        }
    }

    private func openSearch() {
        withAnimation(.easeInOut(duration: 0.2)) { showSearch = true }
        searchFocused = true
    }

    private func closeSearch() {
        withAnimation(.easeInOut(duration: 0.2)) {
            showSearch = false
            searchText = ""
        }
        searchFocused = false
    }

    // MARK: - Search

    private var isSearching: Bool {
        showSearch && !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var searchResults: [SymphonyTask] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return allTasks
            .filter { $0.parentTaskId == nil }
            .filter { $0.title.lowercased().contains(q) || ($0.notes?.lowercased().contains(q) ?? false) }
            .sorted { $0.title.lowercased() < $1.title.lowercased() }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(Color.textTertiary)
            TextField("Search tasks…", text: $searchText)
                .font(.bodyMedium)
                .foregroundStyle(Color.textPrimary)
                .focused($searchFocused)
                .autocorrectionDisabled()
                .submitLabel(.search)
            // Search lives in ⋯ now, so the field closes itself.
            Button { closeSearch() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundStyle(Color.textTertiary)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close search")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 4)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.cardBorder, lineWidth: 1))
    }

    @ViewBuilder
    private var searchResultsContent: some View {
        if searchResults.isEmpty {
            VStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 28))
                    .foregroundStyle(Color.textTertiary)
                Text("No matches")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 60)
        } else {
            Eyebrow(text: "Results", count: searchResults.count)
            ForEach(searchResults, id: \.id) { task in
                PlanTaskRow(task: task)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 3)
            }
        }
    }

    // MARK: - Rebuild triggers

    /// A content fingerprint of the task list — completion/reschedule/edits
    /// leave the count unchanged, so keying on count alone went stale.
    private var tasksRevision: Int {
        var hasher = Hasher()
        hasher.combine(allTasks.count)
        for task in allTasks {
            hasher.combine(task.id)
            hasher.combine(task.completed)
            hasher.combine(task.scheduledFor)
            hasher.combine(task.bucket)
            hasher.combine(task.title)
            hasher.combine(task.notes)
            hasher.combine(task.phoneNumber)
            hasher.combine(task.links?.count)
            hasher.combine(task.location)
            hasher.combine(task.parentTaskId)
            hasher.combine(task.captureId)
            hasher.combine(task.scope)
            hasher.combine(task.context)
            hasher.combine(task.assignedTo)
            hasher.combine(task.assignedToAll?.count)
        }
        return hasher.finalize()
    }

    /// Changes when the displayed day's cached events arrive or change.
    private var eventsRevision: Int {
        var hasher = Hasher()
        let items = calendar.items(for: appState.selectedDate)
        hasher.combine(items == nil)
        for item in items ?? [] {
            hasher.combine(item.id)
            hasher.combine(item.startTime)
            hasher.combine(item.title)
        }
        return hasher.finalize()
    }

    private var eventNotesRevision: Int {
        var hasher = Hasher()
        hasher.combine(eventNotes.count)
        for note in eventNotes {
            hasher.combine(note.id)
            hasher.combine(note.notes)
            hasher.combine(note.links?.count)
            hasher.combine(note.isFree)
        }
        return hasher.finalize()
    }

    /// Routine completions and choices write `ActionableInstance` in place.
    private var instancesRevision: Int {
        var hasher = Hasher()
        hasher.combine(instances.count)
        for instance in instances {
            hasher.combine(instance.id)
            hasher.combine(instance.status)
            hasher.combine(instance.plannedOn)
            hasher.combine(instance.deferredTo)
        }
        return hasher.finalize()
    }

    private func rebuildTimeline() {
        viewModel.buildTimeline(
            tasks: allTasks,
            routines: routines,
            instances: instances,
            date: appState.selectedDate,
            domainFilter: appState.domainFilter,
            eventItems: calendar.items(for: appState.selectedDate) ?? [],
            eventNotes: eventNotes,
            focus: focusRows,
            userId: auth.currentUser?.id
        )
        NotificationManager.reconcile(allTasks)
        #if os(iOS)
        // The Lock Screen's next up follows today's schedule.
        NextUpActivity.sync(items: viewModel.schedule, isToday: appState.isToday)
        #endif
    }
}

// MARK: - Local notifications

/// Schedules a local reminder at each timed task's time. No server/APNs needed —
/// works on any signing configuration.
enum NotificationManager {
    static func requestAuthorization() {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    /// Reconcile scheduled reminders with the current tasks: one per timed,
    /// future, incomplete task. Re-built each call so reschedules are reflected.
    static func reconcile(_ tasks: [SymphonyTask]) {
        let center = UNUserNotificationCenter.current()
        let now = Date()
        let due = tasks.filter { !$0.completed && !$0.isAllDay && ($0.scheduledFor ?? .distantPast) > now }

        center.removeAllPendingNotificationRequests()
        for task in due {
            guard let when = task.scheduledFor else { continue }
            let content = UNMutableNotificationContent()
            content.title = task.title
            if let ctx = task.context { content.subtitle = ctx.capitalized }
            content.sound = .default
            let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: when)
            let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)
            center.add(UNNotificationRequest(identifier: task.id.uuidString, content: content, trigger: trigger))
        }
    }
}
