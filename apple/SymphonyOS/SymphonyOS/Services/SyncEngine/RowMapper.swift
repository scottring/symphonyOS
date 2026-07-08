import Foundation
import SwiftData
import Supabase

/// Maps between Supabase JSON rows and SwiftData models.
enum RowMapper {

    // MARK: - Row → Model

    static func toModel<T: PersistentModel>(_ type: T.Type, from row: [String: AnyJSON]) -> T? {
        switch type {
        case is SymphonyTask.Type:
            return taskFromRow(row) as? T
        case is Project.Type:
            return projectFromRow(row) as? T
        case is Routine.Type:
            return routineFromRow(row) as? T
        case is Contact.Type:
            return contactFromRow(row) as? T
        case is FamilyMember.Type:
            return familyMemberFromRow(row) as? T
        case is ActionableInstance.Type:
            return actionableInstanceFromRow(row) as? T
        case is PlaybookBlock.Type:
            return playbookBlockFromRow(row) as? T
        case is PlaybookInstance.Type:
            return playbookInstanceFromRow(row) as? T
        case is WeeklyTemplate.Type:
            return weeklyTemplateFromRow(row) as? T
        case is FamilyRule.Type:
            return familyRuleFromRow(row) as? T
        case is Responsibility.Type:
            return responsibilityFromRow(row) as? T
        case is Household.Type:
            return householdFromRow(row) as? T
        case is UserProfile.Type:
            return userProfileFromRow(row) as? T
        default:
            return nil
        }
    }

    // MARK: - Individual Mappers

    private static func taskFromRow(_ row: [String: AnyJSON]) -> SymphonyTask? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let title = row.string("title") else { return nil }

        let task = SymphonyTask(id: id, userId: userId, title: title, syncStatus: .synced)
        task.completed = row.bool("completed") ?? false
        task.scheduledFor = row.date("scheduled_for")
        task.deferredUntil = row.date("deferred_until")
        task.deferCount = row.int("defer_count") ?? 0
        task.isAllDay = row.bool("is_all_day") ?? false
        task.isSomeday = row.bool("is_someday") ?? false
        task.bucket = row.string("bucket")
        task.estimatedDuration = row.int("estimated_duration")
        task.context = row.string("context")
        task.category = row.string("category")
        task.notes = row.string("notes")
        task.links = row.codable("links")
        task.phoneNumber = row.string("phone_number")
        task.location = row.string("location")
        task.locationPlaceId = row.string("location_place_id")
        task.contactId = row.uuid("contact_id")
        task.assignedTo = row.uuid("assigned_to")
        task.assignedToAll = row.uuidArray("assigned_to_all")
        task.projectId = row.uuid("project_id")
        task.parentTaskId = row.uuid("parent_task_id")
        task.linkedTo = row.codable("linked_to")
        task.linkType = row.string("link_type")
        let captureMeta: CaptureMeta? = row.codable("capture_meta")
        task.captureStatus = captureMeta?.status
        task.captureStoragePath = captureMeta?.storage_path
        task.captureSuggestedTaskId = captureMeta?.suggested_task_id.flatMap(UUID.init(uuidString:))
        task.lastSyncedAt = Date()
        task.createdAt = row.date("created_at") ?? Date()
        task.updatedAt = row.date("updated_at") ?? Date()
        return task
    }

    private static func projectFromRow(_ row: [String: AnyJSON]) -> Project? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let name = row.string("name") else { return nil }

        let project = Project(id: id, userId: userId, name: name, syncStatus: .synced)
        project.status = row.string("status") ?? "not_started"
        project.context = row.string("context")
        project.type = row.string("type")
        project.notes = row.string("notes")
        project.links = row.codable("links")
        project.phoneNumber = row.string("phone_number")
        project.parentId = row.uuid("parent_id")
        project.lastSyncedAt = Date()
        project.createdAt = row.date("created_at") ?? Date()
        project.updatedAt = row.date("updated_at") ?? Date()
        return project
    }

    private static func routineFromRow(_ row: [String: AnyJSON]) -> Routine? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let name = row.string("name") else { return nil }

        let pattern: RecurrencePattern = row.codable("recurrence_pattern") ?? RecurrencePattern(type: "daily")
        let routine = Routine(id: id, userId: userId, name: name, recurrencePattern: pattern, syncStatus: .synced)
        routine.routineDescription = row.string("description")
        routine.visibility = row.string("visibility") ?? "active"
        routine.timeOfDay = row.string("time_of_day")
        routine.context = row.string("context")
        routine.assignedTo = row.uuid("assigned_to")
        routine.lastSyncedAt = Date()
        routine.createdAt = row.date("created_at") ?? Date()
        routine.updatedAt = row.date("updated_at") ?? Date()
        return routine
    }

    private static func contactFromRow(_ row: [String: AnyJSON]) -> Contact? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let name = row.string("name") else { return nil }

        let contact = Contact(id: id, userId: userId, name: name, syncStatus: .synced)
        contact.phone = row.string("phone")
        contact.email = row.string("email")
        contact.notes = row.string("notes")
        contact.category = row.string("category")
        contact.birthday = row.date("birthday")
        contact.relationship = row.string("relationship")
        contact.preferences = row.string("preferences")
        contact.lastSyncedAt = Date()
        contact.createdAt = row.date("created_at") ?? Date()
        contact.updatedAt = row.date("updated_at") ?? Date()
        return contact
    }

    private static func familyMemberFromRow(_ row: [String: AnyJSON]) -> FamilyMember? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let name = row.string("name"),
              let initials = row.string("initials"),
              let color = row.string("color") else { return nil }

        let member = FamilyMember(id: id, userId: userId, name: name, initials: initials, color: color, syncStatus: .synced)
        member.avatarUrl = row.string("avatar_url")
        member.isFullUser = row.bool("is_full_user") ?? false
        member.displayOrder = row.int("display_order") ?? 0
        member.memberType = row.string("member_type") ?? "core"
        member.roleLabel = row.string("role_label")
        member.typicalInvolvement = row.string("typical_involvement")
        member.authUserId = row.uuid("auth_user_id")
        member.dateOfBirth = row.date("date_of_birth")
        member.lastSyncedAt = Date()
        member.createdAt = row.date("created_at") ?? Date()
        return member
    }

    private static func actionableInstanceFromRow(_ row: [String: AnyJSON]) -> ActionableInstance? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let entityType = row.string("entity_type"),
              let entityId = row.string("entity_id"),
              let date = row.date("date") else { return nil }

        let instance = ActionableInstance(id: id, userId: userId, entityType: entityType, entityId: entityId, date: date, syncStatus: .synced)
        instance.status = row.string("status") ?? "pending"
        instance.assignee = row.uuid("assignee")
        instance.assignedToOverride = row.uuid("assigned_to_override")
        instance.deferredTo = row.date("deferred_to")
        instance.completedAt = row.date("completed_at")
        instance.skippedAt = row.date("skipped_at")
        instance.lastSyncedAt = Date()
        instance.createdAt = row.date("created_at") ?? Date()
        instance.updatedAt = row.date("updated_at") ?? Date()
        return instance
    }

    private static func playbookBlockFromRow(_ row: [String: AnyJSON]) -> PlaybookBlock? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let timeSlot = row.string("time_slot"),
              let label = row.string("label"),
              let blockType = row.string("block_type"),
              let narrative = row.string("narrative") else { return nil }

        let items: [PlaybookItem] = row.codable("items") ?? []
        let dayTypes: [String] = row.stringArray("day_types") ?? ["school-day"]

        let block = PlaybookBlock(id: id, userId: userId, timeSlot: timeSlot, label: label, blockType: blockType, narrative: narrative, items: items, dayTypes: dayTypes, syncStatus: .synced)
        block.templateId = row.uuid("template_id")
        block.layerId = row.uuid("layer_id")
        block.sourceRuleIds = row.uuidArray("source_rule_ids")
        block.visibility = row.string("visibility")
        block.coachingNote = row.string("coaching_note")
        block.sortOrder = row.int("sort_order") ?? 0
        block.lastSyncedAt = Date()
        block.createdAt = row.date("created_at") ?? Date()
        block.updatedAt = row.date("updated_at") ?? Date()
        return block
    }

    private static func playbookInstanceFromRow(_ row: [String: AnyJSON]) -> PlaybookInstance? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let blockId = row.uuid("block_id"),
              let date = row.date("date") else { return nil }

        let instance = PlaybookInstance(id: id, userId: userId, blockId: blockId, date: date, syncStatus: .synced)
        instance.completed = row.bool("completed") ?? false
        instance.react = row.string("react")
        instance.tags = row.stringArray("tags") ?? []
        instance.notes = row.string("notes")
        instance.itemsState = row.codable("items_state")
        instance.lastSyncedAt = Date()
        instance.createdAt = row.date("created_at") ?? Date()
        instance.updatedAt = row.date("updated_at") ?? Date()
        return instance
    }

    private static func weeklyTemplateFromRow(_ row: [String: AnyJSON]) -> WeeklyTemplate? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let weekOf = row.date("week_of") else { return nil }

        let template = WeeklyTemplate(id: id, userId: userId, weekOf: weekOf, syncStatus: .synced)
        template.focusAreas = row.stringArray("focus_areas") ?? []
        template.reviewNotes = row.string("review_notes")
        template.lastSyncedAt = Date()
        template.createdAt = row.date("created_at") ?? Date()
        template.updatedAt = row.date("updated_at") ?? Date()
        return template
    }

    private static func familyRuleFromRow(_ row: [String: AnyJSON]) -> FamilyRule? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let rule = row.string("rule") else { return nil }

        let model = FamilyRule(id: id, userId: userId, rule: rule, syncStatus: .synced)
        model.appliesTo = row.stringArray("applies_to") ?? ["everyone"]
        model.status = row.string("status") ?? "active"
        model.rationale = row.string("rationale")
        model.enforcementTip = row.string("enforcement_tip")
        model.lastSyncedAt = Date()
        model.createdAt = row.date("created_at") ?? Date()
        model.updatedAt = row.date("updated_at") ?? Date()
        return model
    }

    private static func responsibilityFromRow(_ row: [String: AnyJSON]) -> Responsibility? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id"),
              let who = row.string("who"),
              let task = row.string("task") else { return nil }

        let model = Responsibility(id: id, userId: userId, who: who, task: task, syncStatus: .synced)
        model.frequency = row.string("frequency") ?? "daily"
        model.status = row.string("status") ?? "active"
        model.ruleId = row.uuid("rule_id")
        model.lastSyncedAt = Date()
        model.createdAt = row.date("created_at") ?? Date()
        model.updatedAt = row.date("updated_at") ?? Date()
        return model
    }

    private static func householdFromRow(_ row: [String: AnyJSON]) -> Household? {
        guard let id = row.uuid("id"),
              let ownerId = row.uuid("owner_id") else { return nil }

        let model = Household(id: id, name: row.string("name") ?? "My Household", ownerId: ownerId, syncStatus: .synced)
        model.address = row.string("address")
        model.lastSyncedAt = Date()
        model.createdAt = row.date("created_at") ?? Date()
        model.updatedAt = row.date("updated_at") ?? Date()
        return model
    }

    private static func userProfileFromRow(_ row: [String: AnyJSON]) -> UserProfile? {
        guard let id = row.uuid("id"),
              let userId = row.uuid("user_id") else { return nil }

        let model = UserProfile(id: id, userId: userId, syncStatus: .synced)
        model.onboardingStep = row.string("onboarding_step")
        model.onboardingCompletedAt = row.date("onboarding_completed_at")
        model.homeLocation = row.string("home_location")
        model.homeTimezone = row.string("home_timezone")
        model.lastSyncedAt = Date()
        model.createdAt = row.date("created_at") ?? Date()
        model.updatedAt = row.date("updated_at") ?? Date()
        return model
    }
}

// MARK: - Row Access Helpers

extension Dictionary where Key == String, Value == AnyJSON {
    func string(_ key: String) -> String? {
        guard let value = self[key] else { return nil }
        if case .string(let s) = value { return s }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        guard let value = self[key] else { return nil }
        if case .bool(let b) = value { return b }
        return nil
    }

    func int(_ key: String) -> Int? {
        guard let value = self[key] else { return nil }
        if case .integer(let n) = value { return n }
        if case .double(let n) = value { return Int(n) }
        return nil
    }

    func uuid(_ key: String) -> UUID? {
        guard let s = string(key) else { return nil }
        return UUID(uuidString: s)
    }

    func date(_ key: String) -> Date? {
        guard let s = string(key) else { return nil }
        return Date.fromISO(s) ?? Date.fromDateString(s)
    }

    func stringArray(_ key: String) -> [String]? {
        guard let value = self[key] else { return nil }
        if case .array(let arr) = value {
            return arr.compactMap { item in
                if case .string(let s) = item { return s }
                return nil
            }
        }
        return nil
    }

    func uuidArray(_ key: String) -> [UUID]? {
        guard let arr = stringArray(key) else { return nil }
        return arr.compactMap { UUID(uuidString: $0) }
    }

    func codable<T: Decodable>(_ key: String) -> T? {
        guard let value = self[key] else { return nil }
        do {
            let data = try JSONEncoder().encode(value)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }
}
