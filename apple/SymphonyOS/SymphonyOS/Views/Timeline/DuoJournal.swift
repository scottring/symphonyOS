import SwiftUI
import SwiftData

// The iPhone Duo's Today, in the web's open-journal language (Scott,
// 2026-11-11, the Duo boards): one heading line, the day as a short list, the
// three quick actions, and the week as a page beside the day.

// MARK: - The heading

/// "‹ 11 November 2026, Wednesday ›" — the day as a big thin number, the
/// rest in one face; the arrows step the day; away from today a "Today"
/// pill brings it back.
struct JournalHeading: View {
    let date: Date
    var compact = false

    @Environment(AppState.self) private var appState

    var body: some View {
        // The outside screen is narrow: keep the heading one line, shortening
        // the month and weekday before it ever wraps.
        Group {
            if compact {
                ViewThatFits(in: .horizontal) {
                    row(full, lines: 1)
                    row(short, lines: 1)
                    row(full, lines: 2)
                }
            } else {
                row(full, lines: 2)
            }
        }
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }

    private var full: String {
        "\(date.formatted(.dateTime.month(.wide).year())), \(date.formatted(.dateTime.weekday(.wide)))"
    }
    private var short: String {
        "\(date.formatted(.dateTime.month(.abbreviated).year())), \(date.formatted(.dateTime.weekday(.abbreviated)))"
    }

    private func row(_ title: String, lines: Int) -> some View {
        let numberSize: CGFloat = compact ? 46 : 60
        let titleSize: CGFloat = compact ? 20 : 26
        return HStack(alignment: .center, spacing: 6) {
            arrow("chevron.left", label: "Previous day") { appState.goToPreviousDay() }
                .padding(.leading, -10)
            Text(date.formatted(.dateTime.day()))
                .font(.system(size: numberSize, weight: .ultraLight))
                .foregroundStyle(Color.textPrimary)
                .accessibilityHidden(true)
                .layoutPriority(1)
            Text(title)
                .font(.custom("CrimsonPro-Regular", size: titleSize))
                .foregroundStyle(Color.textPrimary)
                .lineLimit(lines)
                .fixedSize(horizontal: lines == 1, vertical: false)
                .minimumScaleFactor(lines == 1 ? 1 : 0.8)
                .accessibilityLabel(date.formatted(.dateTime.weekday(.wide).month(.wide).day()))
                .accessibilityAddTraits(.isHeader)
            arrow("chevron.right", label: "Next day") { appState.goToNextDay() }
            if !appState.isToday {
                Button("Today") { withAnimation(.easeInOut(duration: 0.2)) { appState.goToToday() } }
                    .font(.captionBold)
                    .foregroundStyle(Color.ink)
                    .lineLimit(1)
                    .fixedSize()
                    .padding(.horizontal, 10)
                    .frame(minHeight: 28)
                    .background(Color.bgWarm, in: Capsule())
                    .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
                    .frame(minHeight: 44)
                    .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    private func arrow(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.2)) { action() } } label: {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(Color.textTertiary)
                .frame(width: 32, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The day in one sentence, the only italic on the page: what's on next and
/// how much is left to do. "Lunch with Mom at 11:30. 2 to do."
enum DaySentence {
    static func make(schedule: [TimelineItem], toDo: Int, now: Date, isToday: Bool) -> String? {
        let glance = DayGlance.make(items: schedule, now: now, isToday: isToday)
        var parts: [String] = []
        if let item = glance.featured, let start = item.startTime {
            let time = start.formatted(date: .omitted, time: .shortened)
            switch glance.lead {
            case .now: parts.append("\(item.title) now.")
            case .next: parts.append("\(item.title) at \(time).")
            default: parts.append("\(item.title) first, at \(time).")
            }
        } else if isToday && glance.timedCount > 0 {
            parts.append("Nothing else timed today.")
        }
        if toDo > 0 { parts.append("\(toDo) to do.") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }
}

// MARK: - The day as a short list

/// The day's things in order — all-day first — with a now line before what
/// is still to come (web `buildAgenda`, without its open-time notes).
enum DayAgenda {
    struct Row: Identifiable {
        let id: String
        let item: TimelineItem?
        let now: Date?
    }

    static func rows(items: [TimelineItem], now: Date?) -> [Row] {
        let allDay = items.filter { $0.isAllDay }
        let timed = items.filter { !$0.isAllDay && $0.startTime != nil }.sorted { $0.startTime! < $1.startTime! }
        var rows = allDay.map { Row(id: $0.id, item: $0, now: nil) }
        var placedNow = now == nil
        for item in timed {
            if !placedNow, let now, item.startTime! > now {
                rows.append(Row(id: "now", item: nil, now: now)); placedNow = true
            }
            rows.append(Row(id: item.id, item: item, now: nil))
        }
        if !placedNow, let now, !timed.isEmpty { rows.append(Row(id: "now", item: nil, now: now)) }
        return rows
    }
}

struct DayAgendaList: View {
    let items: [TimelineItem]
    let isToday: Bool
    let onOpen: (TimelineItem) -> Void

    var body: some View {
        TimelineView(.everyMinute) { context in
            let rows = DayAgenda.rows(items: items, now: isToday ? context.date : nil)
            VStack(alignment: .leading, spacing: 0) {
                if rows.isEmpty {
                    Text("Nothing on the calendar")
                        .font(.bodySmall).foregroundStyle(Color.textTertiary)
                        .padding(.vertical, 8)
                }
                ForEach(rows) { row in
                    if let item = row.item { line(item, past: isToday && (item.endTime ?? item.startTime ?? .distantFuture) < context.date) }
                    else if let now = row.now { nowLine(now) }
                }
            }
        }
    }

    private func line(_ item: TimelineItem, past: Bool) -> some View {
        Button { onOpen(item) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(item.isAllDay ? "All day" : item.startTime?.formatted(date: .omitted, time: .shortened) ?? "")
                    .font(.system(size: 12, weight: .light))
                    .monospacedDigit()
                    .foregroundStyle(Color.textSecondary)
                    .frame(width: 58, alignment: .trailing)
                Circle()
                    .fill(item.type == .event ? Color.ink : Color.clear)
                    .overlay(Circle().strokeBorder(item.type == .event ? Color.ink : Color.textTertiary, lineWidth: 1.5))
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title)
                        .font(item.type == .event && !item.isAllDay ? .custom("CrimsonPro-SemiBold", size: 16) : .bodyMedium)
                        .foregroundStyle(item.completed ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(item.completed)
                        .multilineTextAlignment(.leading)
                    if let location = item.location, !location.isEmpty {
                        Text(location).font(.bodySmall).foregroundStyle(Color.textTertiary).lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 7)
            .opacity(past ? 0.55 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func nowLine(_ now: Date) -> some View {
        HStack(spacing: 6) {
            Text("now \(now.formatted(date: .omitted, time: .shortened))")
                .font(.captionBold)
                .foregroundStyle(Color.amberStrong)
                .lineLimit(1)
                .fixedSize()
            Rectangle().fill(Color.amberStrong).frame(height: 1.5)
        }
        .padding(.vertical, 2)
        .accessibilityLabel("Now")
    }
}

// MARK: - Quick actions

/// Tell Symphony · Done — what the outside screen is for (the dock's + is
/// Add). Done ticks off the first task in To do, with Undo.
struct QuickActions: View {
    let toDo: [TimelineItem]
    var compact = false
    let onTell: () -> Void

    @Environment(\.modelContext) private var modelContext
    @State private var undo: (task: SymphonyTask, title: String)?

    private var firstTask: SymphonyTask? {
        guard let item = toDo.first(where: { $0.type == .task && !$0.completed }) else { return nil }
        let id = item.entityId
        return try? modelContext.fetch(FetchDescriptor<SymphonyTask>(predicate: #Predicate { $0.id == id })).first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                action("Tell Symphony", symbol: "mic", primary: true, action: onTell)
                let next = firstTask
                action("Done", symbol: "checkmark", primary: false) { complete(next) }
                    .disabled(next == nil)
                    .opacity(next == nil ? 0.45 : 1)
                    .accessibilityHint(next.map { "Marks \($0.title) done" } ?? "Nothing to tick off")
            }
            if let undo {
                HStack {
                    Text("Done: \(undo.title)").font(.bodySmall).foregroundStyle(Color.textSecondary).lineLimit(1)
                    Spacer()
                    Button("Undo") {
                        TaskViewModel(modelContext: modelContext).toggleComplete(undo.task)
                        withAnimation { self.undo = nil }
                    }
                    .font(.bodySmallBold).foregroundStyle(Color.ink).buttonStyle(.plain)
                    .frame(minHeight: 44)
                }
                .transition(.opacity)
            }
        }
    }

    private func complete(_ task: SymphonyTask?) {
        guard let task else { return }
        TaskViewModel(modelContext: modelContext).toggleComplete(task)
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
        let title = task.title
        withAnimation { undo = (task, title) }
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(5))
            if undo?.title == title { withAnimation { undo = nil } }
        }
    }

    private func action(_ title: String, symbol: String, primary: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.system(size: compact ? 16 : 18, weight: .medium))
                Text(title).font(.bodyMedium).lineLimit(1).minimumScaleFactor(0.75)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: compact ? 48 : 56)
            .foregroundStyle(primary ? Color.white : Color.ink)
            .background(primary ? Color.ink : Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(primary ? Color.clear : Color.cardBorder, lineWidth: 1))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - The week as a page

/// This week beside the day (web: the week page beside Today): the week's
/// tasks and routines not yet on this day, each with Add, and the nudge
/// "Pick three to five for today."
struct WeekPage: View {
    let date: Date
    let plan: PlanSnapshot
    let userId: UUID

    @Environment(\.modelContext) private var modelContext

    var body: some View {
        let tasks = plan.chooserTasks(on: date)
        let routines = plan.chooserRoutines(on: date)
        VStack(alignment: .leading, spacing: 0) {
            Text("Week · \(PlanCalendar.weekStart(date).formatted(.dateTime.month(.abbreviated).day())) – \(PlanCalendar.addDays(PlanCalendar.weekStart(date), 6).formatted(.dateTime.month(.abbreviated).day()))")
                .font(.captionBold).foregroundStyle(Color.textSecondary)
            Text("This week")
                .font(.custom("CrimsonPro-Regular", size: 24)).foregroundStyle(Color.textPrimary)
                .padding(.bottom, 6)
                .accessibilityAddTraits(.isHeader)
            if tasks.isEmpty && routines.isEmpty {
                Text("Nothing else this week.").font(.bodySmall).foregroundStyle(Color.textTertiary).padding(.vertical, 8)
            }
            ForEach(tasks, id: \.id) { task in
                row(task.title, added: false) { PlanWriter(context: modelContext, userId: userId).planTask(task, on: date) }
            }
            if !routines.isEmpty {
                Text("Routines to pick from").font(.captionBold).foregroundStyle(Color.textSecondary).padding(.top, 14)
                ForEach(routines, id: \.routine.id) { offer in
                    row(offer.routine.name, added: offer.chosen) {
                        let writer = PlanWriter(context: modelContext, userId: userId)
                        if offer.chosen { writer.unchooseRoutine(offer.routine, on: date, flexible: offer.flexible) }
                        else { writer.chooseRoutine(offer.routine, on: date, flexible: offer.flexible) }
                    }
                }
            }
            Text("Pick three to five for today.").font(.bodySmall).foregroundStyle(Color.textTertiary).padding(.top, 12)
        }
    }

    private func row(_ title: String, added: Bool, action: @escaping () -> Void) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(title)
                .font(.custom("CrimsonPro-Regular", size: 16))
                .foregroundStyle(Color.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: action) {
                Image(systemName: added ? "checkmark" : "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(added ? Color.successGreen : Color.ink)
                    .frame(width: 30, height: 30)
                    .background(Color.bgWarm, in: Circle())
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(added ? "Take \(title) off today" : "Add \(title) to today")
        }
        .padding(.vertical, 2)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
    }
}
