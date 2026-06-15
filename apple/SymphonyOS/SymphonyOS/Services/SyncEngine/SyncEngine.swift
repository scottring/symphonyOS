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
                    // Keep in queue for retry (up to 10 attempts)
                    if change.attempts >= 10 {
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
        await pullTable("weekly_templates", as: WeeklyTemplate.self, userId: userId)
        await pullTable("playbook_blocks", as: PlaybookBlock.self, userId: userId)
        await pullTable("playbook_instances", as: PlaybookInstance.self, userId: userId)
        await pullTable("family_rules", as: FamilyRule.self, userId: userId)
        await pullTable("responsibilities", as: Responsibility.self, userId: userId)
    }

    // MARK: - Pull

    private func pullTable<T: PersistentModel>(_ table: String, as type: T.Type, userId: UUID, reconcile: Bool = true) async {
        let context = ModelContext(modelContainer)
        do {
            let rows: [[String: AnyJSON]] = try await supabase
                .from(table)
                .select()
                .execute()
                .value

            var inserted = 0
            for row in rows {
                guard let model = RowMapper.toModel(type, from: row) else { continue }
                context.insert(model)
                inserted += 1
            }

            // Reconcile deletions: drop local rows that no longer exist on the
            // server (stale duplicates, deleted people, etc.). Only for
            // server-owned tables — NOT tasks, which can have locally-created
            // rows that haven't pushed yet.
            var deleted = 0
            if reconcile {
                let serverIds = Set(rows.compactMap { $0["id"]?.stringValue?.lowercased() })
                if let locals = try? context.fetch(FetchDescriptor<T>()) {
                    for item in locals {
                        guard let identifiable = item as? HasUUID else { continue }
                        if !serverIds.contains(identifiable.id.uuidString.lowercased()) {
                            context.delete(item)
                            deleted += 1
                        }
                    }
                }
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
        case "insert", "update":
            // Serialize the CURRENT local entity and upsert it. (The old code keyed
            // off change.payload, which was never populated — so nothing ever pushed
            // and every iOS edit was silently dropped on the next pull.)
            guard let row = Self.serializeRow(table: change.tableName, id: change.recordId, context: context) else { return }
            try await supabase
                .from(change.tableName)
                .upsert(AnyJSON.object(row))
                .execute()
            Self.syncLog.info("pushed \(change.changeType, privacy: .public) \(change.tableName, privacy: .public)")

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

    // MARK: - Model → Row serialization (for push)

    private static let isoOut = ISO8601DateFormatter()

    static func serializeRow(table: String, id: UUID, context: ModelContext) -> [String: AnyJSON]? {
        switch table {
        case "tasks":
            let descriptor = FetchDescriptor<SymphonyTask>()
            guard let t = (try? context.fetch(descriptor))?.first(where: { $0.id == id }) else { return nil }
            return taskRow(t)
        default:
            return nil   // other tables aren't edited from iOS yet
        }
    }

    private static func taskRow(_ t: SymphonyTask) -> [String: AnyJSON] {
        func s(_ v: String?) -> AnyJSON { v.map { .string($0) } ?? .null }
        func i(_ v: Int?) -> AnyJSON { v.map { .integer($0) } ?? .null }
        func d(_ v: Date?) -> AnyJSON { v.map { .string(isoOut.string(from: $0)) } ?? .null }
        func u(_ v: UUID?) -> AnyJSON { v.map { .string($0.uuidString) } ?? .null }
        func us(_ v: [UUID]?) -> AnyJSON { v.map { .array($0.map { .string($0.uuidString) }) } ?? .null }
        func j<T: Encodable>(_ v: T?) -> AnyJSON {
            guard let v, let data = try? JSONEncoder().encode(v),
                  let any = try? JSONDecoder().decode(AnyJSON.self, from: data) else { return .null }
            return any
        }
        return [
            "id": .string(t.id.uuidString),
            "user_id": .string(t.userId.uuidString),
            "title": .string(t.title),
            "completed": .bool(t.completed),
            "scheduled_for": d(t.scheduledFor),
            "deferred_until": d(t.deferredUntil),
            "defer_count": .integer(t.deferCount),
            "is_all_day": .bool(t.isAllDay),
            "is_someday": .bool(t.isSomeday),
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
            "linked_to": j(t.linkedTo),
            "link_type": s(t.linkType),
            "created_at": .string(isoOut.string(from: t.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    // MARK: - Realtime Subscriptions

    private func subscribeToRealtime() async {
        let tablesToWatch = ["tasks", "projects", "routines", "contacts", "family_members",
                             "actionable_instances", "playbook_blocks", "playbook_instances",
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
            if let model = RowMapper.toModel(SymphonyTask.self, from: record) {
                context.insert(model)
            }
        case "projects":
            if let model = RowMapper.toModel(Project.self, from: record) {
                context.insert(model)
            }
        case "routines":
            if let model = RowMapper.toModel(Routine.self, from: record) {
                context.insert(model)
            }
        case "contacts":
            if let model = RowMapper.toModel(Contact.self, from: record) {
                context.insert(model)
            }
        case "family_members":
            if let model = RowMapper.toModel(FamilyMember.self, from: record) {
                context.insert(model)
            }
        case "actionable_instances":
            if let model = RowMapper.toModel(ActionableInstance.self, from: record) {
                context.insert(model)
            }
        case "playbook_blocks":
            if let model = RowMapper.toModel(PlaybookBlock.self, from: record) {
                context.insert(model)
            }
        case "playbook_instances":
            if let model = RowMapper.toModel(PlaybookInstance.self, from: record) {
                context.insert(model)
            }
        case "family_rules":
            if let model = RowMapper.toModel(FamilyRule.self, from: record) {
                context.insert(model)
            }
        case "responsibilities":
            if let model = RowMapper.toModel(Responsibility.self, from: record) {
                context.insert(model)
            }
        default:
            break
        }
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
extension WeeklyTemplate: HasUUID {}
extension PlaybookBlock: HasUUID {}
extension PlaybookInstance: HasUUID {}
extension FamilyRule: HasUUID {}
extension Responsibility: HasUUID {}
extension Household: HasUUID {}
extension UserProfile: HasUUID {}
