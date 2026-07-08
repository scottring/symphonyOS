import Foundation
import SwiftData
import Supabase
#if canImport(UIKit)
import UIKit
#endif

/// Photo-first capture: snap → phone in pocket. Creates an inbox task
/// ("Analyzing photo…", capture_meta.status = pending) directly on the server,
/// uploads the photo to the `attachments` bucket, and fires the
/// `analyze-capture` edge function. The function (Claude vision) writes the
/// enriched title + store-ready note, files the photo as a task attachment,
/// and suggests an existing open task to merge into; realtime sync brings it
/// all back down.
///
/// Offline resilience: the JPEG is spooled to disk before any network call and
/// only deleted after a successful analyze — `retryPending` (called on app
/// foreground) re-drives any capture that didn't make it through.
@MainActor
enum PhotoCaptureService {

    static let placeholderTitle = "Analyzing photo…"
    /// Captures younger than this are assumed mid-flight and skipped by retry.
    private static let retryAfter: TimeInterval = 60

    // MARK: - Pure helpers (unit-tested)

    /// Lowercased throughout: storage RLS compares the first path folder to
    /// auth.uid()::text (lowercase), and UUID.uuidString is uppercase.
    static func storagePath(userId: UUID, taskId: UUID) -> String {
        "\(userId.uuidString.lowercased())/capture/\(taskId.uuidString.lowercased()).jpg"
    }

    /// Downscale so the longest side is ≤ `maxDimension` and re-encode as JPEG.
    /// Keeps vision quality while capping upload size (a 12MP HEIC would be
    /// ~4MB; this lands around 300–500KB).
    #if canImport(UIKit)
    static func preparedJPEG(from image: UIImage, maxDimension: CGFloat = 1600) -> Data? {
        let largest = max(image.size.width, image.size.height)
        guard largest > maxDimension else { return image.jpegData(compressionQuality: 0.8) }
        let scale = maxDimension / largest
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let resized = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
    #endif

    // MARK: - Capture

    /// Entry point from the camera. Synchronously creates the local task (so it
    /// appears in the inbox immediately), spools the image, then pushes and
    /// analyzes in the background.
    @discardableResult
    static func capture(jpegData: Data, userId: UUID, modelContext: ModelContext) -> SymphonyTask {
        let task = SymphonyTask(userId: userId, title: placeholderTitle, syncStatus: .synced)
        task.bucket = "inbox"
        task.captureStatus = "pending"
        task.captureStoragePath = storagePath(userId: userId, taskId: task.id)
        modelContext.insert(task)
        try? modelContext.save()

        try? spool(jpegData, taskId: task.id)

        let taskId = task.id
        Task { await pushAndAnalyze(taskId: taskId, modelContext: modelContext) }
        return task
    }

    /// Re-drive captures that never completed (offline snap, killed app,
    /// transient analysis failure). Called on app foreground.
    static func retryPending(modelContext: ModelContext) async {
        let cutoff = Date().addingTimeInterval(-retryAfter)
        let descriptor = FetchDescriptor<SymphonyTask>(predicate: #Predicate {
            ($0.captureStatus == "pending" || $0.captureStatus == "failed") && $0.createdAt < cutoff
        })
        guard let stuck = try? modelContext.fetch(descriptor), !stuck.isEmpty else { return }
        for task in stuck {
            await pushAndAnalyze(taskId: task.id, modelContext: modelContext)
        }
    }

    // MARK: - Pipeline

    /// Idempotent push: upsert the task row, upload the spooled image (if still
    /// present), invoke analyze-capture, then apply the enriched row locally
    /// (belt-and-braces alongside realtime) and clear the spool.
    private static func pushAndAnalyze(taskId: UUID, modelContext: ModelContext) async {
        guard let row = SyncEngine.serializeRow(table: "tasks", id: taskId, context: modelContext),
              case let .string(userIdString)? = row["user_id"],
              let userId = UUID(uuidString: userIdString) else { return }
        let path = storagePath(userId: userId, taskId: taskId)

        do {
            try await supabase.from("tasks").upsert(AnyJSON.object(row)).execute()

            if let data = spooledData(taskId: taskId) {
                try await supabase.storage.from("attachments").upload(
                    path,
                    data: data,
                    options: FileOptions(contentType: "image/jpeg", upsert: true)
                )
            }

            struct Body: Encodable {
                let taskId: String
                let storagePath: String
                let fileName: String
                let fileType: String
                let fileSize: Int
            }
            let size = spooledData(taskId: taskId)?.count ?? 0
            try await supabase.functions.invoke("analyze-capture", options: FunctionInvokeOptions(body: Body(
                taskId: taskId.uuidString.lowercased(),
                storagePath: path,
                fileName: "capture.jpg",
                fileType: "image/jpeg",
                fileSize: size
            )))

            await applyEnrichedRow(taskId: taskId, modelContext: modelContext)
            clearSpool(taskId: taskId)
        } catch {
            // Leave the spool + pending status in place — retryPending picks it up.
            print("PhotoCaptureService: capture push failed for \(taskId): \(error)")
        }
    }

    /// Pull the enriched row and copy the AI-written fields onto the local task
    /// so the inbox updates even if the realtime event is missed.
    private static func applyEnrichedRow(taskId: UUID, modelContext: ModelContext) async {
        struct Enriched: Decodable {
            let title: String
            let notes: String?
            let capture_meta: CaptureMeta?
        }
        guard let enriched: Enriched = try? await supabase.from("tasks")
            .select("title, notes, capture_meta")
            .eq("id", value: taskId.uuidString)
            .single()
            .execute()
            .value else { return }

        let descriptor = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == taskId })
        guard let task = try? modelContext.fetch(descriptor).first else { return }
        task.title = enriched.title
        task.notes = enriched.notes
        task.captureStatus = enriched.capture_meta?.status
        task.captureStoragePath = enriched.capture_meta?.storage_path
        task.captureSuggestedTaskId = enriched.capture_meta?.suggested_task_id.flatMap(UUID.init(uuidString:))
        task.lastSyncedAt = Date()
        try? modelContext.save()
    }

    // MARK: - Attach to an existing task

    /// Add a photo to an existing task (no AI, no new task): upload to the
    /// attachments bucket and insert the attachments row. Web parity with the
    /// task panel's Photos section.
    static func attachImage(jpegData: Data, taskId: UUID, userId: UUID) async -> Bool {
        let path = "\(userId.uuidString.lowercased())/attach/\(UUID().uuidString.lowercased()).jpg"
        do {
            try await supabase.storage.from("attachments").upload(
                path,
                data: jpegData,
                options: FileOptions(contentType: "image/jpeg", upsert: false)
            )
            struct NewAttachment: Encodable {
                let user_id: String
                let entity_type: String
                let entity_id: String
                let file_name: String
                let file_type: String
                let file_size: Int
                let storage_path: String
            }
            try await supabase.from("attachments").insert(NewAttachment(
                user_id: userId.uuidString.lowercased(),
                entity_type: "task",
                entity_id: taskId.uuidString.lowercased(),
                file_name: "photo.jpg",
                file_type: "image/jpeg",
                file_size: jpegData.count,
                storage_path: path
            )).execute()
            return true
        } catch {
            print("PhotoCaptureService: attachImage failed: \(error)")
            return false
        }
    }

    // MARK: - Merge (suggestion chip)

    /// Fold an enriched capture into the suggested destination task: append the
    /// note, repoint the photo attachment, delete the capture. The attachment
    /// repoint happens first (it needs the network); if it fails the capture is
    /// left untouched so the chip can be tapped again.
    static func merge(capture: SymphonyTask, into target: SymphonyTask, modelContext: ModelContext) async -> Bool {
        do {
            // entity_id is a text column — web writes lowercase uuids, so match that.
            try await supabase.from("attachments")
                .update(["entity_id": target.id.uuidString.lowercased()])
                .eq("entity_id", value: capture.id.uuidString.lowercased())
                .execute()
        } catch {
            print("PhotoCaptureService: merge repoint failed: \(error)")
            return false
        }

        let vm = TaskViewModel(modelContext: modelContext)
        let merged = [target.notes, capture.notes]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: "\n\n")
        vm.updateNotes(target, notes: merged.isEmpty ? nil : merged)
        vm.deleteTask(capture)
        return true
    }

    // MARK: - Local spool

    private static func spoolDirectory() -> URL? {
        guard let base = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) else { return nil }
        let dir = base.appendingPathComponent("pending-captures", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static func spoolURL(taskId: UUID) -> URL? {
        spoolDirectory()?.appendingPathComponent("\(taskId.uuidString).jpg")
    }

    private static func spool(_ data: Data, taskId: UUID) throws {
        guard let url = spoolURL(taskId: taskId) else { return }
        try data.write(to: url, options: .atomic)
    }

    private static func spooledData(taskId: UUID) -> Data? {
        guard let url = spoolURL(taskId: taskId) else { return nil }
        return try? Data(contentsOf: url)
    }

    private static func clearSpool(taskId: UUID) {
        guard let url = spoolURL(taskId: taskId) else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
