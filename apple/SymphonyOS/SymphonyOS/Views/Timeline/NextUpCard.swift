import SwiftUI

/// The day at a glance, for the outside screen of iPhone Duo: what's on now
/// or next, the two timed things after it, and the all-day items. Facts
/// only — times and titles, nothing ranked.
struct DayGlance {
    enum Lead { case now, next, first }

    let lead: Lead?
    let featured: TimelineItem?
    let then: [TimelineItem]
    let allDay: [TimelineItem]
    let timedCount: Int

    /// On today: what's under way now, else the next thing to start. On
    /// another day: its first timed thing. Ticked-off tasks drop out.
    static func make(items: [TimelineItem], now: Date, isToday: Bool) -> DayGlance {
        let open = items.filter { !$0.completed }
        let allDay = open.filter { $0.isAllDay }
        let timed = open
            .filter { !$0.isAllDay && $0.startTime != nil }
            .sorted { $0.startTime! < $1.startTime! }

        var lead: Lead?
        var featuredIndex: Int?
        if isToday {
            if let i = timed.firstIndex(where: { $0.startTime! <= now && ($0.endTime ?? $0.startTime!) > now }) {
                lead = .now; featuredIndex = i
            } else if let i = timed.firstIndex(where: { $0.startTime! > now }) {
                lead = .next; featuredIndex = i
            }
        } else if !timed.isEmpty {
            lead = .first; featuredIndex = 0
        }

        let featured = featuredIndex.map { timed[$0] }
        let then = featuredIndex.map { Array(timed.dropFirst($0 + 1).prefix(2)) } ?? []
        return DayGlance(lead: lead, featured: featured, then: then, allDay: allDay, timedCount: timed.count)
    }

    /// "in 25 min", "in 2 hr", "in 1 hr 10 min".
    static func countdown(from now: Date, to start: Date) -> String {
        let minutes = max(0, Int((start.timeIntervalSince(now) / 60).rounded(.up)))
        if minutes < 60 { return "in \(minutes) min" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "in \(h) hr" : "in \(h) hr \(m) min"
    }
}

struct NextUpCard: View {
    let items: [TimelineItem]
    let isToday: Bool
    var onOpen: (TimelineItem) -> Void

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm"
        return f
    }()

    var body: some View {
        // Re-read every minute so "in 25 min" and "now" stay true.
        TimelineView(.everyMinute) { context in
            let glance = DayGlance.make(items: items, now: context.date, isToday: isToday)
            VStack(alignment: .leading, spacing: 8) {
                card(glance, now: context.date)
                if !glance.allDay.isEmpty {
                    Text("All day: " + glance.allDay.map(\.title).joined(separator: " · "))
                        .font(.bodySmall)
                        .foregroundStyle(Color.textSecondary)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    @ViewBuilder
    private func card(_ glance: DayGlance, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let item = glance.featured, let start = item.startTime, let lead = glance.lead {
                Button { onOpen(item) } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(eyebrow(lead, start: start, end: item.endTime))
                                .font(.eyebrow)
                                .textCase(.uppercase)
                                .kerning(1.2)
                                .foregroundStyle(Color.amberStrong)
                            Spacer()
                            if lead == .next {
                                Text(DayGlance.countdown(from: now, to: start))
                                    .font(.captionBold)
                                    .foregroundStyle(Color.amberStrong)
                            }
                        }
                        Text(item.title)
                            .font(.bodyLargeBold)
                            .foregroundStyle(Color.textPrimary)
                            .multilineTextAlignment(.leading)
                        if let detail = detail(item, start: start) {
                            Text(detail)
                                .font(.bodySmall)
                                .foregroundStyle(Color.textSecondary)
                                .multilineTextAlignment(.leading)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                if !glance.then.isEmpty {
                    Divider().overlay(Color.cardBorder)
                    Text("Then " + glance.then.map { "\(Self.clock.string(from: $0.startTime!)) \($0.title)" }
                        .joined(separator: " · "))
                        .font(.bodySmall)
                        .foregroundStyle(Color.textSecondary)
                }
            } else {
                Text(glance.timedCount == 0 ? "Nothing timed today" : "Nothing else timed today")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
    }

    private func eyebrow(_ lead: DayGlance.Lead, start: Date, end: Date?) -> String {
        switch lead {
        case .now: return end.map { "Now · until \(Self.clock.string(from: $0))" } ?? "Now"
        case .next: return "Next · \(Self.clock.string(from: start))"
        case .first: return "First · \(Self.clock.string(from: start))"
        }
    }

    private func detail(_ item: TimelineItem, start: Date) -> String? {
        var parts: [String] = []
        if let end = item.endTime { parts.append("\(Self.clock.string(from: start))–\(Self.clock.string(from: end))") }
        if let location = item.location, !location.isEmpty { parts.append(location) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
