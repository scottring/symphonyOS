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
    private var statusTasks: [Task<Void, Never>] = []
    private var networkMonitor: NWPathMonitor?
    private var isOnline = true
    private var isSyncing = false
    private var userId: UUID?
    private var pushTask: Task<Void, Never>?
    /// Told, once per pull, as soon as the signed-in person's `households` rows are in (signed in, the
    /// pull and its save succeeded), before the other fifteen tables: the light edition reads its
    /// edition from them (ruling D24). Nothing else about the pull changes.
    private var onHouseholds: (@MainActor @Sendable () -> Void)?

    // Tables we sync (in dependency order)
    static let syncedTables: [(tableName: String, modelType: any PersistentModel.Type)] = [
        ("households", Household.self),
        ("user_profiles", UserProfile.self),
        ("family_members", FamilyMember.self),
        ("contacts", Contact.self),
        ("projects", Project.self),
        ("goal_areas", GoalArea.self),
        ("tasks", SymphonyTask.self),
        ("routines", Routine.self),
        ("lists", SymphonyList.self),
        ("list_items", SymphonyListItem.self),
        ("actionable_instances", ActionableInstance.self),
        ("event_notes", EventNote.self),
        ("weekly_templates", WeeklyTemplate.self),
        ("task_commitments", TaskCommitment.self),
        ("task_focus", TaskFocus.self),
        ("goals", Goal.self),
    ]

    init(modelContainer: ModelContainer) {
        self.modelContainer = modelContainer
    }

    // MARK: - Public API

    /// Start sync for the given user. Call after login. Returns true when the
    /// first pull really ran (see `performInitialSync`). `onFirstPull` hears the
    /// same answer as soon as the pull is done, before the realtime channels
    /// join (each join can wait and retry for a long time on a poor network).
    @discardableResult
    func start(userId: UUID, onFirstPull: (@MainActor @Sendable (Bool) -> Void)? = nil,
               onHouseholds: (@MainActor @Sendable () -> Void)? = nil) async -> Bool {
        self.userId = userId
        self.onHouseholds = onHouseholds
        // Diagnostic + safeguard: force the auth session to load so PostgREST
        // requests carry the user's JWT (anon requests return 0 rows under RLS).
        do {
            let session = try await supabase.auth.session
            Self.syncLog.info("auth at sync: user=\(session.user.id.uuidString, privacy: .public) tokenLen=\(session.accessToken.count)")
        } catch {
            Self.syncLog.error("auth at sync: NO SESSION (\(error.localizedDescription, privacy: .public)) — requests will be anon")
        }
        startNetworkMonitoring()
        let pulled = await performInitialSync()
        await onFirstPull?(pulled)
        await subscribeToRealtime()
        startPushLoop()
        return pulled
    }

    /// Re-sync after the app returns to the foreground.
    ///
    /// iOS suspends a backgrounded app, which kills the realtime socket, and
    /// `postgres_changes` has **no replay** — anything that happened while we were
    /// away is never delivered, not even after the socket reconnects. Since
    /// `performInitialSync` previously ran only at login, the only way to see that
    /// work was to force-relaunch the app: Scott deleted "Jax to good doggie
    /// daycare" on the web and the row sat on his phone until he restarted it.
    ///
    /// Push first so local edits are on the server before the pull reconciles
    /// against it, then re-establish the socket so live changes flow again.
    /// Returns true when the pull really ran (see `performInitialSync`);
    /// `onFirstPull` hears it before the channels are joined again, as in `start`.
    @discardableResult
    func resync(onFirstPull: (@MainActor @Sendable (Bool) -> Void)? = nil) async -> Bool {
        guard userId != nil, isOnline, !isSyncing else { return false }
        await pushPendingChanges()
        let pulled = await performInitialSync()
        await onFirstPull?(pulled)
        await resubscribeToRealtime()
        return pulled
    }

    /// Tear the channels down and re-subscribe. A socket that was suspended can
    /// come back in a half-dead state that still accepts `subscribe()` but never
    /// delivers, so this replaces rather than tops up — and without the teardown
    /// every foreground would stack another set of channels.
    private func resubscribeToRealtime() async {
        for task in statusTasks { task.cancel() }
        statusTasks.removeAll()
        // removeChannel, NOT unsubscribe: unsubscribe leaves the topic registered on
        // the realtime client, and `channel(topic)` hands back that same instance —
        // so re-subscribing would stack a second postgresChange callback on it and
        // every event would be handled twice. removeChannel clears the registry so
        // subscribeToRealtime builds genuinely fresh channels.
        for channel in realtimeChannels {
            await supabase.realtimeV2.removeChannel(channel)
        }
        realtimeChannels.removeAll()
        await subscribeToRealtime()
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
        for task in statusTasks { task.cancel() }
        statusTasks.removeAll()
        // removeChannel, NOT unsubscribe: unsubscribe leaves the topic registered on
        // the realtime client, and `channel(topic)` hands back that same instance —
        // so re-subscribing would stack a second postgresChange callback on it and
        // every event would be handled twice. removeChannel clears the registry so
        // subscribeToRealtime builds genuinely fresh channels.
        for channel in realtimeChannels {
            await supabase.realtimeV2.removeChannel(channel)
        }
        realtimeChannels.removeAll()
        networkMonitor?.cancel()
        networkMonitor = nil
    }

    /// Stops, then waits for a push or pull already under way to finish (`stop` does not: the actor
    /// lets one carry on across its awaits), so nothing it sends or brings in lands after the
    /// caller's next step. Used only by a demo started over (`DemoReset`), before the server is
    /// emptied. False when it is still busy after `timeout`.
    func stopAndSettle(timeout: Duration = .seconds(15)) async -> Bool {
        await stop()
        let clock = ContinuousClock()
        let deadline = clock.now + timeout
        while isSyncing {
            guard clock.now < deadline else { return false }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return true
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
            // Parents go up before children. The queue is oldest first, so a
            // parent queued before its child already leads — but each change is
            // pushed on its own, and a child tried after its parent's insert
            // failed is refused by the foreign key (an update that fails ten
            // times is dropped, silently losing the link). Only links the phone
            // set (linksDirty / areaDirty) name a parent, so a clean row never
            // waits: a queue without walk-made links runs exactly as before.
            var queuedInserts: [UUID: PendingChange] = [:]
            for change in pendingChanges where change.changeType == "insert" {
                queuedInserts[change.recordId] = change
            }
            for change in pendingChanges {
                let parents = Self.parentIds(of: change, context: context)
                if change.changeType != "delete" {
                    // Skipped for this pass without counting an attempt; it goes
                    // once its parent's insert lands — or, if that insert keeps
                    // failing, it stops waiting and takes the ordinary path.
                    if !parents.isEmpty, Self.mustWait(parents: parents, unpushedInserts: Self.insertsWorthWaitingFor(Array(queuedInserts.values))) {
                        Self.syncLog.info("push \(change.tableName, privacy: .public) \(change.changeType, privacy: .public) \(change.recordId.uuidString, privacy: .public) waits for its parent's insert")
                        continue
                    }
                    // Likewise an update to a row whose own insert has not landed:
                    // it would "succeed" on zero rows and clear the link flag, and
                    // the insert would then go up without the links. Only for a
                    // row that sends links, so no other queue changes. (Its own
                    // queued insert already shields the row, so this adds no stall.)
                    if change.changeType == "update", queuedInserts[change.recordId] != nil,
                       Self.linkStamp(table: change.tableName, id: change.recordId, context: context) != nil {
                        Self.syncLog.info("push \(change.tableName, privacy: .public) update \(change.recordId.uuidString, privacy: .public) waits for its own insert")
                        continue
                    }
                }
                // The links this push sends, to compare with the row after the
                // network await (a Move or Pull up can re-link it meanwhile).
                let sentLinks = Self.linkStamp(table: change.tableName, id: change.recordId, context: context)
                do {
                    try await pushChange(change, context: context)
                    if change.changeType == "insert" { queuedInserts[change.recordId] = nil }
                    // Read the row as saved now, in a fresh context (this one's
                    // copy was read before the await). Re-linked meanwhile: the
                    // new links were never sent, so keep the flag and keep a
                    // change queued — which also shields the row from the next
                    // pull — and the next pass sends them.
                    let linksNow = Self.linkStamp(table: change.tableName, id: change.recordId,
                                                  context: ModelContext(modelContainer))
                    let outcome = Self.afterPush(changeType: change.changeType, sent: sentLinks, now: linksNow)
                    switch outcome {
                    case .done:
                        context.delete(change)
                    case .queueUpdateThenDone:
                        // The insert landed; the new links follow as an update.
                        context.queueSync(table: change.tableName, recordId: change.recordId, type: "update")
                        context.delete(change)
                    case .keepQueued:
                        break   // the update stays queued as it is and is sent again
                    }
                    // The phone's locally-derived scope just pushed — stop
                    // sending it on the next UPDATE until another edit
                    // recomputes it (SyncEngine.taskRow gates on this flag).
                    if change.tableName == "tasks",
                       let task = (try? context.fetch(FetchDescriptor<SymphonyTask>()))?.first(where: { $0.id == change.recordId }) {
                        task.scopeDirty = false
                        task.placementDirty = false
                        task.completedAtDirty = false
                        task.dismissedAtDirty = false
                        task.sortOrderDirty = false
                    }
                    if outcome == .done {
                        Self.clearLinkFlags(table: change.tableName, id: change.recordId, context: context)
                    }
                    if change.tableName == "routines",
                       let routine = (try? context.fetch(FetchDescriptor<Routine>()))?.first(where: { $0.id == change.recordId }) {
                        routine.scopeDirty = false
                    }
                    // A row that sends (or now has) links: write the decision to
                    // the store at once, with no await since the fresh read. Left
                    // for the end of the pass, a re-link made during a LATER
                    // change's await would dedupe against this still-stored
                    // change, which the end-of-pass save then deletes: nothing
                    // queued, and the next pull puts the server's links back.
                    if sentLinks != nil || linksNow != nil {
                        do { try context.save() } catch {
                            Self.syncLog.error("push \(change.tableName, privacy: .public): saving the link outcome FAILED: \(error.localizedDescription, privacy: .public)")
                        }
                    }
                } catch {
                    // A foreign-key refusal of a row that sends links: the server
                    // says a parent is not there. The links whose parents are not
                    // on this phone are the only candidates; unlink those, keep
                    // the flag and the change, and the next pass sends the nulls.
                    // Never decided from local absence alone: a partner's goal or
                    // area is valid on the server but never pulled here.
                    let rejection = Self.onPushRejected(table: change.tableName, code: Self.postgresCode(of: error),
                                                        parents: parents, queuedInserts: Set(queuedInserts.keys),
                                                        known: Self.knownIds(context: context))
                    if case .unlink(let lost) = rejection {
                        for parent in lost {
                            Self.syncLog.error("push \(change.tableName, privacy: .public) \(change.recordId.uuidString, privacy: .public): the server has no \(parent.uuidString, privacy: .public); unlinking it")
                        }
                        Self.clearLinks(to: lost, table: change.tableName, id: change.recordId, context: context)
                        do { try context.save() } catch {
                            Self.syncLog.error("push \(change.tableName, privacy: .public): saving the unlinked row FAILED: \(error.localizedDescription, privacy: .public)")
                        }
                        continue
                    }
                    change.attempts += 1
                    change.lastAttemptAt = Date()
                    // Surface the failure — silent push errors hid a schema drift
                    // (phantom columns) that dropped every iOS write for days.
                    Self.syncLog.error("push \(change.tableName, privacy: .public) \(change.changeType, privacy: .public) FAILED (attempt \(change.attempts)): \(error.localizedDescription, privacy: .public)")
                    // Keep in queue for retry (up to 10 attempts) — EXCEPT inserts,
                    // which retry forever. A queued change is also what shields its
                    // row from pull-reconcile, so dropping a failed insert would let
                    // the next launch delete a task the user typed on the phone and
                    // that exists nowhere else. That failure mode is real: a schema
                    // drift once rejected every iOS write for days. Updates/deletes
                    // are safe to give up on — the server row survives them.
                    if change.attempts >= Self.maxPushAttempts && change.changeType != "insert" {
                        Self.syncLog.error("DROPPING \(change.tableName, privacy: .public) \(change.changeType, privacy: .public) after 10 failed attempts")
                        context.delete(change)
                        // Given up on: a later unrelated edit must not re-send
                        // these stale local links (the next pull restores the
                        // server's, now that no change shields the row).
                        Self.clearLinkFlags(table: change.tableName, id: change.recordId, context: context)
                    }
                }
            }
            try context.save()
        } catch {
            print("[SyncEngine] Error pushing changes: \(error)")
        }
    }

    // MARK: - Initial Sync

    /// True only when it was online, signed in, and the `households`,
    /// `goal_areas`, `tasks` and `goals` pulls all succeeded: only then does an
    /// empty store mean the account really has no plan (the walk decides
    /// whether to start on it). Every other table still pulls as before.
    @discardableResult
    private func performInitialSync() async -> Bool {
        guard let userId, isOnline else { return false }
        isSyncing = true
        defer { isSyncing = false }
        // Without a session the requests go out anonymous, and RLS answers
        // every table with zero rows and no error: that is not "no plan".
        let signedIn = (try? await supabase.auth.session) != nil

        // Each table pulls + saves independently, so one bad row/table can't
        // roll back the entire sync (the previous single-shared-context save did).
        let households = await pullTable("households", as: Household.self, userId: userId)
        if signedIn && households { await onHouseholds?() }
        adoptHouseholdWeekStart()
        await pullTable("user_profiles", as: UserProfile.self, userId: userId)
        await pullTable("family_members", as: FamilyMember.self, userId: userId)
        await pullTable("contacts", as: Contact.self, userId: userId)
        await pullTable("projects", as: Project.self, userId: userId)
        // Life areas before the tasks and goals filed under them. Includes a
        // partner's Family areas (readable by RLS); the phone never edits one
        // whose userId is not the signed-in person.
        let areas = await pullTable("goal_areas", as: GoalArea.self, userId: userId)
        // Tasks reconcile like every other table. They used to be exempt, to protect
        // locally-created rows that hadn't pushed yet — but `pendingIds` in
        // `pullTable` already does exactly that, so the exemption bought nothing and
        // cost correctness: a task deleted or completed on the web while the app was
        // closed was never removed, because realtime only delivers deletes to a
        // RUNNING app. Scott's phone showed nine carried-over rows on 2026-08-08 of
        // which six no longer existed in the database at all.
        let tasks = await pullTable("tasks", as: SymphonyTask.self, userId: userId)
        await pullTable("routines", as: Routine.self, userId: userId)
        // Lists before their items, so a pull never leaves items pointing at a
        // list that isn't there yet.
        await pullTable("lists", as: SymphonyList.self, userId: userId)
        await pullTable("list_items", as: SymphonyListItem.self, userId: userId)
        await pullTable("actionable_instances", as: ActionableInstance.self, userId: userId)
        await pullTable("event_notes", as: EventNote.self, userId: userId)
        await pullTable("weekly_templates", as: WeeklyTemplate.self, userId: userId)
        // Planning: which week/month/season each task is committed to, who
        // chose what for which day, and the year's goals.
        await pullTable("task_commitments", as: TaskCommitment.self, userId: userId)
        await pullTable("task_focus", as: TaskFocus.self, userId: userId)
        let goals = await pullTable("goals", as: Goal.self, userId: userId)
        return signedIn && households && areas && tasks && goals
    }

    // MARK: - Pull

    /// Returns whether the fetch and both saves succeeded.
    @discardableResult
    private func pullTable<T: PersistentModel & HasUUID>(_ table: String, as type: T.Type, userId: UUID, reconcile: Bool = true) async -> Bool {
        let context = ModelContext(modelContainer)
        do {
            // PostgREST caps a bare select at the project's `max_rows` (1000 here).
            // Reconcile DELETES local rows missing from the response, so a single
            // truncated page would wipe every row past the cap off the device —
            // Scott already owns 514 tasks. Page until a short page comes back.
            var rows: [[String: AnyJSON]] = []
            let pageSize = 500
            var offset = 0
            while true {
                let page: [[String: AnyJSON]] = try await supabase
                    .from(table)
                    .select()
                    .range(from: offset, to: offset + pageSize - 1)
                    .execute()
                    .value
                rows.append(contentsOf: page)
                if page.count < pageSize { break }
                offset += pageSize
            }

            // Ids come from the mapped models, not the raw `id` column:
            // task_focus has no id column (its key is task/user/date) and
            // derives a stable local id from that key.
            let models = rows.compactMap { RowMapper.toModel(type, from: $0) }
            let serverIds = Set(models.map { $0.id.uuidString.lowercased() })

            // Rows with a queued (not-yet-pushed) local change are off-limits in
            // BOTH phases: deleting one as "gone from server" destroys a local
            // creation before it ever pushes (write-then-vanish), and replacing
            // one with the server row silently reverts a local edit.
            let pendingIds: Set<UUID> = Set(
                ((try? context.fetch(FetchDescriptor<PendingChange>())) ?? [])
                    .filter { $0.tableName == table }
                    .map(\.recordId)
            )

            // Phase 1: delete any local row we're about to replace (same id), plus
            // rows that no longer exist on the server (stale duplicates, deleted
            // people, tasks completed or deleted on another device). Locally-created
            // rows that haven't pushed yet are protected by `pendingIds` above.
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
            for model in models {
                if pendingIds.contains(model.id) { continue }
                context.insert(model)
                inserted += 1
            }
            try context.save()

            Self.syncLog.info("pull \(table, privacy: .public): fetched \(rows.count) inserted \(inserted) deleted \(deleted)")
            return true
        } catch {
            Self.syncLog.error("pull \(table, privacy: .public) FAILED: \(error.localizedDescription, privacy: .public)")
            return false
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
            guard let row = Self.serializeRow(table: change.tableName, id: change.recordId, context: context, forInsert: true) else { return }
            let conflictKey = Self.naturalKey(for: change.tableName)?.joined(separator: ",")
            if change.tableName == "task_focus" {
                // Focus rows are insert-or-nothing: the table has no UPDATE
                // policy, so an upsert that hit an existing row would fail RLS.
                var focusRow = row
                focusRow.removeValue(forKey: "id")
                try await supabase
                    .from(change.tableName)
                    .upsert(AnyJSON.object(focusRow), onConflict: "task_id,user_id,date", ignoreDuplicates: true)
                    .execute()
            } else if let conflictKey {
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
            if let payload = change.payload,
               let match = try? JSONDecoder().decode([String: String].self, from: payload) {
                // Keyed delete (task_focus has no id): the row is already gone
                // locally, so its key rode along in the payload.
                var query = supabase.from(change.tableName).delete()
                for (column, value) in match.sorted(by: { $0.key < $1.key }) {
                    query = query.eq(column, value: value)
                }
                try await query.execute()
            } else {
                try await supabase
                    .from(change.tableName)
                    .delete()
                    .eq("id", value: change.recordId.uuidString)
                    .execute()
            }
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
        // One commitment per (task, level, period): a web-made row for the same
        // key has a different id, so match on the key, never the local id.
        case "task_commitments": ["task_id", "level", "period_start"]
        default: nil
        }
    }

    // MARK: - Model → Row serialization (for push)

    private static let isoOut = ISO8601DateFormatter()

    static func serializeRow(table: String, id: UUID, context: ModelContext, forInsert: Bool = false) -> [String: AnyJSON]? {
        func find<T: PersistentModel & HasUUID>(_ type: T.Type) -> T? {
            (try? context.fetch(FetchDescriptor<T>()))?.first(where: { $0.id == id })
        }
        switch table {
        case "tasks":
            guard let t = find(SymphonyTask.self) else { return nil }
            return taskRow(t, forInsert: forInsert)
        case "routines":
            guard let r = find(Routine.self) else { return nil }
            return routineRow(r, forInsert: forInsert)
        case "projects":
            guard let p = find(Project.self) else { return nil }
            return projectRow(p)
        case "contacts":
            guard let c = find(Contact.self) else { return nil }
            return contactRow(c)
        case "actionable_instances":
            guard let i = find(ActionableInstance.self) else { return nil }
            return instanceRow(i)
        case "event_notes":
            guard let n = find(EventNote.self) else { return nil }
            return eventNoteRow(n)
        case "lists":
            guard let l = find(SymphonyList.self) else { return nil }
            return listRow(l)
        case "list_items":
            guard let i = find(SymphonyListItem.self) else { return nil }
            return listItemRow(i)
        case "task_commitments":
            guard let c = find(TaskCommitment.self) else { return nil }
            return commitmentRow(c)
        case "task_focus":
            guard let f = find(TaskFocus.self) else { return nil }
            return focusRow(f)
        case "goals":
            guard let g = find(Goal.self) else { return nil }
            return goalRow(g, forInsert: forInsert)
        case "goal_areas":
            guard let a = find(GoalArea.self) else { return nil }
            return goalAreaRow(a)
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
    private static func j<T: Encodable>(_ v: T?) -> AnyJSON {
        guard let v, let data = try? JSONEncoder().encode(v),
              let any = try? JSONDecoder().decode(AnyJSON.self, from: data) else { return .null }
        return any
    }

    private static func taskRow(_ t: SymphonyTask, forInsert: Bool = false) -> [String: AnyJSON] {
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
        // Only when set: a blanket null would wipe a week placement made on the
        // web. DATE column → local yyyy-MM-dd (dateOnly), never ISO.
        // A placement made on the phone (placementDirty) sends every period
        // stamp — nulls included, so moving a weekend task to a weekday clears
        // `weekend_start`. Otherwise only a set week_start rides along, so an
        // ordinary edit never nulls a placement made on the web.
        if t.placementDirty {
            row["week_start"] = dateOnly(t.weekStart)
            row["month_start"] = dateOnly(t.monthStart)
            row["season_start"] = dateOnly(t.seasonStart)
            row["weekend_start"] = dateOnly(t.weekendStart)
        } else if let ws = t.weekStart {
            row["week_start"] = dateOnly(ws)
        }
        // scope is derived on the phone at creation (PageParse.taskFields) and
        // whenever a context/assignee edit recomputes it (TaskViewModel.
        // reconcileScope, which flags scopeDirty). Sending it on every UPDATE
        // would echo a possibly-stale local value over a web-side relabel
        // (scope is otherwise server/web-owned) — only send it on INSERT, or
        // on an UPDATE the phone itself just changed.
        if (forInsert || t.scopeDirty), let scope = t.scope {
            row["scope"] = .string(scope)
        }
        // Only when the phone itself reordered it (the Week list): never a
        // stale order over one made on the web.
        if t.sortOrderDirty {
            row["sort_order"] = i(t.sortOrder)
        }
        // Only when the phone itself completed or reopened it (see
        // SymphonyTask.completedAt) — never a stale nil over the web's stamp.
        if forInsert || t.completedAtDirty {
            row["completed_at"] = d(t.completedAt)
        }
        // Only when the phone itself let it go (or undid that): never a stale
        // nil over a Let go made on the web.
        if t.dismissedAtDirty {
            row["dismissed_at"] = d(t.dismissedAt)
        }
        // Links: only when the phone itself set them (linksDirty), and then
        // all three, nulls included — like placementDirty. A row pulled from
        // the server sends none back, so an edit here never overwrites or
        // nulls a link made on the web. is_goal, goal_task_id and
        // supports_goal_task_id are never sent (guarded server-side; the web
        // writes source_id / goal_id instead).
        if t.linksDirty {
            row["goal_id"] = u(t.goalId)
            row["source_id"] = u(t.sourceId)
            row["area_id"] = u(t.areaId)
        }
        return row
    }

    // Column sets below are the intersection of the iOS model's fields and the
    // production schema — pushing a column Postgres doesn't have rejects the
    // whole row (the "phantom columns" incident), and omitted server-only
    // columns (e.g. routines.times_per_day) are left untouched by UPDATE.

    private static func routineRow(_ r: Routine, forInsert: Bool = false) -> [String: AnyJSON] {
        var row: [String: AnyJSON] = [
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
        // Like tasks: on INSERT, or an UPDATE whose context/assignee edit
        // recomputed it — otherwise a web-side change is never echoed back.
        if (forInsert || r.scopeDirty), let scope = r.scope {
            row["scope"] = .string(scope)
        }
        return row
    }

    private static func listRow(_ l: SymphonyList) -> [String: AnyJSON] {
        [
            "id": .string(l.id.uuidString),
            "user_id": .string(l.userId.uuidString),
            "title": .string(l.title),
            "icon": s(l.icon),
            "category": .string(l.category),
            "visibility": .string(l.visibility),
            "sort_order": .double(Double(l.sortOrder)),
            "created_at": .string(isoOut.string(from: l.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func listItemRow(_ i: SymphonyListItem) -> [String: AnyJSON] {
        // `is_checked` is deliberately absent: it's the legacy twin of
        // `completed`, NOT NULL but defaulted, so leaving it out is safe on
        // insert and avoids writing a column the web no longer reads.
        [
            "id": .string(i.id.uuidString),
            "user_id": .string(i.userId.uuidString),
            "list_id": .string(i.listId.uuidString),
            "text": .string(i.text),
            "note": s(i.note),
            "completed": .bool(i.completed),
            "completed_at": i.completedAt.map { AnyJSON.string(isoOut.string(from: $0)) } ?? .null,
            "sort_order": .double(Double(i.sortOrder)),
            "parent_item_id": u(i.parentItemId),
            "created_at": .string(isoOut.string(from: i.createdAt)),
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
            "planned_on": dateOnly(i.plannedOn),
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
            "is_free": .bool(n.isFree),
            "created_at": .string(isoOut.string(from: n.createdAt)),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
    }

    private static func commitmentRow(_ c: TaskCommitment) -> [String: AnyJSON] {
        [
            "id": .string(c.id.uuidString),
            "task_id": .string(c.taskId.uuidString),
            "level": .string(c.level),
            "period_start": dateOnly(c.periodStart),
            "status": .string(c.status),
            "carried_to": dateOnly(c.carriedTo),
            "created_by": u(c.createdBy),
            "ended_at": d(c.endedAt),
        ]
    }

    /// The fields the phone edits — the web's addGoal / updateGoal columns.
    /// strategy/domain/layer/carried_from are web-owned and omitted, so an
    /// UPDATE leaves them untouched; `area_id` goes up only when the phone
    /// itself set it (`areaDirty`). `scope` rides on INSERT only (derived from
    /// the life area, as the web does); an update never re-derives sharing.
    private static func goalRow(_ g: Goal, forInsert: Bool) -> [String: AnyJSON] {
        var row: [String: AnyJSON] = [
            "id": .string(g.id.uuidString),
            "user_id": .string(g.userId.uuidString),
            "name": .string(g.name),
            "year": .integer(g.year),
            "status": .string(g.status),
            "notes": s(g.notes),
            "context": s(g.context),
            "sort_order": .integer(g.sortOrder),
            "updated_at": .string(isoOut.string(from: Date())),
        ]
        if forInsert { row["scope"] = .string(g.scope ?? "individual") }
        if g.areaDirty { row["area_id"] = u(g.areaId) }
        return row
    }

    /// The live `goal_areas` columns (it has no updated_at).
    private static func goalAreaRow(_ a: GoalArea) -> [String: AnyJSON] {
        [
            "id": .string(a.id.uuidString),
            "user_id": .string(a.userId.uuidString),
            "name": .string(a.name),
            "sort_order": .integer(a.sortOrder),
            "context": s(a.context),
            "created_at": .string(isoOut.string(from: a.createdAt)),
        ]
    }

    private static func focusRow(_ f: TaskFocus) -> [String: AnyJSON] {
        [
            "id": .string(f.id.uuidString),   // dropped before the push
            "task_id": .string(f.taskId.uuidString),
            "user_id": .string(f.userId.uuidString),
            "date": dateOnly(f.date),
        ]
    }

    // MARK: - Realtime Subscriptions

    private func subscribeToRealtime() async {
        let tablesToWatch = ["tasks", "projects", "routines", "contacts", "family_members",
                             "actionable_instances", "event_notes"]

        for table in tablesToWatch {
            let channel = supabase.realtimeV2.channel("public:\(table)")

            let changes = channel.postgresChange(AnyAction.self, schema: "public", table: table)

            Task { [weak self] in
                for await change in changes {
                    Self.syncLog.info("realtime \(table, privacy: .public): event received")
                    await self?.handleRealtimeChange(table: table, change: change)
                }
            }

            // A channel that silently fails to join delivers nothing forever, and
            // looks identical to "nothing changed" — log the transition so the next
            // "sync is broken" report starts with evidence instead of a guess.
            let statusTask = Task {
                for await status in channel.statusChange {
                    Self.syncLog.info("realtime \(table, privacy: .public): channel \(String(describing: status), privacy: .public)")
                }
            }
            statusTasks.append(statusTask)

            await channel.subscribe()
            realtimeChannels.append(channel)
        }
    }

    /// Every week the phone computes must start on the household's day, as the
    /// database stamps them (the household it answers for: the oldest one).
    private func adoptHouseholdWeekStart() {
        let context = ModelContext(modelContainer)
        let households = (try? context.fetch(FetchDescriptor<Household>(sortBy: [SortDescriptor(\.createdAt)]))) ?? []
        PlanCalendar.weekStartsOn = households.first?.weekStartsOn ?? 0
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

// MARK: - Push order: parents before children

extension SyncEngine {
    private static func task(_ id: UUID, in context: ModelContext) -> SymphonyTask? {
        var descriptor = FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private static func focus(_ id: UUID, in context: ModelContext) -> TaskFocus? {
        var descriptor = FetchDescriptor<TaskFocus>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    private static func goal(_ id: UUID, in context: ModelContext) -> Goal? {
        var descriptor = FetchDescriptor<Goal>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return (try? context.fetch(descriptor))?.first
    }

    /// The rows this one's SENT links point at: a task's goalId, sourceId, areaId when `linksDirty`;
    /// a goal's areaId when `areaDirty`; a `task_focus` row's task, always (`task_focus.task_id`
    /// references `tasks(id)`, so a focus pushed before its task's insert is refused); otherwise
    /// none (a clean row sends no link, so it has nothing to wait for). A row gone from the phone
    /// names nothing. A row never names itself (it would wait on its own insert forever).
    static func parentIds(table: String, id: UUID, context: ModelContext) -> [UUID] {
        let links: [UUID?]
        switch table {
        case "tasks":
            guard let t = task(id, in: context), t.linksDirty else { return [] }
            links = [t.goalId, t.sourceId, t.areaId]
        case "goals":
            guard let g = goal(id, in: context), g.areaDirty else { return [] }
            links = [g.areaId]
        case "task_focus":
            guard let f = focus(id, in: context) else { return [] }
            links = [f.taskId]
        default:
            return []
        }
        return links.compactMap { $0 }.filter { $0 != id }
    }

    /// What the push loop reads for a queued change: a delete never waits, so it names none.
    static func parentIds(of change: PendingChange, context: ModelContext) -> [UUID] {
        change.changeType == "delete" ? [] : parentIds(table: change.tableName, id: change.recordId, context: context)
    }

    static func mustWait(parents: [UUID], unpushedInserts: Set<UUID>) -> Bool {
        parents.contains { unpushedInserts.contains($0) }
    }

    /// Failed pushes after which an update or delete is dropped, and after
    /// which a child stops waiting on its parent's insert.
    static let maxPushAttempts = 10

    /// The queued inserts a child waits for: those that have not yet failed
    /// `maxPushAttempts` times. A parent whose insert keeps being refused
    /// never lands, so its child takes the ordinary count-and-drop path
    /// instead of waiting forever (and shielding its row from every pull).
    static func insertsWorthWaitingFor(_ changes: [PendingChange]) -> Set<UUID> {
        Set(changes.filter { $0.changeType == "insert" && $0.attempts < maxPushAttempts }.map(\.recordId))
    }

    /// What a refused push of a row with links does.
    enum RejectionAction: Equatable {
        /// The server refused a parent that is not on this phone: set these
        /// links to nil, keep the flag and the change, retry next pass.
        case unlink([UUID])
        /// An ordinary failure: count the attempt (and drop at the limit).
        case countAttempt
    }

    /// Postgres `foreign_key_violation`.
    static func isForeignKeyRejection(code: String?) -> Bool { code == "23503" }

    /// The Postgres error code PostgREST returned, if the error is one.
    static func postgresCode(of error: Error) -> String? { (error as? PostgrestError)?.code }

    /// "Lost" is the server's call: only a foreign-key refusal makes a parent
    /// lost, and then only the parents that are not on this phone (no row, no
    /// queued insert) can be the missing one. If every parent is here, the
    /// refusal is something else and counts as an ordinary failure.
    static func onPushRejected(code: String?, parents: [UUID], queuedInserts: Set<UUID>, known: Set<UUID>) -> RejectionAction {
        guard isForeignKeyRejection(code: code) else { return .countAttempt }
        let lost = lostParents(parents, unpushedInserts: queuedInserts, known: known)
        return lost.isEmpty ? .countAttempt : .unlink(lost)
    }

    /// As above, for a change on `table`. Only tasks and goals have links to
    /// unlink; a `task_focus` row names its task only to wait for it (the task
    /// is its key), so its refusal counts as an ordinary failure, as it always did.
    /// `known` is read only past that guard: a failed push of a clean row, or of any
    /// other table, costs no fetch.
    static func onPushRejected(table: String, code: String?, parents: [UUID], queuedInserts: Set<UUID>,
                               known: @autoclosure () -> Set<UUID>) -> RejectionAction {
        guard !parents.isEmpty, table == "tasks" || table == "goals" else { return .countAttempt }
        return onPushRejected(code: code, parents: parents, queuedInserts: queuedInserts, known: known())
    }

    /// What happens to a change once its push has succeeded.
    enum AfterPush: Equatable {
        /// Delete the change (and clear the link flag).
        case done
        /// An insert landed but its links moved meanwhile: queue an update
        /// for them, then delete the insert. The link flag stays set.
        case queueUpdateThenDone
        /// An update whose links moved meanwhile: leave it queued as it is;
        /// the next pass sends it again. The link flag stays set.
        case keepQueued
    }

    static func afterPush(changeType: String, sent: LinkStamp?, now: LinkStamp?) -> AfterPush {
        if linksSettled(sent: sent, now: now) { return .done }
        return changeType == "update" ? .keepQueued : .queueUpdateThenDone
    }

    /// The ids of every goal, task and life area on this phone.
    static func knownIds(context: ModelContext) -> Set<UUID> {
        let tasks = (try? context.fetch(FetchDescriptor<SymphonyTask>()))?.map(\.id) ?? []
        let goals = (try? context.fetch(FetchDescriptor<Goal>()))?.map(\.id) ?? []
        let areas = (try? context.fetch(FetchDescriptor<GoalArea>()))?.map(\.id) ?? []
        return Set(tasks + goals + areas)
    }

    /// Parents that will never arrive: no insert waiting and no row on this phone.
    /// Called only once the server has refused the row (`onPushRejected`).
    static func lostParents(_ parents: [UUID], unpushedInserts: Set<UUID>, known: Set<UUID>) -> [UUID] {
        parents.filter { !unpushedInserts.contains($0) && !known.contains($0) }
    }

    /// Sets the row's links to `lost` to nil and leaves its dirty flag set, so the null is what gets sent.
    static func clearLinks(to lost: [UUID], table: String, id: UUID, context: ModelContext) {
        let lost = Set(lost)
        switch table {
        case "tasks":
            guard let t = task(id, in: context) else { return }
            if let g = t.goalId, lost.contains(g) { t.goalId = nil }
            if let s = t.sourceId, lost.contains(s) { t.sourceId = nil }
            if let a = t.areaId, lost.contains(a) { t.areaId = nil }
        case "goals":
            guard let g = goal(id, in: context) else { return }
            if let a = g.areaId, lost.contains(a) { g.areaId = nil }
        default:
            return
        }
    }

    /// The link values a push of this row sends, or nil when it sends none
    /// (its links are not dirty, the table has none, or the row is gone).
    struct LinkStamp: Equatable {
        var goalId: UUID?
        var sourceId: UUID?
        var areaId: UUID?
    }

    static func linkStamp(table: String, id: UUID, context: ModelContext) -> LinkStamp? {
        switch table {
        case "tasks":
            guard let t = task(id, in: context), t.linksDirty else { return nil }
            return LinkStamp(goalId: t.goalId, sourceId: t.sourceId, areaId: t.areaId)
        case "goals":
            guard let g = goal(id, in: context), g.areaDirty else { return nil }
            return LinkStamp(goalId: nil, sourceId: nil, areaId: g.areaId)
        default:
            return nil
        }
    }

    /// After a push returns: true when the link flag may be cleared, because
    /// the row now sends nothing or still holds exactly what was sent. False
    /// when it was re-linked (or linked for the first time) during the push:
    /// those links never went up.
    static func linksSettled(sent: LinkStamp?, now: LinkStamp?) -> Bool {
        now == nil || now == sent
    }

    /// Clears `linksDirty` / `areaDirty` only; every other flag is the caller's.
    static func clearLinkFlags(table: String, id: UUID, context: ModelContext) {
        switch table {
        case "tasks": task(id, in: context)?.linksDirty = false
        case "goals": goal(id, in: context)?.areaDirty = false
        default: break
        }
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
extension TaskCommitment: HasUUID {}
extension TaskFocus: HasUUID {}
extension Goal: HasUUID {}
extension GoalArea: HasUUID {}
extension ActionableInstance: HasUUID {}
extension EventNote: HasUUID {}
extension WeeklyTemplate: HasUUID {}
extension Household: HasUUID {}
extension UserProfile: HasUUID {}
extension SymphonyList: HasUUID {}
extension SymphonyListItem: HasUUID {}
