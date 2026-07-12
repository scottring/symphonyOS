import SwiftUI
import Supabase
#if os(iOS)
import PhotosUI
#endif

/// Photos attached to any entity (the `attachments` table + bucket) — a task
/// (`entity_type` "task", the lowercased task uuid) or a calendar event
/// (`entity_type` "event_note", the Google event id), matching the web's
/// storage convention. Most importantly it holds the photo behind a photo-first
/// capture, so the picture is in hand at the store. Images load via short-lived
/// signed URLs; tap for full screen. Camera + photo-library buttons add more.
struct AttachmentsSection: View {
    let entityType: String
    /// Written/queried verbatim — caller lowercases uuids where needed.
    let entityId: String

    @Environment(AuthService.self) private var auth
    @State private var images: [LoadedAttachment] = []
    @State private var fullScreenImage: LoadedAttachment?
    @State private var isUploading = false
    #if os(iOS)
    @State private var showCamera = false
    @State private var libraryItem: PhotosPickerItem?
    #endif

    struct LoadedAttachment: Identifiable {
        let id: UUID
        let fileName: String
        let url: URL
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Photos", systemImage: "photo")
                .font(.bodySmallBold)
                .foregroundStyle(Color.textSecondary)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(images) { attachment in
                        Button {
                            fullScreenImage = attachment
                        } label: {
                            AsyncImage(url: attachment.url) { phase in
                                switch phase {
                                case .success(let image):
                                    image.resizable().scaledToFill()
                                case .failure:
                                    Image(systemName: "photo")
                                        .foregroundStyle(Color.textTertiary)
                                default:
                                    ProgressView()
                                }
                            }
                            .frame(width: 140, height: 140)
                            .background(Color.bgElevated)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }

                    #if os(iOS)
                    addTile(systemImage: "camera.fill") { showCamera = true }
                    PhotosPicker(selection: $libraryItem, matching: .images) {
                        addTileLabel(systemImage: "photo.on.rectangle")
                    }
                    .buttonStyle(.plain)
                    .disabled(isUploading)
                    #endif
                }
            }
        }
        .task(id: entityId) { await load() }
        #if os(iOS)
        .fullScreenCover(item: $fullScreenImage) { attachment in
            AttachmentViewer(attachment: attachment) { fullScreenImage = nil }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { data in
                showCamera = false
                if let data { Task { await attach(data) } }
            }
            .ignoresSafeArea()
        }
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let ui = UIImage(data: data),
                   let jpeg = PhotoCaptureService.preparedJPEG(from: ui) {
                    await attach(jpeg)
                }
                libraryItem = nil
            }
        }
        #endif
    }

    #if os(iOS)
    private func addTile(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { addTileLabel(systemImage: systemImage) }
            .buttonStyle(.plain)
            .disabled(isUploading)
    }

    private func addTileLabel(systemImage: String) -> some View {
        Group {
            if isUploading {
                ProgressView()
            } else {
                Image(systemName: systemImage)
                    .font(.system(size: 22))
                    .foregroundStyle(Color.textTertiary)
            }
        }
        .frame(width: 64, height: 140)
        .background(Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(Color.textTertiary.opacity(0.3), style: StrokeStyle(lineWidth: 1, dash: [4]))
        )
    }

    private func attach(_ jpeg: Data) async {
        guard let userId = auth.currentUser?.id else { return }
        isUploading = true
        if await PhotoCaptureService.attachImage(jpegData: jpeg, entityType: entityType, entityId: entityId, userId: userId) {
            await load()
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        isUploading = false
    }
    #endif

    private func load() async {
        struct Row: Decodable {
            let id: UUID
            let file_name: String
            let file_type: String
            let storage_path: String
        }
        // entity_id is text; caller passes it exactly as stored (lowercased uuid
        // for tasks, Google event id for events).
        guard let rows: [Row] = try? await supabase.from("attachments")
            .select("id, file_name, file_type, storage_path")
            .eq("entity_type", value: entityType)
            .eq("entity_id", value: entityId)
            .execute()
            .value else { return }

        var loaded: [LoadedAttachment] = []
        for row in rows where row.file_type.hasPrefix("image/") {
            if let url = try? await supabase.storage.from("attachments")
                .createSignedURL(path: row.storage_path, expiresIn: 3600) {
                loaded.append(LoadedAttachment(id: row.id, fileName: row.file_name, url: url))
            }
        }
        images = loaded
    }
}

#if os(iOS)
/// Minimal full-screen photo viewer (pinch handled by the system scroll view
/// would be overkill here — the store use case is "hold up the picture").
private struct AttachmentViewer: View {
    let attachment: AttachmentsSection.LoadedAttachment
    let onDismiss: () -> Void

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Color.black.ignoresSafeArea()

            AsyncImage(url: attachment.url) { phase in
                if case .success(let image) = phase {
                    image.resizable().scaledToFit()
                } else {
                    ProgressView().tint(.white)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Button(action: onDismiss) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(16)
            }
            .buttonStyle(.plain)
        }
        .onTapGesture(perform: onDismiss)
    }
}
#endif
