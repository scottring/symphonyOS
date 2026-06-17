import SwiftUI
#if os(iOS)
import PhotosUI
#endif

struct MainView: View {
    var body: some View {
        #if os(iOS)
        iOSMainView()
        #else
        MacMainView()
        #endif
    }
}

// MARK: - iOS Tab View

struct iOSMainView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @State private var showCapture = false

    var body: some View {
        @Bindable var state = appState
        Group {
            switch state.activeTab {
            case .today:    NavigationStack { TodayView() }
            case .inbox:    NavigationStack { InboxView() }
            case .projects: NavigationStack { ProjectListView() }
            case .more:     NavigationStack { MoreView() }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            SymphonyDock(activeTab: $state.activeTab) { showCapture = true }
        }
        .sheet(isPresented: $showCapture) {
            CaptureSheet(userId: auth.currentUser?.id ?? UUID())
                .presentationDetents([.medium])
        }
    }
}

// MARK: - Custom Dock (5 slots: Today · Inbox · ＋ · Projects · More)

private struct SymphonyDock: View {
    @Binding var activeTab: AppTab
    var onAdd: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            tab(.today, icon: "sun.max", label: "Today")
            tab(.inbox, icon: "tray", label: "Inbox")
            addSlot
            tab(.projects, icon: "folder", label: "Projects")
            tab(.more, icon: "ellipsis", label: "More")
        }
        .padding(.top, 10)
        .padding(.horizontal, 6)
        .background(
            Color.bgBase.opacity(0.97)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.textTertiary.opacity(0.12)).frame(height: 0.5)
                }
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func tab(_ t: AppTab, icon: String, label: String) -> some View {
        Button {
            activeTab = t
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 20))
                Text(label).font(.system(size: 10, weight: .semibold))
            }
            .foregroundStyle(activeTab == t ? Color.primaryTint : Color.textTertiary)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // The center "+" is its own equal-width slot (so it sits between Inbox and
    // Projects without overlapping them) and is visually larger than the tabs.
    private var addSlot: some View {
        Button(action: onAdd) {
            Image(systemName: "plus")
                .font(.system(size: 26, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.primaryTint))
                .shadow(color: Color.primaryTint.opacity(0.35), radius: 6, y: 3)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .offset(y: -8)
    }
}

// MARK: - Capture Sheet (dock "+": reuse the NL-aware capture bar + scan/photo)

private struct CaptureSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var showScanner = false
    @State private var showPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var isProcessing = false
    @State private var pendingReview: PendingReview?

    private struct PendingReview: Identifiable {
        let id = UUID()
        let image: UIImage
        let data: Data
        let extraction: ScanExtraction?
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                // Reuse the existing natural-language capture bar for typed tasks.
                QuickCaptureBar(userId: userId)
                    .clipShape(RoundedRectangle(cornerRadius: 14))

                // Or capture a document.
                HStack(spacing: 12) {
                    captureOption(title: "Scan document", systemImage: "doc.viewfinder") { showScanner = true }
                    captureOption(title: "Choose photo", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                }
                .padding(.horizontal, 20)

                Spacer(minLength: 0)
            }
            .padding(.top, 12)
            .background(Color.bgBase)
            .navigationTitle("Add")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .overlay {
                if isProcessing {
                    ProgressView().controlSize(.large)
                        .padding(20)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScanner { data in
                    showScanner = false
                    if let data { Task { await beginReview(imageData: data) } }
                }
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        await beginReview(imageData: data)
                    }
                    photoItem = nil
                }
            }
            .sheet(item: $pendingReview) { review in
                ScanReviewSheet(
                    image: review.image,
                    initial: review.extraction,
                    onSave: { title, scheduledFor, notes, context in
                        pendingReview = nil
                        saveScan(data: review.data, title: title, scheduledFor: scheduledFor, notes: notes, context: context)
                    },
                    onCancel: { pendingReview = nil }
                )
            }
        }
    }

    private func captureOption(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage).font(.system(size: 24))
                Text(title).font(.captionBold)
            }
            .foregroundStyle(Color.primaryTint)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }

    private func beginReview(imageData: Data) async {
        guard let ui = UIImage(data: imageData) else { return }
        isProcessing = true
        let jpeg = ui.jpegData(compressionQuality: 0.8) ?? imageData
        let extraction = await DocumentIngest.extract(imageData: jpeg, mediaType: "image/jpeg")
        isProcessing = false
        pendingReview = PendingReview(image: ui, data: jpeg, extraction: extraction)
    }

    private func saveScan(data: Data, title: String, scheduledFor: Date?, notes: String?, context: String?) {
        let vm = TaskViewModel(modelContext: modelContext)
        let finalTitle = title.isEmpty ? "Scanned document" : title
        let task = vm.createTask(
            title: finalTitle, userId: userId,
            scheduledFor: scheduledFor, isAllDay: scheduledFor != nil, context: context
        )

        if let notes, !notes.isEmpty {
            task.notes = notes
            try? modelContext.save()
        }

        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif

        Task {
            do {
                let path = try await DocumentIngest.upload(data: data, userId: userId, ext: "jpg", contentType: "image/jpeg")
                try await DocumentIngest.attach(
                    taskId: task.id, userId: userId, storagePath: path,
                    fileName: "scan.jpg", fileType: "image/jpeg", fileSize: data.count
                )
            } catch {
                // Task already created; attachment failed (offline, etc.) — acceptable for V1.
            }
        }
        dismiss()
    }
}

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

// MARK: - Placeholder Views (replaced in Phase 3+)

struct TodayPlaceholder: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "sun.max")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)

                VStack(spacing: 8) {
                    Text("Today")
                        .font(.displayMedium)
                        .foregroundStyle(Color.textPrimary)

                    Text(appState.selectedDate.formatted(date: .long, time: .omitted))
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                }

                Text("Timeline coming in Phase 3")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)

                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .buttonStyle(.symphony)
            }
        }
        .navigationTitle("Today")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.large)
        #endif
    }
}

struct InboxPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "tray")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Inbox")
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                Text("Coming in Phase 3")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Inbox")
    }
}

struct ProjectsPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "folder")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Projects")
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Projects")
    }
}

struct RoutinesPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "repeat")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Routines")
                    .font(.displayMedium)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Routines")
    }
}

struct ContactsPlaceholder: View {
    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "person.2")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Contacts")
                    .font(.displayMedium)
                Text("Coming in Phase 4")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .navigationTitle("Contacts")
    }
}

struct MoreView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState

    var body: some View {
        List {
            Section {
                NavigationLink {
                    RoutineListView()
                } label: {
                    Label("Routines", systemImage: "repeat")
                }

                NavigationLink {
                    ContactListView()
                } label: {
                    Label("Contacts", systemImage: "person.2")
                }

                NavigationLink {
                    FamilyRulesView()
                } label: {
                    Label("Family Rules", systemImage: "list.clipboard")
                }
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

            Section {
                Toggle("Show Coaching", isOn: Binding(
                    get: { !appState.hideCoaching },
                    set: { appState.hideCoaching = !$0 }
                ))
            }

            Section {
                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .foregroundStyle(.red)
            }
        }
        .navigationTitle("More")
    }
}

struct SettingsPlaceholder: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()
            VStack(spacing: 16) {
                Image(systemName: "gear")
                    .font(.system(size: 48))
                    .foregroundStyle(Color.primaryTint)
                Text("Settings")
                    .font(.displayMedium)

                Button("Sign Out") {
                    Task { await auth.signOut() }
                }
                .buttonStyle(.symphony)
            }
        }
        .navigationTitle("Settings")
    }
}
