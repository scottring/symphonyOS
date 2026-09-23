import Foundation
import SwiftData

// MARK: - Recurrence Pattern

/// Mirrors the web's `RecurrencePattern` (src/types/actionable.ts). Every field
/// round-trips, so saving a routine from the phone never strips a field the
/// web set (interval, dates, …).
struct RecurrencePattern: Codable, Hashable {
    /// daily | weekly | monthly | quarterly | yearly | specific_days | since_last | weekend
    var type: String
    /// Weekday keys, "sun"…"sat" (older rows may spell them out).
    var days: [String]?
    var dayOfMonth: Int?
    var monthOfYear: Int?
    /// YYYY-MM-DD dates for `specific_days`.
    var dates: [String]?
    var interval: Int?
    /// "days" | "weeks" | "months" (since_last)
    var unit: String?
    /// YYYY-MM-DD anchor for interval > 1.
    var startDate: String?

    init(type: String, days: [String]? = nil, dayOfMonth: Int? = nil) {
        self.type = type
        self.days = days
        self.dayOfMonth = dayOfMonth
    }

    private enum CodingKeys: String, CodingKey {
        case type, days, dates, interval, unit
        case dayOfMonth = "day_of_month"
        case monthOfYear = "month_of_year"
        case startDate = "start_date"
        case legacyDayOfMonth = "dayOfMonth"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        type = try c.decode(String.self, forKey: .type)
        days = try c.decodeIfPresent([String].self, forKey: .days)
        // Older phone builds wrote camelCase; the web writes day_of_month.
        dayOfMonth = try c.decodeIfPresent(Int.self, forKey: .dayOfMonth)
            ?? c.decodeIfPresent(Int.self, forKey: .legacyDayOfMonth)
        monthOfYear = try c.decodeIfPresent(Int.self, forKey: .monthOfYear)
        dates = try c.decodeIfPresent([String].self, forKey: .dates)
        interval = try c.decodeIfPresent(Int.self, forKey: .interval)
        unit = try c.decodeIfPresent(String.self, forKey: .unit)
        startDate = try c.decodeIfPresent(String.self, forKey: .startDate)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(days, forKey: .days)
        try c.encodeIfPresent(dayOfMonth, forKey: .dayOfMonth)
        try c.encodeIfPresent(monthOfYear, forKey: .monthOfYear)
        try c.encodeIfPresent(dates, forKey: .dates)
        try c.encodeIfPresent(interval, forKey: .interval)
        try c.encodeIfPresent(unit, forKey: .unit)
        try c.encodeIfPresent(startDate, forKey: .startDate)
    }
}

// MARK: - Routine

@Model
final class Routine {
    @Attribute(.unique) var id: UUID
    var userId: UUID
    var name: String
    var routineDescription: String?
    var visibility: String // "active", "reference"
    var recurrencePattern: RecurrencePattern
    var timeOfDay: String? // "HH:MM" or "HH:MM:SS"
    var context: String? // "work", "family", "personal"
    var assignedTo: UUID? // family member

    // Read-only on the phone (never pushed): what `resolveRoutine` needs.
    var showOnTimeline: Bool = true
    var pinToTimeline: Bool = false
    /// Set on a collection's Step — the collection renders it, not the day.
    var parentRoutineId: UUID? = nil
    var pausedUntil: Date? = nil

    // Sync
    var syncStatus: SyncStatus
    var lastSyncedAt: Date?
    var createdAt: Date
    var updatedAt: Date

    init(
        id: UUID = UUID(),
        userId: UUID,
        name: String,
        visibility: String = "active",
        recurrencePattern: RecurrencePattern = RecurrencePattern(type: "daily"),
        syncStatus: SyncStatus = .pending
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.routineDescription = nil
        self.visibility = visibility
        self.recurrencePattern = recurrencePattern
        self.timeOfDay = nil
        self.context = nil
        self.assignedTo = nil
        self.syncStatus = syncStatus
        self.lastSyncedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

extension Routine {
    static let tableName = "routines"

    static let columnMap: [String: String] = [
        "id": "id",
        "userId": "user_id",
        "name": "name",
        "routineDescription": "description",
        "visibility": "visibility",
        "recurrencePattern": "recurrence_pattern",
        "timeOfDay": "time_of_day",
        "context": "context",
        "assignedTo": "assigned_to",
        "createdAt": "created_at",
        "updatedAt": "updated_at",
    ]
}
