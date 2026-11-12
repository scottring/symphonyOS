#if os(iOS)
import SwiftUI
import Photos

/// Settings → Notebook cover: the switch for the outside screen's cover,
/// and the same cover saved to Photos for the Lock Screen.
struct NotebookCoverSettings: View {
    @AppStorage(NotebookCoverRules.enabledKey) private var enabled = true
    @State private var status: String?
    @State private var saving = false

    var body: some View {
        Section {
            Toggle("Open on the cover", isOn: $enabled)
            Button {
                Task { await saveWallpaper() }
            } label: {
                Label(saving ? "Saving…" : "Save the cover to Photos", systemImage: "photo.badge.arrow.down")
            }
            .disabled(saving)
            if let status {
                Text(status)
                    .font(.bodySmall)
                    .foregroundStyle(Color.textSecondary)
            }
        } header: {
            Text("Notebook cover")
        } footer: {
            Text("On the outside screen, Symphony opens on a closed notebook: pull the band aside and let go to open it. iOS doesn't let apps draw on the Lock Screen, so to see the cover while the phone is locked, save it and choose it in Settings → Wallpaper.")
        }
    }

    private func saveWallpaper() async {
        saving = true
        defer { saving = false }
        guard let image = NotebookWallpaper.image() else {
            status = "Couldn't draw the cover. Try again."
            return
        }
        let access = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
        guard access == .authorized || access == .limited else {
            status = "Symphony needs permission to add photos: Settings → Symphony → Photos."
            return
        }
        do {
            try await PHPhotoLibrary.shared().performChanges {
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }
            status = "Saved to Photos. Now set it as the Lock Screen in Settings → Wallpaper."
        } catch {
            status = "Couldn't save to Photos. Try again."
        }
    }
}
#endif
