#if os(iOS)
import SwiftUI
import WidgetKit

// The Home Screen widgets' faces (Scott, 2026-11-14, iPhone Duo first): the
// outside screen's small and wide tiles, and a whole page for the inside
// screen. Paper, ink and one amber, as in the app. Each face takes a
// `WidgetMoment` and nothing else, so the app's tests can draw them too.

enum WidgetPalette {
    static let paper = Color(red: 0xFA / 255, green: 0xF7 / 255, blue: 0xF2 / 255)
    static let ink = Color(red: 0x2C / 255, green: 0x25 / 255, blue: 0x20 / 255)
    static let secondary = Color(red: 0x6B / 255, green: 0x5E / 255, blue: 0x54 / 255)
    static let tertiary = Color(red: 0x7D / 255, green: 0x70 / 255, blue: 0x66 / 255)
    static let amber = Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255)
    static let rule = Color(red: 0xE8 / 255, green: 0xE0 / 255, blue: 0xD8 / 255)
}

private extension Font {
    static func widgetSerif(_ size: CGFloat) -> Font { .custom("CrimsonPro-Regular", size: size, relativeTo: .title3) }
    static func widgetSerifItalic(_ size: CGFloat) -> Font { .custom("CrimsonPro-Italic", size: size, relativeTo: .body) }
    static func widgetSans(_ size: CGFloat) -> Font { .custom("DMSans-Regular", size: size, relativeTo: .footnote) }
    static func widgetSansMedium(_ size: CGFloat) -> Font { .custom("DMSans-Medium", size: size, relativeTo: .footnote) }
    static func widgetSansBold(_ size: CGFloat) -> Font { .custom("DMSans-SemiBold", size: size, relativeTo: .footnote) }
}

private func widgetClock(_ date: Date) -> String { date.formatted(.dateTime.hour().minute()) }

// MARK: - Pieces

private struct WidgetEyebrow: View {
    let text: String
    var body: some View {
        Text(text)
            .font(.widgetSansMedium(10.5))
            .textCase(.uppercase)
            .kerning(1.1)
            .foregroundStyle(WidgetPalette.amber)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .widgetAccentable()
    }
}

/// A calm line where there is nothing to list.
private struct WidgetQuiet: View {
    let text: String
    var size: CGFloat = 16
    var body: some View {
        Text(text)
            .font(.widgetSerifItalic(size))
            .foregroundStyle(WidgetPalette.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}

/// What's on now or next: when, what, where, and how long until.
struct NextUpFace: View {
    let moment: WidgetMoment
    var titleSize: CGFloat = 21
    var titleLines = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if moment.day == nil {
                WidgetEyebrow(text: "Symphony")
                WidgetQuiet(text: "Open Symphony to bring today in.")
            } else if let item = moment.featured, let lead = moment.lead {
                WidgetEyebrow(text: eyebrow(lead, item))
                Text(item.title)
                    .font(.widgetSerif(titleSize))
                    .foregroundStyle(WidgetPalette.ink)
                    .lineLimit(titleLines)
                    .minimumScaleFactor(0.85)
                if let detail = detail(item) {
                    Text(detail)
                        .font(.widgetSans(12))
                        .foregroundStyle(WidgetPalette.secondary)
                        .lineLimit(1)
                }
                if let countdown = moment.countdown {
                    Text(countdown)
                        .font(.widgetSansBold(13))
                        .foregroundStyle(WidgetPalette.amber)
                        .widgetAccentable()
                        .padding(.top, 1)
                }
            } else {
                WidgetEyebrow(text: "Next up")
                WidgetQuiet(text: (moment.day?.timed.isEmpty ?? true) ? "Nothing timed today." : "Nothing else timed today.")
                if let first = moment.tomorrowFirst {
                    Text("Tomorrow · \(widgetClock(first.start)) \(first.title)")
                        .font(.widgetSans(12))
                        .foregroundStyle(WidgetPalette.secondary)
                        .lineLimit(2)
                        .padding(.top, 2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func eyebrow(_ lead: WidgetMoment.Lead, _ item: WidgetDay.Timed) -> String {
        switch lead {
        case .now: return item.end.map { "Now · until \(widgetClock($0))" } ?? "Now"
        case .next: return "Next · \(widgetClock(item.start))"
        }
    }

    private func detail(_ item: WidgetDay.Timed) -> String? {
        if let location = item.location, !location.isEmpty { return location }
        if moment.lead == .next, let end = item.end { return "until \(widgetClock(end))" }
        return nil
    }
}

/// The timed things after the featured one: time, then title.
struct LaterList: View {
    let items: [WidgetDay.Timed]
    var limit = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            ForEach(items.prefix(limit)) { item in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(widgetClock(item.start))
                        .font(.widgetSansMedium(11.5))
                        .foregroundStyle(WidgetPalette.tertiary)
                        .monospacedDigit()
                        .frame(width: 56, alignment: .leading)
                    Text(item.title)
                        .font(.widgetSans(13))
                        .foregroundStyle(WidgetPalette.ink)
                        .lineLimit(1)
                }
            }
            if items.count > limit {
                Text("and \(items.count - limit) more")
                    .font(.widgetSans(11.5))
                    .foregroundStyle(WidgetPalette.tertiary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Untimed work for today: open things first, an open circle each.
struct ToDoFace: View {
    let moment: WidgetMoment
    var limit = 4
    var showHeading = true

    private var open: [WidgetDay.ToDo] { moment.day?.openToDo ?? [] }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if showHeading {
                WidgetEyebrow(text: open.isEmpty ? "To do" : "To do · \(open.count) left")
            }
            if moment.day == nil {
                WidgetQuiet(text: "Open Symphony to bring today in.", size: 15)
            } else if open.isEmpty {
                WidgetQuiet(text: (moment.day?.doneToDo ?? 0) > 0 ? "All done for today." : "Nothing set for today.", size: 15)
            } else {
                // One more row instead of "and 1 more".
                let shown = open.count == limit + 1 ? limit + 1 : limit
                ForEach(open.prefix(shown)) { item in
                    HStack(alignment: .firstTextBaseline, spacing: 7) {
                        Circle()
                            .strokeBorder(WidgetPalette.tertiary, lineWidth: 1.2)
                            .frame(width: 11, height: 11)
                            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
                        Text(item.title)
                            .font(.widgetSans(13))
                            .foregroundStyle(WidgetPalette.ink)
                            .lineLimit(1)
                    }
                }
                if open.count > shown {
                    Text("and \(open.count - shown) more")
                        .font(.widgetSans(11.5))
                        .foregroundStyle(WidgetPalette.tertiary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WidgetRule: View {
    var vertical = false
    var body: some View {
        Rectangle()
            .fill(WidgetPalette.rule)
            .frame(width: vertical ? 1 : nil, height: vertical ? nil : 1)
    }
}

// MARK: - Faces, by size

/// Small: what's next, and the thing after it. The outside screen's glance.
struct NextUpSmall: View {
    let moment: WidgetMoment
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            NextUpFace(moment: moment)
            Spacer(minLength: 4)
            if let then = moment.later.first {
                Text("Then \(widgetClock(then.start)) \(then.title)")
                    .font(.widgetSans(11.5))
                    .foregroundStyle(WidgetPalette.tertiary)
                    .lineLimit(2)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// Wide: what's next, and what follows it. Once the day's timed things are
/// over, the other half turns to what's left to do.
struct NextUpMedium: View {
    let moment: WidgetMoment
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            NextUpFace(moment: moment, titleSize: 22)
            WidgetRule(vertical: true)
            if moment.featured == nil {
                ToDoFace(moment: moment, limit: 4)
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    WidgetEyebrow(text: "Then")
                    if moment.later.isEmpty {
                        WidgetQuiet(text: "Nothing after that.", size: 15)
                    } else {
                        LaterList(items: moment.later, limit: 4)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// Small: today's untimed work.
struct ToDoSmall: View {
    let moment: WidgetMoment
    var body: some View {
        ToDoFace(moment: moment, limit: 5)
            .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// Wide: how much is left, and what.
struct ToDoMedium: View {
    let moment: WidgetMoment
    var body: some View {
        let open = moment.day?.openToDo.count ?? 0
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                WidgetEyebrow(text: "To do")
                Text("\(open)")
                    .font(.widgetSerif(54))
                    .foregroundStyle(WidgetPalette.ink)
                    .monospacedDigit()
                Text(open == 1 ? "thing left today" : "left today")
                    .font(.widgetSans(12))
                    .foregroundStyle(WidgetPalette.secondary)
                if let done = moment.day?.doneToDo, done > 0 {
                    Text("\(done) done")
                        .font(.widgetSans(12))
                        .foregroundStyle(WidgetPalette.tertiary)
                }
            }
            .frame(width: 92, alignment: .leading)
            WidgetRule(vertical: true)
            ToDoFace(moment: moment, limit: 5, showHeading: false)
                .padding(.top, 2)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// Wide: the next appointment beside today's work. One tile for both.
struct TodayMedium: View {
    let moment: WidgetMoment
    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            NextUpFace(moment: moment, titleSize: 21)
            WidgetRule(vertical: true)
            ToDoFace(moment: moment, limit: 4)
        }
        .frame(maxHeight: .infinity, alignment: .top)
    }
}

/// The day as a page: the date, what's next, the rest of the day, the work,
/// dinner. Large is the short page; the tall one fills a whole Home Screen
/// page on the Duo's inside screen. Each tries its fullest version first and
/// steps down until the day fits, so a long day is trimmed, never clipped.
struct TodayPage: View {
    let moment: WidgetMoment
    /// The tall page (4×6) holds more rows, the stacked date and tomorrow.
    var tall = false

    /// How much of the day one version of the page holds.
    private struct Fit {
        var later: Int
        var toDo: Int
        var allDay = true
        var titleLines = 2
    }

    private var fits: [Fit] {
        tall
            ? [Fit(later: 6, toDo: 8), Fit(later: 4, toDo: 6), Fit(later: 3, toDo: 4), Fit(later: 2, toDo: 3, allDay: false)]
            : [Fit(later: 2, toDo: 3), Fit(later: 1, toDo: 3), Fit(later: 1, toDo: 2, allDay: false, titleLines: 1),
               Fit(later: 0, toDo: 2, allDay: false, titleLines: 1)]
    }

    var body: some View {
        ViewThatFits(in: .vertical) {
            ForEach(Array(fits.enumerated()), id: \.offset) { _, fit in page(fit) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func page(_ fit: Fit) -> some View {
        VStack(alignment: .leading, spacing: tall ? 14 : 9) {
            header
            WidgetRule()
            NextUpFace(moment: moment, titleSize: tall ? 26 : 21, titleLines: fit.titleLines)
            if !moment.later.isEmpty, fit.later > 0 {
                LaterList(items: moment.later, limit: fit.later)
            }
            if fit.allDay, let allDay = moment.day?.allDay, !allDay.isEmpty {
                Text("All day: " + allDay.joined(separator: " · "))
                    .font(.widgetSans(12))
                    .foregroundStyle(WidgetPalette.secondary)
                    .lineLimit(tall ? 2 : 1)
            }
            WidgetRule()
            ToDoFace(moment: moment, limit: fit.toDo)
            if tall {
                Spacer(minLength: 0)
                if let first = moment.tomorrowFirst, moment.featured != nil {
                    line("Tomorrow", "\(widgetClock(first.start)) \(first.title)")
                }
                if let dinner = moment.day?.dinner, !dinner.isEmpty {
                    WidgetRule()
                    line("Dinner", dinner)
                }
            }
        }
    }

    private func line(_ label: String, _ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            WidgetEyebrow(text: label)
            Text(text)
                .font(.widgetSerif(18))
                .foregroundStyle(WidgetPalette.ink)
                .lineLimit(1)
        }
    }

    /// The stacked date: a big number, the day's name, a small month. The
    /// short page has no room for a dinner row, so dinner sits beside it.
    private var header: some View {
        let date = moment.now
        return HStack(alignment: .center, spacing: 12) {
            Text(date.formatted(.dateTime.day()))
                .font(.widgetSerif(tall ? 64 : 40))
                .foregroundStyle(WidgetPalette.ink)
                .monospacedDigit()
                .lineLimit(1)
                .fixedSize()
                .padding(.vertical, tall ? -12 : -8)   // the numeral's own leading
            VStack(alignment: .leading, spacing: 0) {
                Text(date.formatted(.dateTime.weekday(.wide)))
                    .font(.widgetSerif(tall ? 24 : 19))
                    .foregroundStyle(WidgetPalette.ink)
                Text(date.formatted(.dateTime.month(.wide).year()))
                    .font(.widgetSans(12))
                    .foregroundStyle(WidgetPalette.secondary)
            }
            Spacer(minLength: 8)
            if !tall, let dinner = moment.day?.dinner, !dinner.isEmpty {
                VStack(alignment: .trailing, spacing: 1) {
                    WidgetEyebrow(text: "Dinner")
                    Text(dinner)
                        .font(.widgetSerif(15))
                        .foregroundStyle(WidgetPalette.ink)
                        .lineLimit(1)
                }
            }
        }
    }
}

// MARK: - Lock Screen

/// Lock Screen, rectangular: what's next in three short lines.
struct NextUpLockRectangular: View {
    let moment: WidgetMoment
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            if let item = moment.featured, let lead = moment.lead {
                Text(lead == .now ? "Now" : "Next · \(widgetClock(item.start))")
                    .font(.caption2.weight(.semibold))
                    .textCase(.uppercase)
                    .widgetAccentable()
                Text(item.title).font(.headline).lineLimit(1)
                Text(moment.countdown ?? item.location ?? "")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            } else {
                Text("Symphony").font(.caption2.weight(.semibold)).textCase(.uppercase).widgetAccentable()
                Text(moment.day == nil ? "Open to bring today in" : "Nothing else timed today")
                    .font(.subheadline)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Lock Screen, the line above the clock: "2:30 PM Dentist".
struct NextUpLockInline: View {
    let moment: WidgetMoment
    var body: some View {
        if let item = moment.featured {
            Text(moment.lead == .now ? "Now: \(item.title)" : "\(widgetClock(item.start)) \(item.title)")
        } else {
            Text(moment.day == nil ? "Symphony" : "Nothing else timed")
        }
    }
}

/// Lock Screen, round: how many things are left today.
struct ToDoLockCircular: View {
    let moment: WidgetMoment
    var body: some View {
        VStack(spacing: -2) {
            Text(moment.day.map { "\($0.openToDo.count)" } ?? "–")
                .font(.system(size: 22, weight: .semibold, design: .rounded))
                .widgetAccentable()
            Text("to do").font(.system(size: 9, weight: .medium))
        }
    }
}

// MARK: - Sample

extension WidgetSnapshot {
    /// A plausible day for the widget picker and for drawing the faces in
    /// tests. Never shown as the user's own day.
    static func sample(now: Date, calendar: Calendar = .current) -> WidgetSnapshot {
        let start = calendar.startOfDay(for: now)
        func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
            calendar.date(byAdding: DateComponents(day: day, hour: hour, minute: minute), to: start) ?? start
        }
        func timed(_ id: String, _ title: String, _ from: Date, _ to: Date?, _ place: String? = nil) -> WidgetDay.Timed {
            .init(id: id, title: title, start: from, end: to, location: place, completed: false)
        }
        func toDo(_ id: String, _ title: String, done: Bool = false) -> WidgetDay.ToDo {
            .init(id: id, title: title, completed: done, waiting: false)
        }
        let today = WidgetDay(
            date: start,
            timed: [
                timed("a", "Walk to school", at(0, 7, 45), at(0, 8, 5)),
                timed("b", "Boxing", at(0, 9), at(0, 10, 15), "The gym"),
                timed("c", "Lunch with Mom", at(0, 12, 30), at(0, 13, 30), "Mom's place"),
                timed("d", "Dentist", at(0, 14, 30), at(0, 15, 15), "Charles St."),
                timed("e", "School pickup", at(0, 17, 15), at(0, 17, 30)),
                timed("f", "Guitar", at(0, 20), at(0, 20, 30)),
            ],
            allDay: ["Library books due"],
            toDo: [
                toDo("1", "Call the plumber"),
                toDo("2", "Return the Amazon package"),
                toDo("3", "Sign the field trip form"),
                toDo("4", "Renew the car registration"),
                toDo("5", "Water the plants", done: true),
            ],
            dinner: "Sheet-pan chicken",
            eventsLoaded: true
        )
        let tomorrow = WidgetDay(
            date: at(1, 0), timed: [timed("g", "Team call", at(1, 9), at(1, 9, 30))],
            allDay: [], toDo: [toDo("6", "Book the flights")], dinner: nil, eventsLoaded: true
        )
        return WidgetSnapshot(writtenAt: now, days: [today, tomorrow])
    }
}
#endif
