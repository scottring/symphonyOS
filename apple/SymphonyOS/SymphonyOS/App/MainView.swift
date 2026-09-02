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

#if os(iOS)
struct iOSMainView: View {
    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.scenePhase) private var scenePhase
    @State private var showCapture = false

    private var dock: some View {
        @Bindable var state = appState
        return SymphonyDock(activeTab: $state.activeTab) { showCapture = true }
    }

    var body: some View {
        @Bindable var state = appState
        Group {
            // The dock's `.safeAreaInset` is attached to each NavigationStack's
            // OWN content (inside the stack), not to the `Group` wrapping the
            // switch. A NavigationStack hosts its content in its own UIKit view
            // controller, which does not forward a safe-area inset added by an
            // ancestor OUTSIDE the stack down to that content — so a sibling
            // `VStack { Spacer(); QuickCaptureBar() }` inside TodayView/InboxView
            // never saw the reserved space and rendered behind the dock.
            // Attaching the inset to each destination view directly — INSIDE the
            // NavigationStack initializer, not wrapping the stack from outside —
            // keeps it inside the same view-controller boundary that Today/Inbox
            // actually measure against (an inset attached to `NavigationStack { … }`
            // from outside the braces still doesn't propagate down).
            switch state.activeTab {
            case .today:
                NavigationStack { TodayView().safeAreaInset(edge: .bottom, spacing: 0) { dock } }
            case .inbox:
                NavigationStack { InboxView().safeAreaInset(edge: .bottom, spacing: 0) { dock } }
            case .projects:
                NavigationStack { ProjectListView().safeAreaInset(edge: .bottom, spacing: 0) { dock } }
            case .more:
                NavigationStack { MoreView().safeAreaInset(edge: .bottom, spacing: 0) { dock } }
            }
        }
        .sheet(isPresented: $showCapture) {
            if let userId = auth.currentUser?.id {
                CaptureSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
        // Re-drive photo captures that never finished (offline snap, killed app).
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            Task { await PhotoCaptureService.retryPending(modelContext: modelContext) }
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
                Image(systemName: icon).font(.system(size: 20, weight: activeTab == t ? .semibold : .regular))
                Text(label).font(.captionBold)
            }
            .foregroundStyle(activeTab == t ? Color.ink : Color.textTertiary)
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
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.ink))
                .shadow(color: Color.cardShadow, radius: 8, y: 3)
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
            Section {
                NavigationLink {
                    RoutineListView()
                } label: {
                    Label("Routines", systemImage: "repeat")
                }

                NavigationLink {
                    ListsView()
                } label: {
                    Label("Lists", systemImage: "checklist")
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
            .listRowBackground(Color.bgElevated)

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
                Toggle("Show Coaching", isOn: Binding(
                    get: { !appState.hideCoaching },
                    set: { appState.hideCoaching = !$0 }
                ))
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

