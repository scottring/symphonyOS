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
        .accessibilityLabel("Add")
        .frame(maxWidth: .infinity)
        .offset(y: -8)
    }
}

// MARK: - Capture Sheet (dock "+": typed capture, or snap a page → parse-page)

private struct CaptureSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
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

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                QuickCaptureBar(userId: userId)

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

                Spacer(minLength: 0)
            }
            .padding(.top, 12)
            .background(Color.bgBase)
            .navigationTitle("Add")
            .toolbar {
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

