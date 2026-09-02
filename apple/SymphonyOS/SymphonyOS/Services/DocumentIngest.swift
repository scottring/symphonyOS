import Foundation
import Supabase

/// Source-agnostic document ingestion: upload the original to the `attachments`
/// bucket and attach the file to an entity (task, note, …). Used by `PageIngest`
/// to file a snapped page against its first landed item.
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

    /// Insert the `attachments` row pointing an entity (task or note) at the
    /// uploaded file.
    static func attach(entityType: String = "task", entityId: UUID, userId: UUID, storagePath: String,
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
            entity_type: entityType,
            entity_id: entityId.uuidString,
            file_name: fileName,
            file_type: fileType,
            file_size: fileSize,
            storage_path: storagePath
        )
        try await supabase.from("attachments").insert(row).execute()
    }
}
