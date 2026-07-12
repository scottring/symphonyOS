import Foundation
import SwiftData
import Supabase
import Realtime
import Network
import OSLog

/// Coordinates bidirectional sync between SwiftData (local) and Supabase (remote).
/// Actor isolation prevents race conditions.
actor SyncEngine {
    static let syncLog = Logger(subsystem: "com.symphonyos.app", category: "sync")

    private let modelContainer: ModelContainer
    private var realtimeChannels: [RealtimeChannelV2] = []
    private var networkMonitor: NWPathMonitor?
    private var isOnline = true
    private var isSyncing = false
    private var userId: UUID?
    private var pushTask: Task<Void, Never>?

    // Tables we sync (in dependency order)
    static let syncedTables: [(tableName: String, modelType: any PersistentModel.Type)] = [
        ("households", Household.self),
        ("user_profiles", UserProfile.self),
        ("family_members", FamilyMember.self),
        ("contacts", Contact.self),
        ("projects", Project.self),
        ("tasks", SymphonyTask.self),
        ("routines", Routine.self),
        ("actionable_instances", ActionableInstance.self),
        ("event_notes", EventNote.self),
        ("weekly_templates", WeeklyTemplate.self),
        ("playbook_blocks", PlaybookBlock.self),
        ("playbook_instances", PlaybookInstance.self),
        ("family_rules", FamilyRule.self),
        ("responsibilities", Responsibility.self),
    ]

    init(modelContainer: ModelContainer) {
        self.modelContainer = modelContainer
    }

    // MARK: - Public API

    /// Start sync for the given user. Call after login.
    func start(userId: UUID) async {
        self.userId = userId
        // Diagnostic + safeguard: force the auth session to load so PostgREST
        // requests carry the user's JWT (anon requests return 0 rows under RLS).
        do {
            let session = try await supabase.auth.session
            Self.syncLog.info("auth at sync: user=\(session.user.id.uuidString, privacy: .public) tokenLen=\(session.accessToken.count)")
        } catch {
            Self.syncLog.error("auth at sync: NO SESSION (\(error.localizedDescription, privacy: .public)) — requests will be anon")
        }
        startNetworkMonitoring()
        await performInitialSync()
        await subscribeToRealtime()
        startPushLoop()
    }

    /// Periodically flush local edits up to Supabase. Edits enqueue a PendingChange;
    /// this loop pushes them within a few seconds (previously push only ran on a
    /// network reconnect, so edits effectively never synced).
    private func startPushLoop() {
        pushTask?.cancel()
        pushTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                await self?.pushPendingChanges()
            }
        }
    }

    /// Stop sync. Call on logout.
    func stop() async {
        self.userId = nil
        pushTask?.cancel()
        pushTask = nil
        for channel in realtimeChannels {
            await channel.unsubscribe()
        }
        realtimeChannels.removeAll()
        networkMonitor?.cancel()
        networkMonitor = nil
    }

    /// Push all pending local changes to Supabase.
    func pushPendingChanges() async {
        guard isOnline, !isSyncing else { return }
        isSyncing = true
        defer { isSyncing = false }

        let context = ModelContext(modelContainer)
        let descriptor = FetchDescriptor<PendingChange>(
            sortBy: [SortDescriptor(\.createdAt)]
        )

        do {
            let pendingChanges = try context.fetch(descriptor)
            for change in pendingChanges {
                do {
                    try await pushChange(change, context: context)
                    context.delete(change)
                } catch {
                    change.attempts += 1
                    change.lastAttemptAt = Date()
                    // Surface the failure — silent push errors hid a schema drift
                    // (phantom columns) that dropped every iOS write for days.
                    Self.syncLog.error("push \(change.tableName, privacy: .public) \(change.changeType, privacy: .public) FAILED (attempt \(change.attempts)): \(error.localizedDescription, privacy: .public)")
                    // Keep in queue for retry (up to 10 attempts)
                    if change.attempts >= 10 {
                        Self.syncLog.error("DROPPING \(change.tableName, privacy: .public) \(change.changeType, privacy: .public) after 10 failed attempts")
                        context.delete(change)
                    }
                }
            }
            try context.save()
        } catch {
            print("[SyncEngine] Error pushing changes: \(error)")
        }
    }

    // MARK: - Initial Sync

    private func performInitialSync() async {
        guard let userId, isOnline else { return }
        isSyncing = true
        defer { isSyncing = false }

        // Each table pulls + saves independently, so one bad row/table can't
        // roll back the entire sync (the previous single-shared-context save did).
        await pullTable("households", as: Household.self, userId: userId)
        await pullTable("user_profiles", as: UserProfile.self, userId: userId)
        await pullTable("family_members", as: FamilyMember.self, userId: userId)
        await pullTable("contacts", as: Contact.self, userId: userId)
        await pullTable("projects", as: Project.self, userId: userId)
        await pullTable("tasks", as: SymphonyTask.self, userId: userId, reconcile: false)
        await pullTable("routines", as: Routine.self, userId: userId)
        await pullTable("actionable_instances", as: ActionableInstance.self, userId: userId)
        await pullTable("event_notes", as: EventNote.self, userId: userId)
        await pullTable("weekly_templates", as: WeeklyTemplate.self, userId: userId)
        await pullTable("playbook_blocks", as: PlaybookBlock.self, userId: userId)
        await pullTable("playbook_instances", as: PlaybookInstance.self, userId: userId)
        await pullTable("family_rules", as: FamilyRule.self, userId: userId)
        await pullTable("responsibilities", as: Responsibility.self, userId: userId)
    }

    // MARK: - Pull

    private func pullTable<T: PersistentModel & HasUUID>(_ table: String, as type: T.Type, userId: UUID, reconcile: Bool = true) async {
        let context = ModelContext(modelContainer)
        do {
            let rows: [[String: AnyJSON]] = try await supabase
                .from(table)
                .select()
                .execute()
                .value

            let serverIds = Set(rows.compactMap { $0["id"]?.stringValue?.lowercased() })

            // Rows with a queued (not-yet-pushed) local change are off-limits in
            // BOTH phases: deleting one as "gone from server" destroys a local
            // creation before it ever pushes (write-then-vanish), and replacing
            // one with the server row silently reverts a local edit.
            let pendingIds: Set<UUID> = Set(
                ((try? context.fetch(FetchDescriptor<PendingChange>())) ?? [])
                    .filter { $0.tableName == table }
                    .map(\.recordId)
            )

            // Phase 1: delete any local row we're about to replace (same id), plus —
            // for server-owned tables — rows that no longer exist on the server
            // (stale duplicates, deleted people, etc.). NOT tasks for the latter,
            // which can have locally-created rows that haven't pushed yet.
            //
            // We delete-then-insert (with a save between the phases) rather than a
            // bare insert because SwiftData's implicit unique-id upsert does NOT
            // reliably overwrite an existing row's fields — so a server change like
            // a task completed on the web was silently dropped on any device that
            // already had that task locally.
            var deleted = 0
            if let locals = try? context.fetch(FetchDescriptor<T>()) {
                for item in locals {
                    if pendingIds.contains(item.id) { continue }   // local edit wins until pushed
                    let idStr = item.id.uuidString.lowercased()
                    if serverIds.contains(idStr) {
                        context.delete(item)            // replaced by the fresh row below
                    } else if reconcile {
                        context.delete(item)            // gone from server
                        deleted += 1
                    }
                }
            }
            try context.save()

            // Phase 2: insert the fresh server rows (skipping ones we kept above).
            var inserted = 0
            for row in rows {
                guard let model = RowMapper.toModel(type, from: row) else { continue }
                if pendingIds.contains(model.id) { continue }
                context.insert(model)
                inserted += 1
            }
            try context.save()

            Self.syncLog.info("pull \(table, privacy: .public): fetched \(rows.count) inserted \(inserted) deleted \(deleted)")
        } catch {
            Self.syncLog.error("pull \(table, privacy: .public) FAILED: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Push

    private func pushChange(_ change: PendingChange, context: ModelContext) async throws {
        switch change.changeType {
        case "insert":
            // INSERT for a brand-new local row (its user_id is the current user, so
            // the INSERT policy's `auth.uid() = user_id` check passes). Upsert keeps
            // it idempotent on retry. actionable_instances additionally has a
            // UNIQUE(user_id, entity_type, entity_id, date) key — if the web/wall
            // created the same day's instance first (different id), conflict on
            // that natural key and update it instead of failing the push forever.
            guard let row = Self.serializeRow(table: change.tableName, id: change.recordId, context: context) else { return }
            let conflictKey = Self.naturalKey(for: change.tableName)?.joined(separator: ",")
            if let conflictKey {
                var naturalRow = row
                naturalRow.removeValue(forKey: "id")   // let the existing row keep its id
                try await supabase
                    .from(change.tableName)
                    .upsert(AnyJSON.object(naturalRow), onConflict: conflictKey)
                    .execute()
            } else {
                try await supabase
                    .from(change.tableName)
                    .upsert(AnyJSON.object(row))
                    .execute()
            }
            Self.syncLog.info("pushed insert \(change.tableName, privacy: .public)")

        case "update":
            // Plain UPDATE — NOT upsert. The tasks INSERT policy requires
            // auth.uid() == user_id, so upserting a household member's task (which
            // you can edit but don't own) is rejected by the insert check. A bare
            // UPDATE only evaluates the UPDATE policy, which allows household edits.
            // Drop id/user_id so we never try to change ownership.
            guard var row = Self.serializeRow(table: change.tableName, id: change.recordId, context: context) else { return }
            let matchColumns = Self.naturalKey(for: change.tableName)
            var filters: [(String, String)] = []
            if let matchColumns {
                // Match on the natural key: a locally-created instance may have a
                // different id than the server row it landed on (insert upserts on
                // the natural key and lets the server keep its id), so an id match
                // would silently update 0 rows.
                for column in matchColumns {
                    guard let value = row[column]?.stringValue else { return }
                    filters.append((column, value))
                    row.removeValue(forKey: column)
                }
            } else {
                filters.append(("id", change.recordId.uuidString))
            }
            row.removeValue(forKey: "id")
            row.removeValue(forKey: "user_id")
            var query = try supabase.from(change.tableName).update(AnyJSON.object(row))
            for (column, value) in filters {
                query = query.eq(column, value: value)
            }
            try await query.execute()
            Self.syncLog.info("pushed update \(change.tableName, privacy: .public)")

        case "delete":
            try await supabase
                .from(change.tableName)
                .delete()
                .eq("id", value: change.recordId.uuidString)
                .execute()
            Self.syncLog.info("pushed delete \(change.tableName, privacy: .public)")

        default:
            break
        }
    }

    /// Tables whose pushes match rows by a semantic unique key instead of `id`
    /// (values are read from the serialized row, so household-owned rows keep
    /// their true user_id).
    private static func naturalKey(for table: String) -> [String]? {
        switch table {
        case "actionable_instances": ["user_id", "entity_type", "entity_id", "date"]
        case "event_notes": ["user_id", "google_event_id"]
        default: nil
        }
    }

    // MARK: - Model → Row serialization (for push)

    private static let isoOut = ISO8601DateFormatter()

    static func serializeRow(table: String, id: UUID, context: ModelContext) -> [String: AnyJSON]? {
        func find<T: PersistentModel & HasUUID>(_ type: T.Type) -> T? {
            (try? context.fetch(FetchDescriptor<T>()))?.first(where: { $0.id == id })
        }
        switch table {
        case "tasks":
            guard let t = find(SymphonyTask.self) else { return nil }
            return taskRow(t)
        case "routines":
            guard let r = find(Routine.self) else { return nil }
            return routineRow(r)
        case "projects":
            guard let p = find(Project.self) else { return nil }
            return projectRow(p)
        case "contacts":
            guard let c = find(Contact.self) else { return nil }
            return contactRow(c)
        case "family_rules":
            guard let f = find(FamilyRule.self) else { return nil }
            return familyRuleRow(f)
        case "actionable_instances":
            guard let i = find(ActionableInstance.self) else { return nil }
            return instanceRow(i)
        case "event_notes":
            guard let n = find(EventNote.self) else { return nil }
            return eventNoteRow(n)
        default:
            return nil   // other tables aren't edited from iOS
        }
    }

    /// Local-day formatter for Postgres DATE columns (yyyy-MM-dd, user's timezone —
    /// an ISO timestamp here would shift the day near midnight and break the
    /// (user, entity, date) unique key that routine completions dedupe on).
    private static let dateOnlyOut: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    // Shared column encoders for the row builders below.
    private static func s(_ v: String?) -> AnyJSON { v.map { .string($0) } ?? .null }
    private static func i(_ v: Int?) -> AnyJSON { v.map { .integer($0) } ?? .null }
    private static func d(_ v: Date?) -> AnyJSON { v.map { .string(isoOut.string(from: $0)) } ?? .null }
    private static func dateOnly(_ v: Date?) -> AnyJSON { v.map { .string(dateOnlyOut.string(from: $0)) } ?? .null }
    private static func u(_ v: UUID?) -> AnyJSON { v.map { .string($0.uuidString) } ?? .null }
    private static func us(_ v: [UUID]?) -> AnyJSON { v.map { .array($0.map { .string($0.uuidString) }) } ?? .null }
    private static func ss(_ v: [String]?) -> AnyJSON { v.map { .array($0.map { .string($0) }) } ?? .null }
    private static func j<T: Encodable>(_ v: T?) -> AnyJSON {
        guard let v, let data = try? JSONEncoder().encode(v),
              let any = try? JSONDecoder().decode(AnyJSON.self, from: data) else { return .null }
        return any
    }

    private static func taskRow(_ t: SymphonyTask) -> [String: AnyJSON] {
        var row: [String: AnyJSON] = [
            "id": .string(t.id.uuidString),
            "user_id": .string(t.userId.uuidString),
            "title": .string(t.title),
            "completed": .bool(t.completed),
            "scheduled_for": d(t.scheduledFor),
            "deferred_until": d(t.deferredUntil),
            "defer_count": .integer(t.deferCount),
            "is_all_day": .bool(t.isAllDay),
            "bucket": s(t.bucket),
            "estimated_duration": i(t.estimatedDuration),
            "context": s(t.context),
            "category": s(t.category),
            "notes": s(t.notes),
            "links": j(t.links),
            "phone_number": s(t.phoneNumber),
            "location": s(t.location),
            "location_place_id": s(t.locationPlaceId),
            "contact_id": u(t.contactId),
            "assigned_to": u(t.assignedTo),
            "assigned_to_all": us(t.assignedToAll),
            "project_id": u(t.projectId),
            "parent_task_id": u(t.parentTaskId),
            "link_type": s(t.linkType),
            "created_at": .string(isoOut.string(from: t.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
        // Only send capture_meta when this task IS a photo capture — a blanket
        // null would wipe server-side capture state written by analyze-capture
        // (UPDATE only touches the columns present in the row).
        if let status = t.captureStatus {
            row["capture_meta"] = j(CaptureMeta(
                status: status,
                storage_path: t.captureStoragePath,
                suggested_task_id: t.captureSuggestedTaskId?.uuidString
            ))
        }
        return row
    }

    // Column sets below are the intersection of the iOS model's fields and the
    // production schema — pushing a column Postgres doesn't have rejects the
    // whole row (the "phantom columns" incident), and omitted server-only
    // columns (e.g. routines.times_per_day) are left untouched by UPDATE.

    private static func routineRow(_ r: Routine) -> [String: AnyJSON] {
        [
            "id": .string(r.id.uuidString),
            "user_id": .string(r.userId.uuidString),
            "name": .string(r.name),
            "description": s(r.routineDescription),
            "visibility": .string(r.visibility),
            "recurrence_pattern": j(r.recurrencePattern),
            "time_of_day": s(r.timeOfDay),
            "context": s(r.context),
            "assigned_to": u(r.assignedTo),
            "created_at": .string(isoOut.string(from: r.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func projectRow(_ p: Project) -> [String: AnyJSON] {
        [
            "id": .string(p.id.uuidString),
            "user_id": .string(p.userId.uuidString),
            "name": .string(p.name),
            "status": .string(p.status),
            "context": s(p.context),
            "type": s(p.type),
            "notes": s(p.notes),
            "links": j(p.links),
            "phone_number": s(p.phoneNumber),
            "parent_id": u(p.parentId),
            "created_at": .string(isoOut.string(from: p.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func contactRow(_ c: Contact) -> [String: AnyJSON] {
        [
            "id": .string(c.id.uuidString),
            "user_id": .string(c.userId.uuidString),
            "name": .string(c.name),
            "phone": s(c.phone),
            "email": s(c.email),
            "notes": s(c.notes),
            "category": s(c.category),
            "birthday": dateOnly(c.birthday),
            "relationship": s(c.relationship),
            "preferences": s(c.preferences),
            "created_at": .string(isoOut.string(from: c.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func familyRuleRow(_ f: FamilyRule) -> [String: AnyJSON] {
        [
            "id": .string(f.id.uuidString),
            "user_id": .string(f.userId.uuidString),
            "rule": .string(f.rule),
            "applies_to": ss(f.appliesTo),
            "status": .string(f.status),
            "rationale": s(f.rationale),
            "enforcement_tip": s(f.enforcementTip),
            "created_at": .string(isoOut.string(from: f.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func instanceRow(_ i: ActionableInstance) -> [String: AnyJSON] {
        [
            "id": .string(i.id.uuidString),
            "user_id": .string(i.userId.uuidString),
            "entity_type": .string(i.entityType),
            "entity_id": .string(i.entityId),
            "date": dateOnly(i.date),
            "status": .string(i.status),
            "assignee": u(i.assignee),
            "assigned_to_override": u(i.assignedToOverride),
            "deferred_to": d(i.deferredTo),
            "completed_at": d(i.completedAt),
            "skipped_at": d(i.skippedAt),
            "created_at": .string(isoOut.string(from: i.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    /// Exact `event_notes` column set (model ∩ schema). Notes/links are what the
    /// card edits; the rest are round-tripped so an iOS write never nulls a
    /// server-set field. natural key (user_id, google_event_id) is dropped from
    /// the row by the UPDATE path, which matches on it instead.
    private static func eventNoteRow(_ n: EventNote) -> [String: AnyJSON] {
        [
            "id": .string(n.id.uuidString),
            "user_id": .string(n.userId.uuidString),
            "google_event_id": .string(n.googleEventId),
            "notes": s(n.notes),
            "links": j(n.links),
            "event_title": s(n.eventTitle),
            "event_start_time": d(n.eventStartTime),
            "context": s(n.context),
            "shared_with_family": .bool(n.sharedWithFamily),
            "share_nudge_dismissed": .bool(n.shareNudgeDismissed),
            "assigned_to": u(n.assignedTo),
            "assigned_to_all": us(n.assignedToAll),
            "recipe_url": s(n.recipeUrl),
            "project_id": u(n.projectId),
            "created_at": .string(isoOut.string(from: n.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    // MARK: - Realtime Subscriptions

    private func subscribeToRealtime() async {
        let tablesToWatch = ["tasks", "projects", "routines", "contacts", "family_members",
                             "actionable_instances", "event_notes", "playbook_blocks", "playbook_instances",
                             "family_rules", "responsibilities"]

        for table in tablesToWatch {
            let channel = supabase.realtimeV2.channel("public:\(table)")

            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table)

            Task { [weak self] in
                for await change in changes {
                    await self?.handleRealtimeChange(table: table, change: change)
                }
            }

            await channel.subscribe()
            realtimeChannels.append(channel)
        }
    }

    private func handleRealtimeChange(table: String, change: AnyAction) async {
        let context = ModelContext(modelContainer)

        switch change {
        case .insert(let action):
            handleInsertOrUpdate(table: table, record: action.record, context: context)
        case .update(let action):
            handleInsertOrUpdate(table: table, record: action.record, context: context)
        case .delete(let action):
            handleDelete(table: table, oldRecord: action.oldRecord, context: context)
        }

        do {
            try context.save()
        } catch {
            print("[SyncEngine] Error saving realtime change for \(table): \(error)")
        }
    }

    private func handleInsertOrUpdate(table: String, record: [String: AnyJSON], context: ModelContext) {
        switch table {
        case "tasks":
            if let model = RowMapper.toModel(SymphonyTask.self, from: record) { upsert(model, context: context) }
        case "projects":
            if let model = RowMapper.toModel(Project.self, from: record) { upsert(model, context: context) }
        case "routines":
            if let model = RowMapper.toModel(Routine.self, from: record) { upsert(model, context: context) }
        case "contacts":
            if let model = RowMapper.toModel(Contact.self, from: record) { upsert(model, context: context) }
        case "family_members":
            if let model = RowMapper.toModel(FamilyMember.self, from: record) { upsert(model, context: context) }
        case "actionable_instances":
            if let model = RowMapper.toModel(ActionableInstance.self, from: record) { upsert(model, context: context) }
        case "event_notes":
            if let model = RowMapper.toModel(EventNote.self, from: record) { upsert(model, context: context) }
        case "playbook_blocks":
            if let model = RowMapper.toModel(PlaybookBlock.self, from: record) { upsert(model, context: context) }
        case "playbook_instances":
            if let model = RowMapper.toModel(PlaybookInstance.self, from: record) { upsert(model, context: context) }
        case "family_rules":
            if let model = RowMapper.toModel(FamilyRule.self, from: record) { upsert(model, context: context) }
        case "responsibilities":
            if let model = RowMapper.toModel(Responsibility.self, from: record) { upsert(model, context: context) }
        default:
            break
        }
    }

    /// Replace any locally-stored row with the same id, then insert the fresh
    /// model. SwiftData's implicit unique-constraint upsert does NOT reliably
    /// overwrite an existing row's fields (especially across ModelContexts), so a
    /// realtime UPDATE — e.g. a task checked off on the web — was being dropped on
    /// devices that already had the row. Deleting (and saving) before inserting
    /// guarantees the local row matches the server and avoids a unique-constraint
    /// conflict within a single transaction.
    private func upsert<T: PersistentModel & HasUUID>(_ model: T, context: ModelContext) {
        let targetId = model.id
        // A queued-but-unpushed local edit outranks the incoming server row —
        // replacing it here would silently revert the edit (the push loop will
        // send it up within seconds, and the resulting realtime echo converges).
        let hasPendingLocalChange = ((try? context.fetch(FetchDescriptor<PendingChange>())) ?? [])
            .contains { $0.recordId == targetId }
        if hasPendingLocalChange { return }
        if let existing = try? context.fetch(FetchDescriptor<T>()).first(where: { $0.id == targetId }) {
            context.delete(existing)
            try? context.save()
        }
        context.insert(model)
    }

    private func handleDelete(table: String, oldRecord: [String: AnyJSON], context: ModelContext) {
        guard let idString = oldRecord["id"]?.stringValue,
              let id = UUID(uuidString: idString) else { return }

        switch table {
        case "tasks":
            deleteById(SymphonyTask.self, id: id, context: context)
        case "projects":
            deleteById(Project.self, id: id, context: context)
        case "routines":
            deleteById(Routine.self, id: id, context: context)
        case "contacts":
            deleteById(Contact.self, id: id, context: context)
        case "family_members":
            deleteById(FamilyMember.self, id: id, context: context)
        case "actionable_instances":
            deleteById(ActionableInstance.self, id: id, context: context)
        case "event_notes":
            deleteById(EventNote.self, id: id, context: context)
        case "playbook_blocks":
            deleteById(PlaybookBlock.self, id: id, context: context)
        case "playbook_instances":
            deleteById(PlaybookInstance.self, id: id, context: context)
        case "family_rules":
            deleteById(FamilyRule.self, id: id, context: context)
        case "responsibilities":
            deleteById(Responsibility.self, id: id, context: context)
        default:
            break
        }
    }

    private func deleteById<T: PersistentModel>(_ type: T.Type, id: UUID, context: ModelContext) {
        let descriptor = FetchDescriptor<T>(predicate: #Predicate { _ in true })
        do {
            let results = try context.fetch(descriptor)
            for item in results {
                if let identifiable = item as? HasUUID, identifiable.id == id {
                    context.delete(item)
                    return
                }
            }
        } catch {
            print("[SyncEngine] Error deleting \(T.self): \(error)")
        }
    }

    // MARK: - Network Monitoring

    private func startNetworkMonitoring() {
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            Task { [weak self] in
                let wasOffline = await self?.isOnline == false
                await self?.setOnline(path.status == .satisfied)
                if wasOffline && path.status == .satisfied {
                    await self?.pushPendingChanges()
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.symphonyos.network-monitor"))
        networkMonitor = monitor
    }

    private func setOnline(_ value: Bool) {
        isOnline = value
    }
}

// MARK: - AnyJSON Helpers

extension AnyJSON {
    var stringValue: String? {
        if case .string(let str) = self { return str }
        return nil
    }

    static func from(_ value: Any) -> AnyJSON {
        switch value {
        case let s as String: return .string(s)
        case let n as Int: return .integer(n)
        case let n as Double: return .double(n)
        case let b as Bool: return .bool(b)
        case is NSNull: return .null
        case let arr as [Any]: return .array(arr.map { from($0) })
        case let dict as [String: Any]: return .object(dict.mapValues { from($0) })
        default: return .string(String(describing: value))
        }
    }
}

// MARK: - Stable id access for reconciliation
//
// SwiftData @Model instances don't expose stored properties via Mirror (they're
// backed by a hidden store), so the sync engine reads `id` through this protocol
// instead of reflection — which silently returned nil before, making deletion
// reconciliation a no-op (stale duplicates like a second "Iris" never cleared).
protocol HasUUID { var id: UUID { get } }

extension SymphonyTask: HasUUID {}
extension Project: HasUUID {}
extension Routine: HasUUID {}
extension Contact: HasUUID {}
extension FamilyMember: HasUUID {}
extension ActionableInstance: HasUUID {}
extension EventNote: HasUUID {}
extension WeeklyTemplate: HasUUID {}
extension PlaybookBlock: HasUUID {}
extension PlaybookInstance: HasUUID {}
extension FamilyRule: HasUUID {}
extension Responsibility: HasUUID {}
extension Household: HasUUID {}
extension UserProfile: HasUUID {}
