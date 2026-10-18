import SwiftUI

/// The day, to scale (web `TodayDayScale`, Scott 2026-10-06/07): the timed
/// day as a column of hours. Every thing on it — event, task, routine — is
/// drawn ONE way, "9:00–10:15 · Boxing" and who carries it; free stretches of
/// an hour or more are named in the lightest wash; today has a now line. A
/// tap opens the thing's details, where it is ticked off or retimed.
///
/// Layout comes from `DayScale` (a port of the web's `dayScale.ts`), so the
/// phone and the web put the same day in the same places.
struct TodayDayColumn: View {
    /// The day's scheduled things (`TimelineViewModel.schedule`): all-day
    /// events become chips above the column; the rest are placed on it.
    let items: [TimelineItem]
    let isToday: Bool
    let members: [FamilyMember]
    let onOpen: (TimelineItem) -> Void

    /// Hours grow with the text size, so a block always has room for its line.
    @ScaledMetric(relativeTo: .body) private var pointsPerHour: CGFloat = 44
    private let gutter: CGFloat = 34

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm"
        return f
    }()

    var body: some View {
        let allDay = items.filter { $0.isAllDay }
        let timed = items.filter { !$0.isAllDay && $0.startTime != nil }
        VStack(alignment: .leading, spacing: 10) {
            if !allDay.isEmpty { allDayChips(allDay) }
            // Minute-fresh on today: the now line moves, what's over fades.
            TimelineView(.periodic(from: .now, by: 60)) { context in
                column(timed, now: isToday ? context.date : nil)
            }
        }
    }

    // MARK: All-day

    private func allDayChips(_ items: [TimelineItem]) -> some View {
        // One quiet row (the kids' specials, a holiday); a long one truncates.
        HStack(spacing: 6) {
            ForEach(items) { item in
                Button { onOpen(item) } label: {
                    Text(item.title)
                        .lineLimit(1)
                        .font(.captionBold)
                        .foregroundStyle(Color.amberStrong)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 28)
                        .background(Color.accentBg, in: Capsule())
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityLabel("\(item.title), all day")
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: The column

    private func column(_ timed: [TimelineItem], now: Date?) -> some View {
        let layout = DayScale.build(
            timed.map { DayScale.Input(id: $0.id, start: $0.startTime!, end: $0.endTime) },
            now: now, pointsPerHour: Double(pointsPerHour)
        )
        let byId = Dictionary(timed.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        return GeometryReader { geo in
            let width = geo.size.width - gutter
            ZStack(alignment: .topLeading) {
                ForEach(layout.ticks, id: \.label) { tick in
                    hourLine(tick)
                        .offset(y: tick.top)
                }
                ForEach(layout.free, id: \.top) { free in
                    Text(free.label)
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.amberStrong)
                        .frame(width: width, height: free.height)
                        .background(Color.accentBg.opacity(0.55), in: RoundedRectangle(cornerRadius: 10))
                        .offset(x: gutter, y: free.top)
                        .accessibilityLabel(free.label)
                }
                ForEach(layout.blocks, id: \.id) { block in
                    if let item = byId[block.id] {
                        let laneWidth = width / CGFloat(block.lanes)
                        blockView(item, now: now)
                            .frame(width: laneWidth - (block.lanes > 1 ? 4 : 0), height: block.height)
                            .offset(x: gutter + laneWidth * CGFloat(block.lane), y: block.top)
                    }
                }
                if let y = layout.now, let now { nowLine(now).offset(y: y) }
            }
        }
        // Room under the last hour for its label.
        .frame(height: layout.height + 10)
    }

    private func hourLine(_ tick: DayScale.Tick) -> some View {
        HStack(spacing: 6) {
            Text(tick.label)
                .font(.captionText)
                .foregroundStyle(Color.textTertiary)
                .frame(width: gutter - 6, alignment: .leading)
            Rectangle().fill(Color.cardBorder).frame(height: 1)
        }
        .frame(height: 1)
        .accessibilityHidden(true)
    }

    private func nowLine(_ now: Date) -> some View {
        HStack(spacing: 0) {
            Circle().fill(Color.textPrimary).frame(width: 8, height: 8).padding(.leading, gutter - 4)
            Rectangle().fill(Color.textPrimary).frame(height: 2)
        }
        .frame(height: 8)
        .offset(y: -4)
        .overlay(alignment: .topTrailing) {
            Text("now \(Self.clock.string(from: now))")
                .font(.captionBold)
                .foregroundStyle(Color.textPrimary)
                .padding(.horizontal, 4)
                .background(Color.bgBase)
                .offset(y: -18)
        }
        .accessibilityHidden(true)
    }

    // MARK: One thing on the day

    private func blockView(_ item: TimelineItem, now: Date?) -> some View {
        let start = item.startTime!
        let end = item.endTime ?? start.addingTimeInterval(30 * 60)
        let past = now.map { end <= $0 } ?? false
        let time = item.endTime.map { "\(Self.clock.string(from: start))–\(Self.clock.string(from: $0))" } ?? Self.clock.string(from: start)
        return Button { onOpen(item) } label: {
            HStack(alignment: .top, spacing: 6) {
                (Text(time).monospacedDigit() + Text(" · ") + Text(item.title))
                    .font(.bodySmall)
                    .foregroundStyle(item.completed ? Color.textTertiary : Color.textPrimary)
                    .strikethrough(item.completed)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
                AssigneeAvatars(memberIds: item.assignedTo, members: members, size: 18)
            }
            .padding(.leading, 10)
            .padding(.trailing, 6)
            .padding(.top, 5)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .leading) {
                UnevenRoundedRectangle(topLeadingRadius: 8, bottomLeadingRadius: 8)
                    .fill(Color.amberStrong)
                    .frame(width: 3)
            }
            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Color.cardBorder, lineWidth: 1))
            .opacity(past ? 0.55 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(item, start: start))
        .accessibilityHint("Opens its details")
    }

    private func accessibilityLabel(_ item: TimelineItem, start: Date) -> String {
        let t = DateFormatter()
        t.dateFormat = "h:mm a"
        var label = "\(item.title), \(t.string(from: start))"
        if let end = item.endTime { label += " to \(t.string(from: end))" }
        if item.completed { label += ", done" }
        return label
    }
}
