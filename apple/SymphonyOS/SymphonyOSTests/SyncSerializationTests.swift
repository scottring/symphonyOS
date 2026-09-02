import Testing
import Foundation
import SwiftData
@testable import Symphony

/// Serialization tests for the push side of the sync engine. Column sets are
/// asserted against the production schema (fetched 2026-07-07): pushing a
/// column Postgres doesn't have rejects the entire row, which silently
/// dropped every iOS write for days once before ("phantom columns").
@MainActor
struct SyncSerializationTests {

    private func makeContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: SymphonyTask.self, Project.self, Routine.self, Contact.self,
            FamilyMember.self, ActionableInstance.self, EventNote.self, PlaybookBlock.self,
            PlaybookInstance.self, WeeklyTemplate.self, FamilyRule.self,
            Responsibility.self, Household.self, UserProfile.self, PendingChange.self,
            configurations: config
        )
        return ModelContext(container)
    }

    @Test func instanceRowUsesDateOnlyLocalDay() throws {
        let context = try makeContext()
        let userId = UUID()
        // 23:30 local — an ISO/UTC serialization would land on the wrong day
        // for any timezone west of UTC.
        let lateEvening = Calendar.current.date(
            bySettingHour: 23, minute: 30, second: 0,
            of: Calendar.current.startOfDay(for: Date())
        )!
        let instance = ActionableInstance(
            userId: userId, entityType: "routine",
            entityId: UUID().uuidString, date: lateEvening
        )
        instance.status = "completed"
        instance.completedAt = lateEvening
        context.insert(instance)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "actionable_instances", id: instance.id, context: context))

        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        #expect(row["date"]?.stringValue == f.string(from: lateEvening))
        #expect(row["status"]?.stringValue == "completed")
        #expect(row["entity_type"]?.stringValue == "routine")
    }

    @Test func instanceRowMatchesProdColumns() throws {
        let context = try makeContext()
        let instance = ActionableInstance(userId: UUID(), entityType: "routine", entityId: "x", date: Date())
        context.insert(instance)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "actionable_instances", id: instance.id, context: context))
        let prodColumns: Set<String> = [
            "id", "user_id", "entity_type", "entity_id", "date", "status",
            "assignee", "deferred_to", "completed_at", "skipped_at",
            "created_at", "updated_at", "assigned_to_override",
        ]
        #expect(Set(row.keys).isSubset(of: prodColumns))
    }

    @Test func routineRowMatchesProdColumns() throws {
        let context = try makeContext()
        let routine = Routine(userId: UUID(), name: "Water plants",
                              recurrencePattern: RecurrencePattern(type: "weekly", days: ["saturday"]))
        routine.timeOfDay = "09:00"
        context.insert(routine)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "routines", id: routine.id, context: context))
        let prodColumns: Set<String> = [
            "id", "user_id", "name", "description", "default_assignee", "visibility",
            "recurrence_pattern", "time_of_day", "created_at", "updated_at", "raw_input",
            "assigned_to", "show_on_timeline", "prep_task_templates", "followup_task_templates",
            "assigned_to_all", "context", "paused_until", "scope", "location",
            "location_place_id", "times_per_day", "image_url", "project_id",
            "pin_to_timeline", "parent_routine_id", "step_order",
        ]
        #expect(Set(row.keys).isSubset(of: prodColumns))
        #expect(row["name"]?.stringValue == "Water plants")
    }

    @Test func projectAndContactAndRuleRowsMatchProdColumns() throws {
        let context = try makeContext()
        let project = Project(userId: UUID(), name: "Kitchen reno")
        let contact = Contact(userId: UUID(), name: "Dr. Smith")
        let rule = FamilyRule(userId: UUID(), rule: "No screens at dinner", status: "active")
        context.insert(project); context.insert(contact); context.insert(rule)
        try context.save()

        let projectRow = try #require(SyncEngine.serializeRow(table: "projects", id: project.id, context: context))
        #expect(Set(projectRow.keys).isSubset(of: [
            "id", "user_id", "name", "status", "notes", "parent_id", "created_at",
            "updated_at", "type", "trip_metadata", "links", "phone_number", "context", "scope",
        ]))

        let contactRow = try #require(SyncEngine.serializeRow(table: "contacts", id: contact.id, context: context))
        #expect(Set(contactRow.keys).isSubset(of: [
            "id", "user_id", "name", "phone", "email", "notes", "created_at", "updated_at",
            "category", "birthday", "relationship", "preferences", "context", "scope", "place_id",
        ]))

        let ruleRow = try #require(SyncEngine.serializeRow(table: "family_rules", id: rule.id, context: context))
        #expect(Set(ruleRow.keys).isSubset(of: [
            "id", "user_id", "rule", "applies_to", "status", "rationale",
            "enforcement_tip", "created_at", "updated_at", "category", "layer_id",
        ]))
    }

    @Test func taskRowHasNoPhantomColumns() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Call plumber")
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        // Prod tasks columns (2026-07-07). Notably there is NO is_someday and
        // NO linked_to — someday is bucket="someday".
        let prodColumns: Set<String> = [
            "id", "user_id", "title", "completed", "scheduled_for", "notes", "phone_number",
            "created_at", "updated_at", "contact_id", "links", "project_id", "is_all_day",
            "deferred_until", "defer_count", "assigned_to", "parent_task_id", "linked_event_id",
            "context", "estimated_duration", "location", "location_place_id", "link_type",
            "linked_activity_type", "linked_activity_id", "category", "google_event_id",
            "assigned_to_all", "is_waiting", "waiting_since", "bucket", "needs_discussion",
            "discussion_note", "week_deferred_at", "group_members", "scope", "directions",
            "capture_meta", "week_start", "capture_id",
        ]
        #expect(Set(row.keys).isSubset(of: prodColumns))
        // Non-capture tasks must NOT send capture_meta — a null would wipe the
        // server-side capture state written by the analyze-capture edge function.
        #expect(row["capture_meta"] == nil)
    }

    @Test func captureTaskRowRoundTripsCaptureMeta() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Analyzing photo…")
        task.captureStatus = "pending"
        task.captureStoragePath = "user/capture/abc.jpg"
        let suggested = UUID()
        task.captureSuggestedTaskId = suggested
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        let meta = try #require(row["capture_meta"]?.objectValue)
        #expect(meta["status"]?.stringValue == "pending")
        #expect(meta["storage_path"]?.stringValue == "user/capture/abc.jpg")
        #expect(meta["suggested_task_id"]?.stringValue == suggested.uuidString)
    }

    @Test func eventNoteRowMatchesProdColumns() throws {
        let context = try makeContext()
        let note = EventNote(userId: UUID(), googleEventId: "abc123googleid")
        note.notes = "Bring insurance card"
        note.links = [TaskLink(url: "https://portal.example.com", title: "Portal")]
        note.eventTitle = "Dentist"
        note.eventStartTime = Date()
        context.insert(note)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "event_notes", id: note.id, context: context))
        // Prod event_notes columns (fetched 2026-07-12).
        let prodColumns: Set<String> = [
            "id", "user_id", "google_event_id", "notes", "links", "event_title",
            "event_start_time", "context", "shared_with_family", "share_nudge_dismissed",
            "assigned_to", "assigned_to_all", "recipe_url", "project_id",
            "created_at", "updated_at",
        ]
        #expect(Set(row.keys).isSubset(of: prodColumns))
        #expect(row["google_event_id"]?.stringValue == "abc123googleid")
        #expect(row["notes"]?.stringValue == "Bring insurance card")
    }

    @Test func eventNoteInsertUpsertsOnNaturalKey() throws {
        // event_notes pushes must upsert on (user_id, google_event_id) so a note
        // the web created first (different id) doesn't collide on insert.
        let context = try makeContext()
        let note = EventNote(userId: UUID(), googleEventId: "evt-1")
        context.insert(note)
        try context.save()
        let row = try #require(SyncEngine.serializeRow(table: "event_notes", id: note.id, context: context))
        #expect(row["user_id"] != nil)
        #expect(row["google_event_id"]?.stringValue == "evt-1")
    }

    @Test func queueSyncDedupesIdenticalChanges() throws {
        let context = try makeContext()
        let id = UUID()
        context.queueSync(table: "tasks", recordId: id, type: "update")
        context.queueSync(table: "tasks", recordId: id, type: "update")
        context.queueSync(table: "tasks", recordId: id, type: "delete")   // different type — kept
        try context.save()

        let queued = try context.fetch(FetchDescriptor<PendingChange>())
        #expect(queued.count == 2)
    }

    @Test func unsupportedTableSerializesToNil() throws {
        let context = try makeContext()
        #expect(SyncEngine.serializeRow(table: "weekly_templates", id: UUID(), context: context) == nil)
    }

    @Test func taskRowSendsWeekStartAsLocalDateOnlyWhenSet() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Plan the week")
        task.bucket = "week"
        // 23:30 local — ISO/UTC would land on the wrong day west of Greenwich.
        task.weekStart = Calendar.current.date(
            bySettingHour: 23, minute: 30, second: 0,
            of: Calendar.current.startOfDay(for: Date())
        )!
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        #expect(row["week_start"]?.stringValue == f.string(from: task.weekStart!))
    }

    @Test func taskRowOmitsWeekStartScopeAndCaptureIdByDefault() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Call plumber")
        task.scope = "compound"
        task.captureId = UUID()
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        // A blanket null would wipe a week placement made on the web; scope and
        // capture_id are server/web-owned and the phone never writes them on UPDATE.
        #expect(row["week_start"] == nil)
        #expect(row["scope"] == nil)
        #expect(row["capture_id"] == nil)
    }

    @Test func taskRowSendsScopeOnInsertOnlyNotOnUpdate() throws {
        // F1: a page item assigned to another household member must share as
        // "couple" — but only on the INSERT that creates the row. Sending scope
        // on every UPDATE too would echo a possibly-stale local value over a
        // web-side relabel, since scope is otherwise server/web-owned.
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Buy cleats")
        task.scope = "couple"
        context.insert(task)
        try context.save()

        let insertRow = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context, forInsert: true))
        #expect(insertRow["scope"]?.stringValue == "couple")

        let updateRow = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(updateRow["scope"] == nil)
    }

    @Test func taskRowSendsScopeOnUpdateWhenThePhoneChangedIt() throws {
        // A context/assignee edit on the phone recomputes scope (TaskViewModel.
        // reconcileScope) and flags scopeDirty — that recomputed value must
        // reach the server on the very next UPDATE, unlike the default (server-
        // owned) case above.
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Assign to Iris")
        task.scope = "couple"
        task.scopeDirty = true
        context.insert(task)
        try context.save()

        let updateRow = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        #expect(updateRow["scope"]?.stringValue == "couple")
    }
}
