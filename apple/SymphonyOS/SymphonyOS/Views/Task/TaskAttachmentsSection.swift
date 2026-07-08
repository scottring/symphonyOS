import SwiftUI
import Supabase

/// Photos attached to a task (the `attachments` table + bucket) — most
/// importantly the photo behind a photo-first capture, so the picture is in
/// hand at the store. Images load via short-lived signed URLs; tap for
/// full screen.
struct TaskAttachmentsSection: View {
    let taskId: UUID

    @State private var images: [LoadedAttachment] = []
    @State private var fullScreenImage: LoadedAttachment?

    struct LoadedAttachment: Identifiable {
        let id: UUID
        let fileName: String
        let url: URL
    }

    var body: some View {
        Group {
            if !images.isEmpty {
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
                        }
                    }
                }
            }
        }
        .task(id: taskId) { await load() }
        #if os(iOS)
        .fullScreenCover(item: $fullScreenImage) { attachment in
            AttachmentViewer(attachment: attachment) { fullScreenImage = nil }
        }
        #endif
    }

    private func load() async {
        struct Row: Decodable {
            let id: UUID
            let file_name: String
            let file_type: String
            let storage_path: String
        }
        // entity_id is text and web writes lowercase uuids.
        guard let rows: [Row] = try? await supabase.from("attachments")
            .select("id, file_name, file_type, storage_path")
            .eq("entity_type", value: "task")
            .eq("entity_id", value: taskId.uuidString.lowercased())
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
    let attachment: TaskAttachmentsSection.LoadedAttachment
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
