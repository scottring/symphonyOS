import SwiftUI
import SwiftData
import UserNotifications

/// The Planner's Today: the displayed date's untimed work ("For today"), the
/// way into this week's shelf ("Choose from this week"), then the timed
/// schedule. Unfinished work is one calm line to review deliberately —
/// nothing carries forward on its own.
struct TodayView: View {
    /// Opens the horizon switcher (the title is its button).
    var onTitle: () -> Void = {}

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TimelineViewModel()
    @State private var calendar = GoogleCalendarService()
    @State private var showSearch = false
    @State private var searchText = ""
    @State private var showChooser = false
    @State private var showUnfinished = false
    @FocusState private var searchFocused: Bool

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

    var body: some View {
        let plan = plan
        let offerTasks = plan.chooserTasks(on: date).count
        let offerRoutines = plan.chooserRoutines(on: date).filter { !$0.chosen }.count

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.horizontal, 20)
                    .padding(.top, 8)

                if showSearch {
                    searchField
                        .padding(.horizontal, 20)
                        .padding(.top, 10)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                DomainSwitcher()
                    .padding(.horizontal, 20)
                    .padding(.top, 10)

                if isSearching {
                    searchResultsContent
                } else {
                    if !viewModel.carriedOverTasks.isEmpty {
                        let n = viewModel.carriedOverTasks.count
                        CalmRow(text: "Review \(n) unfinished \(n == 1 ? "item" : "items")") { showUnfinished = true }
                            .accessibilityHint("Decide what happens to each. Nothing moves on its own.")
                    }

                    let forToday = viewModel.forToday
                    if !forToday.isEmpty || offerTasks + offerRoutines > 0 {
                        Eyebrow(text: "For today")
                        ForEach(forToday) { item in card(item) }
                    }
                    if offerTasks + offerRoutines > 0 {
                        CalmRow(text: "Choose from this week", detail: offerDetail(offerTasks, offerRoutines)) {
                            showChooser = true
                        }
                    }

                    ForEach(TimelineViewModel.TimeSection.allCases, id: \.self) { section in
                        let items = viewModel.schedule.filter { viewModel.section(for: $0) == section }
                        if !items.isEmpty {
                            Eyebrow(text: section.rawValue)
                            ForEach(items) { item in card(item) }
                        }
                    }

                    if viewModel.timelineItems.isEmpty && viewModel.carriedOverTasks.isEmpty && offerTasks + offerRoutines == 0 {
                        emptyState.padding(.top, 60).frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(.bottom, 12)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.bgBase.ignoresSafeArea())
        // The capture bar is an inset, not an overlay: the list's scroll
        // extent ends above it, so the last card (and every subtask) can
        // always scroll fully into view — with the keyboard up too.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            QuickCaptureBar(userId: userId, defaultDate: date)
                .padding(.top, 4)
                .background(alignment: .bottom) {
                    LinearGradient(colors: [Color.bgBase.opacity(0), Color.bgBase], startPoint: .top, endPoint: .center)
                        .ignoresSafeArea()
                }
                .padding(.bottom, DockMetrics.height)
        }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .sheet(isPresented: $showChooser) {
            ChooserSheet(date: date)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showUnfinished) {
            UnfinishedSheet(tasks: viewModel.carriedOverTasks)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .onAppear { rebuildTimeline() }
        .task { await calendar.fetchEvents(for: date) }
        .onChange(of: appState.selectedDate) { _, _ in
            rebuildTimeline()
            Task { await calendar.fetchEvents(for: appState.selectedDate) }
        }
        .onChange(of: appState.domainFilter) { _, _ in rebuildTimeline() }
        .onChange(of: tasksRevision) { _, _ in rebuildTimeline() }
        .onChange(of: instancesRevision) { _, _ in rebuildTimeline() }
        .onChange(of: focusRows.count) { _, _ in rebuildTimeline() }
        .onChange(of: eventNotesRevision) { _, _ in rebuildTimeline() }
        .onChange(of: calendar.eventItems.count) { _, _ in rebuildTimeline() }
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
            subtitle: date.formatted(.dateTime.weekday(.wide).month(.wide).day()),
            onTitle: onTitle
        ) {
            HStack(spacing: 0) {
                CircleIconButton(systemImage: "magnifyingglass", label: showSearch ? "Close search" : "Search", active: showSearch) {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showSearch.toggle()
                        if !showSearch { searchText = "" }
                    }
                    searchFocused = showSearch
                }
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
            }
        }
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
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(Color.textTertiary)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
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

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 16) {
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.bgSurface)
                .frame(width: 64, height: 64)
                .overlay(
                    Image(systemName: "sun.max")
                        .font(.system(size: 28))
                        .foregroundStyle(Color.textTertiary)
                )
                .accessibilityHidden(true)

            Text("Your day is clear")
                .font(.displayMedium)
                .foregroundStyle(Color.textSecondary)

            Text("Add a task below to get started")
                .font(.bodySmall)
                .foregroundStyle(Color.textTertiary)
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
            eventItems: calendar.eventItems,
            eventNotes: eventNotes,
            focus: focusRows,
            userId: auth.currentUser?.id
        )
        NotificationManager.reconcile(allTasks)
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
