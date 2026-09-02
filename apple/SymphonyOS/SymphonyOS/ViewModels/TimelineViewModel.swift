import Foundation
import SwiftData
import SwiftUI

/// Builds the blended timeline for a given date from tasks, routines, and events.
@Observable
final class TimelineViewModel {
    var timelineItems: [TimelineItem] = []
    var inboxTasks: [SymphonyTask] = []
    /// Overdue, incomplete tasks (scheduled before today) — the "Carried over" section.
    var carriedOverTasks: [SymphonyTask] = []

    /// How many days past its date a task keeps a slot on Today.
    ///
    /// Mirrors `GRACE_DAYS` in `src/lib/today/taskPools.ts` — the web and the
    /// phone must agree on what "carried over" means, or the two Todays show
    /// different work. Two days covers a weekend of slippage.
    static let graceDays = 2

    // Order mirrors the web app's section order (all-day first, then by time of day).
    enum TimeSection: String, CaseIterable {
        case allDay = "All Day"
        case morning = "Morning"
        case afternoon = "Afternoon"
        case evening = "Evening"
    }

    func buildTimeline(
        tasks: [SymphonyTask],
        routines: [Routine],
        instances: [ActionableInstance],
        date: Date,
        domainFilter: DomainFilter,
        eventItems: [TimelineItem] = [],
        eventNotes: [EventNote] = []
    ) {
        var items: [TimelineItem] = []
        var inbox: [SymphonyTask] = []
        var carried: [SymphonyTask] = []

        let cal = Calendar.current
        let startOfDay = cal.startOfDay(for: date)
        let isToday = cal.isDateInToday(date)

        // Subtasks attach to their parent's card. Not filtered by domain — they
        // inherit the parent's placement. Orphans (parent not on this day) are
        // excluded, the same stance as before.
        var childrenByParent: [UUID: [SymphonyTask]] = [:]
        for task in tasks {
            if let pid = task.parentTaskId { childrenByParent[pid, default: []].append(task) }
        }

        // Tasks scheduled for this date
        for task in tasks {
            // Apply domain filter
            if let contextValue = domainFilter.contextValue, task.context != contextValue { continue }

            // Skip subtasks (they show under parent)
            if task.parentTaskId != nil { continue }

            guard let scheduled = task.scheduledFor,
                  cal.isDate(scheduled, inSameDayAs: date) else {
                // Not scheduled for this day (domain filter already applied above):
                //   • no date           → Unscheduled (inbox)
                //   • past date + today → Carried over (overdue), mirrors web OverdueSection
                if !task.completed {
                    if let s = task.scheduledFor {
                        // A date is a commitment to a day, and it EXPIRES. Only work
                        // inside the grace window keeps a Today slot; older items
                        // belong to the review queue on /week. Without this bound the
                        // phone rendered every past-dated task ever created — a July
                        // 25 item was still sitting on Today on August 8, and nine
                        // carried-over rows pushed the actual day off the screen.
                        let age = cal.dateComponents([.day], from: cal.startOfDay(for: s), to: startOfDay).day ?? 0
                        if isToday && age > 0 && age <= Self.graceDays { carried.append(task) }
                    } else if task.bucket == "inbox" {
                        inbox.append(task)   // true inbox only; week/month/someday excluded
                    }
                }
                continue
            }

            let kids = (childrenByParent[task.id] ?? [])
                .sorted { $0.createdAt < $1.createdAt }
                .map { TimelineItem.ChildItem(id: $0.id, title: $0.title, completed: $0.completed,
                                              assignedTo: $0.assignedToAll ?? ($0.assignedTo.map { [$0] } ?? [])) }
            items.append(TimelineItem(
                id: "task-\(task.id.uuidString)",
                type: .task,
                title: task.title,
                startTime: task.isAllDay ? nil : task.scheduledFor,
                isAllDay: task.isAllDay,
                completed: task.completed,
                context: task.context,
                entityId: task.id,
                assignedTo: task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? []),
                location: task.location,
                notes: task.notes,
                links: task.links ?? [],
                phoneNumber: task.phoneNumber,
                locationPlaceId: task.locationPlaceId,
                source: Self.source(type: .task, captureId: task.captureId, scope: task.scope),
                children: kids
            ))
        }

        // Routines that should appear today
        for routine in routines {
            if let contextValue = domainFilter.contextValue, routine.context != contextValue { continue }
            guard shouldShowRoutine(routine, on: date) else { continue }

            // Check if there's an instance for this routine+date
            let instanceStatus = instances.first {
                $0.entityType == "routine" && $0.entityId == routine.id.uuidString &&
                cal.isDate($0.date, inSameDayAs: date)
            }?.status

            let startTime: Date? = {
                guard let timeStr = routine.timeOfDay else { return nil }
                let parts = timeStr.split(separator: ":").compactMap { Int($0) }
                guard parts.count >= 2 else { return nil }
                return cal.date(bySettingHour: parts[0], minute: parts[1], second: 0, of: startOfDay)
            }()

            items.append(TimelineItem(
                id: "routine-\(routine.id.uuidString)",
                type: .routine,
                title: routine.name,
                startTime: startTime,
                isAllDay: false,
                // Skipped reads as "off my plate today" — render it done-style
                // so it doesn't invite a second completion.
                completed: instanceStatus == "completed" || instanceStatus == "skipped",
                context: routine.context,
                entityId: routine.id,
                assignedTo: routine.assignedTo.map { [$0] } ?? []
            ))
        }

        // Google Calendar events (already mapped to TimelineItems by
        // GoogleCalendarService). Events bypass the domain filter — they mirror the
        // wall/kiosk, which shows every calendar regardless of work/family/personal.
        // Overlay each event's actionable_instances status (checked off on any
        // device → shows done here too).
        for var event in eventItems {
            if let key = event.eventKey {
                let status = instances.first {
                    $0.entityType == "calendar_event" && $0.entityId == key &&
                    cal.isDate($0.date, inSameDayAs: date)
                }?.status
                event.completed = status == "completed" || status == "skipped"
                if let note = eventNotes.first(where: { $0.googleEventId == key }) {
                    event.notes = note.notes
                    event.links = note.links ?? []
                }
            }
            event.source = Self.source(type: .event, captureId: nil, scope: nil)
            items.append(event)
        }

        // Sort: all-day first, then by time, then untimed
        items.sort { a, b in
            if a.isAllDay && !b.isAllDay { return true }
            if !a.isAllDay && b.isAllDay { return false }
            guard let aTime = a.startTime, let bTime = b.startTime else {
                return a.startTime != nil
            }
            return aTime < bTime
        }

        self.timelineItems = items
        self.inboxTasks = inbox
        self.carriedOverTasks = carried.sorted {
            ($0.scheduledFor ?? .distantPast) < ($1.scheduledFor ?? .distantPast)
        }
    }

    /// Source pill rule (spec §3): event → calendar; capture → email;
    /// couple/compound scope → shared; otherwise none.
    static func source(type: TimelineItem.ItemType, captureId: UUID?, scope: String?) -> TimelineItem.Source? {
        if type == .event { return .calendar }
        if captureId != nil { return .email }
        if scope == "couple" || scope == "compound" { return .shared }
        return nil
    }

    func section(for item: TimelineItem) -> TimeSection {
        guard !item.isAllDay else { return .allDay }
        guard let time = item.startTime else { return .morning }
        let hour = Calendar.current.component(.hour, from: time)
        if hour < 12 { return .morning }
        if hour < 18 { return .afternoon }   // web uses an 18:00 afternoon/evening cutoff
        return .evening
    }

    private func shouldShowRoutine(_ routine: Routine, on date: Date) -> Bool {
        guard routine.visibility == "active" else { return false }

        // Mirror the web app: hide high-frequency routines (daily, or weekly/
        // specific-days covering all of Mon–Fri = >4×/week). Daily-rhythm chores
        // are noise on the timeline, not glanceable commitments. Lower-frequency
        // routines (weekend-only, ordinary weekly, monthly…) still show.
        if Self.isEverydayRoutine(routine.recurrencePattern) { return false }

        let pattern = routine.recurrencePattern
        switch pattern.type {
        case "daily":
            return true
        case "weekly":
            guard let days = pattern.days else { return false }
            return days.contains(date.dayOfWeek)
        case "monthly":
            if let dom = pattern.dayOfMonth {
                return Calendar.current.component(.day, from: date) == dom
            }
            return false
        default:
            return false
        }
    }

    /// True when a routine effectively recurs every weekday (>=5×/week):
    /// `daily`, or `weekly`/`specific_days` whose days cover all of Mon–Fri.
    /// Ported from the web app's `isEverydayRoutine` (lib/routineUtils.ts).
    /// Day keys are normalized to their first 3 lowercase chars so both
    /// "mon" and "monday" forms match.
    static func isEverydayRoutine(_ pattern: RecurrencePattern) -> Bool {
        switch pattern.type {
        case "daily":
            return true
        case "weekly", "specific_days":
            guard let days = pattern.days else { return false }
            let set = Set(days.map { String($0.lowercased().prefix(3)) })
            return ["mon", "tue", "wed", "thu", "fri"].allSatisfy { set.contains($0) }
        default:
            return false
        }
    }
}

// MARK: - Timeline Item

struct TimelineItem: Identifiable {
    let id: String
    let type: ItemType
    let title: String
    let startTime: Date?
    let isAllDay: Bool
    var completed: Bool
    let context: String?
    let entityId: UUID
    var assignedTo: [UUID] = []
    var location: String? = nil
    /// Google event id — the actionable_instances entity_id for events
    /// (matches the web: entity_id = google_event_id).
    var eventKey: String? = nil

    // Context that surfaces on the card (landing: "every block carries everything you need")
    var notes: String? = nil
    var links: [TaskLink] = []
    var phoneNumber: String? = nil
    var locationPlaceId: String? = nil
    var source: Source? = nil
    var children: [ChildItem] = []

    enum ItemType: String {
        case task
        case routine
        case event
    }

    /// Where a block came from — the pill in its top-right corner.
    enum Source: String {
        case email, calendar, shared

        var label: String {
            switch self {
            case .email:    return "From an email"
            case .calendar: return "From the calendar"
            case .shared:   return "Shared"
            }
        }
    }

    /// A subtask rendered as a check-circle row under its parent.
    struct ChildItem: Identifiable, Equatable {
        let id: UUID
        let title: String
        var completed: Bool
        let assignedTo: [UUID]
    }

    /// Block (rich card) vs plain row. A bare calendar event is a plain row —
    /// the calendar pill only shows once the event carries something else.
    var isBlock: Bool {
        noteLine != nil
            || !links.isEmpty
            || phoneNumber != nil
            || location != nil
            || !children.isEmpty
            || source == .email
            || source == .shared
    }

    /// First non-empty line of `notes`, for the italic serif line. `notes` may
    /// be Tiptap HTML — `NotesHTML.firstLine` renders it (or markdown-style
    /// text) down to plain prose so a block card never shows a raw tag.
    var noteLine: String? {
        guard let notes else { return nil }
        return NotesHTML.firstLine(notes)
    }

    var timeString: String? {
        guard let time = startTime else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: time)
    }
}
