import Foundation
import SwiftData
import Supabase

/// "Snap the paper plan — it lands placed." Upload a photographed page, ask the
/// web's `parse-page` function to sort it into placed items / notes / unclear
/// lines, and commit the reviewed result through the SwiftData sync queue.
///
/// Mirrors src/hooks/usePageFromPaper.ts (parse) and src/hooks/useCommitPage.ts
/// (commit). The CALLER owns the placement window and sends it — the function
/// never re-derives it.
enum PageIngest {
    struct CommitOutcome: Equatable {
        var tasksCreated = 0
        var notesCreated = 0
        /// Non-zero means: do not delete the page.
        var failures = 0
    }

    // MARK: Pure

    /// Lowercased: the storage upload policy compares the first folder to
    /// auth.uid()::text, which is lowercase.
    static func storagePath(userId: UUID, fileId: UUID) -> String {
        "\(userId.uuidString.lowercased())/pages/\(fileId.uuidString.lowercased()).jpg"
    }

    // MARK: Network

    static func upload(jpeg: Data, userId: UUID) async throws -> String {
        let path = storagePath(userId: userId, fileId: UUID())
        try await supabase.storage
            .from("attachments")
            .upload(path, data: jpeg, options: FileOptions(contentType: "image/jpeg", upsert: false))
        return path
    }

    struct ParseError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Invoke `parse-page` with the already-uploaded path. Retry re-calls this
    /// with the same path — no re-upload.
    static func parse(storagePath: String, members: [FamilyMember], today: Date = Date()) async throws -> PageResult {
        struct Member: Encodable { let id: String; let name: String }
        struct Body: Encodable {
            let storagePath: String
            let placeStart: String
            let placeEnd: String
            let today: String
            let members: [Member]
        }
        let dates = PageParse.windowDates(from: today)
        let body = Body(
            storagePath: storagePath,
            placeStart: dates[0],
            placeEnd: dates[dates.count - 1],
            today: PageParse.localYmd(today),
            members: members.map { Member(id: $0.id.uuidString, name: $0.name) }
        )
        let response: PageParseResponse = try await supabase.functions.invoke(
            "parse-page",
            options: FunctionInvokeOptions(body: body)
        )
        if let error = response.error, !error.isEmpty { throw ParseError(message: error) }
        return PageParse.validate(response, fallbackWindow: dates, memberIds: Set(members.map(\.id)))
    }

    // MARK: Commit

    @MainActor
    static func commit(items: [PageItem], notes: [PageNote], storagePath: String?, userId: UUID,
                       members: [FamilyMember], modelContext: ModelContext) async -> CommitOutcome {
        var outcome = CommitOutcome()
        let vm = TaskViewModel(modelContext: modelContext)
        let weekStart = PageParse.weekStartAnchor(now: Date())
        let me = FamilyMember.current(in: members, authUserId: userId)?.id

        var firstTaskId: UUID?
        for item in items {
            let fields = PageParse.taskFields(for: item, currentWeekStart: weekStart, defaultAssignee: me)
            let task = vm.createTask(fields: fields, userId: userId)
            outcome.tasksCreated += 1
            firstTaskId = firstTaskId ?? task.id
        }

        // Notes go straight to the `notes` table (no SwiftData model for it).
        // type 'general' + source 'import', never 'quick_capture' — the web
        // dual-writes quick captures to the vault and a page already captured
        // must not land there a second time. scope 'individual': a capture
        // never stamps the lens, so it stays private (scopeForDomain(null)).
        struct NewNote: Encodable {
            let user_id: String; let title: String; let content: String
            let type: String; let source: String; let context: String?; let scope: String
        }
        struct CreatedNote: Decodable { let id: UUID }
        var firstNoteId: UUID?
        for note in notes {
            do {
                let created: CreatedNote = try await supabase.from("notes")
                    .insert(NewNote(user_id: userId.uuidString, title: note.title, content: note.content,
                                    type: "general", source: "import", context: nil, scope: "individual"))
                    .select("id").single().execute().value
                outcome.notesCreated += 1
                firstNoteId = firstNoteId ?? created.id
            } catch {
                outcome.failures += 1
            }
        }

        // File the page against the first note, else the first task. Not a
        // commit failure if this part fails — the items are in.
        if let storagePath, let entityId = firstNoteId ?? firstTaskId {
            try? await DocumentIngest.attach(
                entityType: firstNoteId != nil ? "note" : "task",
                entityId: entityId, userId: userId, storagePath: storagePath,
                fileName: storagePath.split(separator: "/").last.map(String.init) ?? "page.jpg",
                fileType: "image/jpeg", fileSize: 0
            )
        }
        return outcome
    }
}
