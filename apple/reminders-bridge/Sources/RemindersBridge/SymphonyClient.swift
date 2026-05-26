import Foundation
import Supabase

public protocol SymphonyClientProtocol {
    func fetchItems(listId: UUID) async throws -> [SymphonyItem]
    func insert(listId: UUID, userId: UUID, text: String, completed: Bool, externalId: String) async throws
    func update(symphonyId: UUID, text: String, completed: Bool) async throws
    func setExternalId(symphonyId: UUID, externalId: String) async throws
    func delete(symphonyId: UUID) async throws
}

public final class SymphonyClient: SymphonyClientProtocol {
    private let client: SupabaseClient
    private let externalSource = "apple_reminders"

    public init(supabaseUrl: URL, serviceRoleKey: String) {
        self.client = SupabaseClient(supabaseURL: supabaseUrl, supabaseKey: serviceRoleKey)
    }

    public func fetchItems(listId: UUID) async throws -> [SymphonyItem] {
        struct Row: Decodable {
            let id: UUID
            let list_id: UUID
            let text: String
            let completed: Bool
            let updated_at: Date
            let external_id: String?
        }
        // PostgREST caps a single response at ~1000 rows, so page through the
        // whole list. A stable `order` is required or page windows overlap/skip.
        let rows: [Row] = try await Paginator.fetchAll(pageSize: 1000) { offset, limit in
            try await client
                .from("list_items")
                .select("id,list_id,text,completed,updated_at,external_id")
                .eq("list_id", value: listId.uuidString)
                .order("id", ascending: true)
                .range(from: offset, to: offset + limit - 1)
                .execute()
                .value
        }

        return rows.map {
            SymphonyItem(
                id: $0.id,
                listId: $0.list_id,
                text: $0.text,
                completed: $0.completed,
                updatedAt: $0.updated_at,
                externalId: $0.external_id
            )
        }
    }

    public func insert(listId: UUID, userId: UUID, text: String, completed: Bool, externalId: String) async throws {
        struct InsertRow: Encodable {
            let list_id: String
            let user_id: String
            let text: String
            let completed: Bool
            let completed_at: String?
            let external_id: String
            let external_source: String
        }
        let now = ISO8601DateFormatter().string(from: Date())
        let row = InsertRow(
            list_id: listId.uuidString,
            user_id: userId.uuidString,
            text: text,
            completed: completed,
            completed_at: completed ? now : nil,
            external_id: externalId,
            external_source: externalSource
        )
        _ = try await client.from("list_items").insert(row).execute()
    }

    public func update(symphonyId: UUID, text: String, completed: Bool) async throws {
        struct UpdateRow: Encodable {
            let text: String
            let completed: Bool
            let completed_at: String?
        }
        let now = completed ? ISO8601DateFormatter().string(from: Date()) : nil
        let row = UpdateRow(text: text, completed: completed, completed_at: now)
        _ = try await client
            .from("list_items")
            .update(row)
            .eq("id", value: symphonyId.uuidString)
            .execute()
    }

    public func setExternalId(symphonyId: UUID, externalId: String) async throws {
        struct UpdateRow: Encodable {
            let external_id: String
            let external_source: String
        }
        let row = UpdateRow(external_id: externalId, external_source: externalSource)
        _ = try await client
            .from("list_items")
            .update(row)
            .eq("id", value: symphonyId.uuidString)
            .execute()
    }

    public func delete(symphonyId: UUID) async throws {
        _ = try await client
            .from("list_items")
            .delete()
            .eq("id", value: symphonyId.uuidString)
            .execute()
    }
}
