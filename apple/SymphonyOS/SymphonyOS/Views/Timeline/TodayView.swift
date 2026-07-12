import SwiftUI
import SwiftData
import UserNotifications

struct TodayView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TimelineViewModel()
    @State private var calendar = GoogleCalendarService()
    @State private var showSearch = false
    @State private var searchText = ""
    @FocusState private var searchFocused: Bool
    // Lets a swiped SlideRow freeze this ScrollView so the swipe wins the touch.
    @State private var scrollLock = SlideScrollLock()

    // SwiftData queries
    @Query private var allTasks: [SymphonyTask]
    @Query(filter: #Predicate<Routine> { $0.visibility == "active" })
    private var routines: [Routine]
    @Query private var instances: [ActionableInstance]
    @Query private var playbookBlocks: [PlaybookBlock]
    @Query private var playbookInstances: [PlaybookInstance]

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            VStack(spacing: 0) {
                // Editorial header
                editorialHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                // Search field — drops down from the search icon in the header
                if showSearch {
                    searchField
                        .padding(.horizontal, 20)
                        .padding(.bottom, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
                }

                // Domain switcher
                DomainSwitcher()
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)

                // Timeline
                ScrollView {
                    LazyVStack(spacing: 0) {
                        if isSearching {
                            searchResultsContent
                        } else {
                        // Carried over (overdue) — mirrors the web's OverdueSection, at the top.
                        if !viewModel.carriedOverTasks.isEmpty {
                            InboxSectionView(
                                title: "Carried over",
                                tasks: viewModel.carriedOverTasks,
                                modelContext: modelContext,
                                userId: auth.currentUser?.id ?? UUID()
                            )
                        }

                        // Time-of-day sections (All Day, Morning, Afternoon, Evening)
                        ForEach(TimelineViewModel.TimeSection.allCases, id: \.self) { section in
                            let sectionItems = viewModel.timelineItems.filter { viewModel.section(for: $0) == section }
                            if !sectionItems.isEmpty {
                                TimelineSectionView(
                                    title: section.rawValue,
                                    items: sectionItems,
                                    modelContext: modelContext,
                                    userId: auth.currentUser?.id ?? UUID(),
                                    date: appState.selectedDate
                                )
                            }
                        }

                        // NOTE: no inbox/"Unscheduled" section here — the web Today
                        // page doesn't show the inbox; it lives in the Inbox tab.

                        // Empty state
                        if viewModel.timelineItems.isEmpty && viewModel.carriedOverTasks.isEmpty {
                            emptyState
                                .padding(.top, 60)
                        }
                        } // end: not searching
                    }
                    .padding(.bottom, 80) // Space for quick capture bar
                    .environment(scrollLock)
                }
                .scrollDisabled(scrollLock.locked)
            }

            // Quick capture bar
            if let userId = auth.currentUser?.id {
                VStack {
                    Spacer()
                    QuickCaptureBar(userId: userId, defaultDate: appState.selectedDate)
                }
            }
        }
        #if os(iOS)
        .toolbar(.hidden, for: .navigationBar)
        #endif
        .onAppear { rebuildTimeline() }
        .task { await calendar.fetchEvents(for: appState.selectedDate) }
        .onChange(of: appState.selectedDate) { _, _ in
            rebuildTimeline()
            Task { await calendar.fetchEvents(for: appState.selectedDate) }
        }
        .onChange(of: appState.domainFilter) { _, _ in rebuildTimeline() }
        // Rebuild on task CONTENT changes, not just count: completing or
        // rescheduling a task leaves the count unchanged, so keying on
        // `allTasks.count` never fired — the row mutated in SwiftData but the
        // carried-over/timeline snapshot stayed stale (visible completion bug).
        .onChange(of: tasksRevision) { _, _ in rebuildTimeline() }
        .onChange(of: instancesRevision) { _, _ in rebuildTimeline() }
        .onChange(of: playbookInstances.count) { _, _ in rebuildTimeline() }
        // Google events arrived (or changed) → fold them into the timeline.
        .onChange(of: calendar.eventItems.count) { _, _ in rebuildTimeline() }
    }

    // MARK: - Editorial Header

    private var editorialHeader: some View {
        HStack(alignment: .bottom) {
            // Left: Title + date
            VStack(alignment: .leading, spacing: 2) {
                Text(appState.isToday ? "Today" : appState.selectedDate.formatted(.dateTime.weekday(.wide)))
                    .font(.displayLarge)
                    .foregroundStyle(Color.textPrimary)

                Text(appState.selectedDate.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }

            Spacer()

            // Right: Day navigation arrows
            HStack(spacing: 12) {
                // Search — drops down a search field below the header
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        showSearch.toggle()
                        if !showSearch { searchText = "" }
                    }
                    searchFocused = showSearch
                } label: {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(showSearch ? Color.primaryTint : Color.textTertiary)
                        .frame(width: 32, height: 32)
                        .background(Color.bgSurface.opacity(0.6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        appState.goToPreviousDay()
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.textTertiary)
                        .frame(width: 32, height: 32)
                        .background(Color.bgSurface.opacity(0.6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)

                if !appState.isToday {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            appState.goToToday()
                        }
                    } label: {
                        Text("Today")
                            .font(.captionBold)
                            .foregroundStyle(Color.primaryTint)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.primaryTint.opacity(0.1))
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        appState.goToNextDay()
                    }
                } label: {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(Color.textTertiary)
                        .frame(width: 32, height: 32)
                        .background(Color.bgSurface.opacity(0.6))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
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
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))
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
            InboxSectionView(
                title: "Results",
                tasks: searchResults,
                modelContext: modelContext,
                userId: auth.currentUser?.id ?? UUID()
            )
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

            Text("Your day is clear")
                .font(.displaySmall)
                .foregroundStyle(Color.textSecondary)

            Text("Add a task below to get started")
                .font(.bodySmall)
                .foregroundStyle(Color.textTertiary)
        }
    }

    /// A content fingerprint of the task list. Changes whenever a task is added,
    /// removed, completed, or rescheduled — the signals that affect what the
    /// timeline shows. Keying `.onChange` on this (instead of `allTasks.count`)
    /// makes completion/reschedule actually re-derive the Today view.
    private var tasksRevision: Int {
        var hasher = Hasher()
        hasher.combine(allTasks.count)
        for task in allTasks {
            hasher.combine(task.id)
            hasher.combine(task.completed)
            hasher.combine(task.scheduledFor)
            hasher.combine(task.bucket)
        }
        return hasher.finalize()
    }

    /// Same idea for routine completions, which write `ActionableInstance.status`
    /// in place — the count never changes, so a count-only trigger would miss it.
    private var instancesRevision: Int {
        var hasher = Hasher()
        hasher.combine(instances.count)
        for instance in instances {
            hasher.combine(instance.id)
            hasher.combine(instance.status)
        }
        return hasher.finalize()
    }

    private func rebuildTimeline() {
        viewModel.buildTimeline(
            tasks: allTasks,
            routines: routines,
            instances: instances,
            playbookBlocks: playbookBlocks,
            playbookInstances: playbookInstances,
            date: appState.selectedDate,
            domainFilter: appState.domainFilter,
            // Playbook "coaching" blocks (Solo Morning, Get Ready Relay, …) are
            // relics — keep them off the timeline.
            showCoaching: false,
            eventItems: calendar.eventItems
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

// MARK: - Timeline Section

struct TimelineSectionView: View {
    let title: String
    let items: [TimelineItem]
    let modelContext: ModelContext
    let userId: UUID
    /// The day this section renders — routine completions attach to this date.
    var date: Date = Date()

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.captionBold)
                .foregroundStyle(Color.primaryTint.opacity(0.6))
                .textCase(.uppercase)
                .kerning(1.2)
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 2)

            ForEach(items) { item in
                TimelineItemCard(item: item, modelContext: modelContext, userId: userId, date: date)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 3)
            }
        }
    }
}

// MARK: - Inbox Section

struct InboxSectionView: View {
    var title: String = "Unscheduled"
    let tasks: [SymphonyTask]
    let modelContext: ModelContext
    let userId: UUID

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .center) {
                Text(title)
                    .font(.captionBold)
                    .foregroundStyle(Color.primaryTint.opacity(0.6))
                    .textCase(.uppercase)
                    .kerning(1.2)

                Spacer()

                Text("\(tasks.count)")
                    .font(.captionBold)
                    .foregroundStyle(Color.primaryTint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.primaryTint.opacity(0.1))
                    .clipShape(Capsule())
            }
            .padding(.horizontal, 20)
            .padding(.top, 28)
            .padding(.bottom, 2)

            ForEach(tasks, id: \.id) { task in
                InboxTaskRow(task: task, modelContext: modelContext, userId: userId)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 3)
            }
        }
    }
}
