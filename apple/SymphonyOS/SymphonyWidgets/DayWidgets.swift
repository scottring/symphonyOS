import SwiftUI
import WidgetKit

// The Home Screen and Lock Screen widgets (Scott, 2026-11-14, iPhone Duo
// first): Next up, To do, and Today — which at its tallest is a whole page
// for the Duo's inside screen. They read the days the app last wrote to the
// App Group (`WidgetStore`) and keep time on their own from there.

struct DayEntry: TimelineEntry {
    let date: Date
    let moment: WidgetMoment
}

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> DayEntry {
        DayEntry(date: .now, moment: .make(.sample(now: .now), now: .now))
    }

    func getSnapshot(in context: Context, completion: @escaping (DayEntry) -> Void) {
        // The widget picker shows a sample day, never a half-loaded real one.
        let snapshot = context.isPreview ? WidgetSnapshot.sample(now: .now) : WidgetStore.read()
        completion(DayEntry(date: .now, moment: .make(snapshot, now: .now)))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DayEntry>) -> Void) {
        let now = Date.now
        let snapshot = WidgetStore.read()
        // Four hours of entries at a time: every start, end, countdown minute
        // and midnight. Then WidgetKit asks again and the file is re-read.
        let horizon = now.addingTimeInterval(4 * 60 * 60)
        let dates = [now] + (snapshot?.changeDates(from: now, until: horizon) ?? [])
        let entries = dates.map { DayEntry(date: $0, moment: .make(snapshot, now: $0)) }
        completion(Timeline(entries: entries, policy: .after(horizon)))
    }
}

private let today = URL(string: "symphony://today")

private extension View {
    func symphonyWidget() -> some View {
        containerBackground(for: .widget) { WidgetPalette.paper }
            .widgetURL(today)
    }
}

// MARK: - Next up

struct NextUpWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.scottkaufman.symphonyos.nextup", provider: DayProvider()) { entry in
            NextUpWidgetView(moment: entry.moment).symphonyWidget()
        }
        .configurationDisplayName("Next up")
        .description("What's on now or next, when, and where.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

private struct NextUpWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let moment: WidgetMoment
    var body: some View {
        switch family {
        case .systemMedium: NextUpMedium(moment: moment)
        case .accessoryRectangular: NextUpLockRectangular(moment: moment)
        case .accessoryInline: NextUpLockInline(moment: moment)
        default: NextUpSmall(moment: moment)
        }
    }
}

// MARK: - To do

struct ToDoWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.scottkaufman.symphonyos.todo", provider: DayProvider()) { entry in
            ToDoWidgetView(moment: entry.moment).symphonyWidget()
        }
        .configurationDisplayName("To do")
        .description("What's left of today's work.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular])
    }
}

private struct ToDoWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let moment: WidgetMoment
    var body: some View {
        switch family {
        case .systemMedium: ToDoMedium(moment: moment)
        case .accessoryCircular: ToDoLockCircular(moment: moment)
        default: ToDoSmall(moment: moment)
        }
    }
}

// MARK: - Today

struct TodayWidget: Widget {
    /// The full page (4×6) arrived with iOS 27 and iPhone Duo.
    private var families: [WidgetFamily] {
        if #available(iOS 27.0, *) { return [.systemMedium, .systemLarge, .systemExtraLargePortrait] }
        return [.systemMedium, .systemLarge]
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.scottkaufman.symphonyos.today", provider: DayProvider()) { entry in
            TodayWidgetView(moment: entry.moment).symphonyWidget()
        }
        .configurationDisplayName("Today")
        .description("Your next appointment and today's work together. The tallest size is a whole page of the day.")
        .supportedFamilies(families)
    }
}

private struct TodayWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let moment: WidgetMoment
    var body: some View {
        if #available(iOS 27.0, *), family == .systemExtraLargePortrait {
            TodayPage(moment: moment, tall: true)
        } else if family == .systemLarge {
            TodayPage(moment: moment)
        } else {
            TodayMedium(moment: moment)
        }
    }
}
