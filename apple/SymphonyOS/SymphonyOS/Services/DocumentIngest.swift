import Foundation
import Supabase

/// Structured fields returned by the `scan-to-task` edge function.
struct ScanExtraction: Decodable {
    var title: String?
    var dueDate: String?      // YYYY-MM-DD
    var notes: String?
    var context: String?      // work | family | personal
}

/// Source-agnostic document ingestion: upload the original to the `attachments`
/// bucket, ask `scan-to-task` for structured fields, and attach the file to a task.
/// Used by the in-app scanner/picker and (later) the Share Extension.
enum DocumentIngest {

    // MARK: - Pure helpers (unit-tested)

    /// Lowercased: the storage RLS upload policy compares the first path folder
    /// to auth.uid()::text, which is lowercase — an uppercase UUID folder is
    /// silently rejected.
    static func storagePath(userId: UUID, fileId: String, ext: String) -> String {
        "\(userId.uuidString.lowercased())/scans/\(fileId.lowercased()).\(ext)"
    }

    static func fallbackTitle(fileName: String?) -> String {
        if let name = fileName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
            return name
        }
        return "Scanned document"
    }

    // MARK: - Network

    /// Upload bytes to the `attachments` bucket; returns the storage path.
    static func upload(data: Data, userId: UUID, ext: String, contentType: String) async throws -> String {
        let path = storagePath(userId: userId, fileId: UUID().uuidString, ext: ext)
        try await supabase.storage
            .from("attachments")
            .upload(path, data: data, options: FileOptions(contentType: contentType, upsert: false))
        return path
    }

    /// Ask `scan-to-task` to extract task fields from an image. Returns nil on failure
    /// (the caller falls back to a generic title so nothing is lost).
    static func extract(imageData: Data, mediaType: String) async -> ScanExtraction? {
        struct Body: Encodable { let imageBase64: String; let mediaType: String }
        let body = Body(imageBase64: imageData.base64EncodedString(), mediaType: mediaType)
        return try? await supabase.functions.invoke(
            "scan-to-task",
            options: FunctionInvokeOptions(body: body)
        )
    }

    /// Insert the `attachments` row pointing a task at the uploaded file.
    static func attach(taskId: UUID, userId: UUID, storagePath: String,
                       fileName: String, fileType: String, fileSize: Int) async throws {
        struct NewAttachment: Encodable {
            let user_id: String
            let entity_type: String
            let entity_id: String
            let file_name: String
            let file_type: String
            let file_size: Int
            let storage_path: String
        }
        let row = NewAttachment(
            user_id: userId.uuidString,
            entity_type: "task",
            entity_id: taskId.uuidString,
            file_name: fileName,
            file_type: fileType,
            file_size: fileSize,
            storage_path: storagePath
        )
        try await supabase.from("attachments").insert(row).execute()
    }
}
