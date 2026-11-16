#if os(iOS)
import SwiftUI

/// The task chosen by a tap on its words, its words (the Move to panel names it, S45), and the day
/// it stands on (nil: Any day, or none).
struct DailyWeekChoice: Equatable {
    let id: UUID
    let title: String
    let day: Date?
}

/// What a touch on a week's task does, the same wherever the week is drawn (Week, and the spread's
/// left page): a tap on its words chooses it (a second lets go), a chip moves it, Pull it up takes
/// it from the week; each move and pull-up closes the panel and offers Undo.
@MainActor struct DailyWeekTouches {
    let model: DailyModel
    let chosen: Binding<DailyWeekChoice?>
    let reduceMotion: Bool

    /// The panel and the chosen row's halo come and go: with Reduce Motion a 0.25 s cross-fade, as the walk's.
    private var fade: Animation { reduceMotion ? WalkWorldView.crossFade : .easeOut(duration: 0.18) }

    func choose(_ row: DailyDay.Row, day: Date?) {
        withAnimation(fade) {
            chosen.wrappedValue = chosen.wrappedValue?.id == row.id ? nil
                : DailyWeekChoice(id: row.id, title: row.title, day: day)
        }
    }

    /// A chip moves the task and closes the panel; Undo shows.
    func move(_ id: UUID, to day: Date?) {
        model.move(id, to: day)
        withAnimation(fade) { chosen.wrappedValue = nil }
    }

    /// The task goes from the week at once (written once its Undo can no longer be used); the panel closes.
    func pullUp(_ id: UUID) {
        model.pullUp(id, level: .week)
        withAnimation(fade) { chosen.wrappedValue = nil }
    }
}

/// The week by day, as Week draws it (`DailyWeek`): calendar events as quiet lines, each task's
/// circle (it ticks it) and its words (a tap chooses it, for the Move to panel), an empty day
/// "open", and the days behind folded to one line that opens on them and on anything still open
/// from earlier weeks. It scrolls in its own space (`frame`, page points, from the first line's top
/// to the page's foot) clear of the fade and of the Move to panel, and keeps the row a change
/// touched, and the chosen row, in sight. `look` is Week's (cards, the fold first) or the
/// spread's left page (ruled lines, the fold last, as its board draws them).
struct DailyWeekList: View {
    /// How the list is drawn: the numbers and the order only, never what it holds.
    struct Look: Equatable {
        /// The day labels' column, and the space in from its left.
        let labelWidth: CGFloat
        let labelInset: CGFloat
        /// A white card under each task (Week), or a line above each day (the spread).
        let cards: Bool
        /// The fold before the days (Week) or after them (the spread).
        let foldFirst: Bool
        /// The least height of an event's and an open day's line.
        let eventHeight: CGFloat
        let openHeight: CGFloat
        /// Above each day.
        let dayTop: CGFloat

        static let week = Look(labelWidth: 44, labelInset: 6, cards: true, foldFirst: true,
                               eventHeight: 30, openHeight: 34, dayTop: DailyMetrics.weekDayTop)
        static let spread = Look(labelWidth: 50, labelInset: 8, cards: false, foldFirst: false,
                                 eventHeight: DailyMetrics.minTouch, openHeight: DailyMetrics.minTouch, dayTop: 0)
    }

    let model: DailyModel
    let weekStart: Date
    /// The days to draw, in order (the week's, or the rest of it).
    let days: [DailyWeek.Day]
    let past: DailyWeek.Past?
    let look: Look
    let frame: CGRect
    /// The rows' left and right inset inside `frame`.
    let inset: CGFloat
    /// A task line's least height, and the gap under a task's card.
    let rowHeight: CGFloat
    let rowGap: CGFloat
    /// The fade's top: the list's foot scrolls clear of it.
    let clearOf: CGFloat
    /// The Move to panel's top while it shows.
    let panelTop: CGFloat?
    @Binding var chosen: DailyWeekChoice?
    @Binding var unfolded: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @State private var frames = DailyRowFrames()
    /// The list has scrolled from rest: the paper fades in at its top edge (S58).
    @State private var scrolled = false

    /// The 4 points above the list leave room for a chosen card's halo.
    static let halo: CGFloat = 4
    /// The gap after the day labels (the board's 8).
    private static let labelGap: CGFloat = 8

    private var touches: DailyWeekTouches { DailyWeekTouches(model: model, chosen: $chosen, reduceMotion: reduceMotion) }

    var body: some View {
        let halo = Self.halo
        let scroll = CGRect(x: frame.minX, y: frame.minY - halo, width: frame.width, height: frame.height + halo)
        let covered = min(clearOf, panelTop ?? .infinity)
        return ScrollViewReader { proxy in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    if look.foldFirst { foldFirst } else { foldLast }
                }
                .padding(.horizontal, inset)
                .padding(.top, halo)
                .padding(.bottom, frame.maxY - covered + halo)
                .dailyListScrolled($scrolled)
            }
            .dailyListTopFade(scrolled)
            .dailyListFrame(frames)
            .onChange(of: model.reveal) { _, reveal in
                guard let reveal else { return }
                frames.keepInSight(reveal.id, above: clearOf, proxy: proxy, animated: !reduceMotion)
            }
            // The chosen row is kept clear of the panel as the panel comes up, and as another row is chosen.
            .onChange(of: panelTop) { _, top in
                guard let top, let chosen else { return }
                frames.keepInSight(chosen.id, above: top - 6, proxy: proxy, animated: !reduceMotion)
            }
            .onChange(of: chosen) { _, chosen in
                guard let chosen, let top = panelTop else { return }
                frames.keepInSight(chosen.id, above: top - 6, proxy: proxy, animated: !reduceMotion)
            }
        }
        .frame(width: scroll.width, height: scroll.height)
        .offset(x: scroll.minX, y: scroll.minY)
    }

    /// Week: the fold first; opened, the days behind and the earlier rows under it, then the week.
    /// A line between groups; the fold's own line stands over the first one under it.
    @ViewBuilder private var foldFirst: some View {
        let opened = unfolded ? past : nil
        if let past {
            fold(past)
            if let opened {
                ForEach(Array(opened.days.enumerated()), id: \.element.id) { i, day in
                    dayGroup(day, rule: i > 0)
                }
                if !opened.earlier.isEmpty { earlierGroup(opened.earlier, rule: !opened.days.isEmpty) }
            }
        }
        let above = opened.map { !$0.days.isEmpty || !$0.earlier.isEmpty } ?? false
        ForEach(Array(days.enumerated()), id: \.element.id) { i, day in
            dayGroup(day, rule: i > 0 || above)
        }
    }

    /// The spread's left page: a line above each day, the fold last; opened, the days behind and
    /// the earlier rows under it.
    @ViewBuilder private var foldLast: some View {
        ForEach(days) { day in dayGroup(day, rule: true) }
        if let past {
            fold(past)
            if unfolded {
                ForEach(past.days) { day in dayGroup(day, rule: true) }
                if !past.earlier.isEmpty { earlierGroup(past.earlier, rule: true) }
            }
        }
    }

    /// The days behind today as one line: their names, and what was done if anything was.
    private func fold(_ past: DailyWeek.Past) -> some View {
        Button {
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { unfolded.toggle() }
        } label: {
            HStack {
                Text(past.label)
                Spacer(minLength: 8)
                if let done = past.doneLine { Text(done) }
            }
            .font(DailyPalette.sans(13, relativeTo: .footnote))
            .foregroundStyle(DailyPalette.muted)
            .lineLimit(DailyMetrics.quietLines(accessibilitySize: typeSize.isAccessibilitySize))
            .padding(.horizontal, look.labelInset)
            .frame(maxWidth: .infinity, minHeight: DailyMetrics.minTouch)
            .overlay(alignment: look.foldFirst ? .bottom : .top) {
                Rectangle().fill(DailyPalette.line).frame(height: 1)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(past.label)
        .accessibilityValue([past.doneLine, unfolded ? DailyCopy.foldOpen : DailyCopy.foldClosed]
            .compactMap { $0 }.joined(separator: ", "))
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("daily.week.fold")
    }

    /// One day: its label beside its first line, `dayTop` above it and a line over it when `rule`.
    private func dayGroup(_ day: DailyWeek.Day, rule: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(day.lines.enumerated()), id: \.element.id) { i, line in
                HStack(spacing: Self.labelGap) {
                    if i == 0 { dayLabel(day) } else { Color.clear.frame(width: look.labelWidth, height: 1) }
                    lineView(line, day: day.date)
                }
            }
        }
        .padding(.top, look.dayTop)
        .overlay(alignment: .top) {
            if rule { Rectangle().fill(DailyPalette.line).frame(height: 1).accessibilityHidden(true) }
        }
    }

    /// The rows still open from before this week, under the days behind: the same circle and words,
    /// with no day beside them.
    private func earlierGroup(_ rows: [DailyWeek.Earlier], rule: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(rows) { earlier in
                HStack(spacing: Self.labelGap) {
                    Color.clear.frame(width: look.labelWidth, height: 1)
                    taskCard(earlier.row, day: earlier.day)
                }
            }
        }
        .padding(.top, look.dayTop)
        .overlay(alignment: .top) {
            if rule { Rectangle().fill(DailyPalette.line).frame(height: 1).accessibilityHidden(true) }
        }
    }

    private func dayLabel(_ day: DailyWeek.Day) -> some View {
        let ink = day.isToday ? DailyPalette.rust : DailyPalette.muted
        return VStack(alignment: .leading, spacing: 0) {
            Text(day.label)
                .font(DailyPalette.sansSemiBold(10.5))
                .tracking(1.3)
            Text(day.number)
                .font(DailyPalette.crimson(20))
                .frame(height: 22)
        }
        .foregroundStyle(ink)
        .lineLimit(1)
        .padding(.leading, look.labelInset)
        .frame(width: look.labelWidth, alignment: .leading)
        // The label's column is the board's width: its words keep their size from extra large up.
        .dynamicTypeSize(...DailyPalette.largestChrome)
        // Read by the day's whole name ("Wednesday, 11 November"), never "WED, 11".
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(DailyCopy.spokenDay(day.date, today: model.today))
        .accessibilityAddTraits(.isHeader)
    }

    @ViewBuilder
    private func lineView(_ line: DailyWeek.Line, day: Date?) -> some View {
        switch line {
        case let .event(_, time, title):
            HStack(spacing: 10) {
                if !time.isEmpty {
                    Text(time)
                        .font(DailyPalette.crimson(16, relativeTo: .callout))
                        .foregroundStyle(DailyPalette.rust)
                }
                Text(title)
                    .font(DailyPalette.sans(14.5, relativeTo: .callout))
                    .foregroundStyle(DailyPalette.soft)
                    .lineLimit(DailyMetrics.quietLines(accessibilitySize: typeSize.isAccessibilitySize))
                    .truncationMode(.tail)
            }
            .padding(.leading, 10)
            .frame(maxWidth: .infinity, minHeight: look.eventHeight, alignment: .leading)
            .accessibilityElement(children: .combine)
        case .task(let row):
            taskCard(row, day: day)
        case .open:
            Text(DailyCopy.open)
                .font(DailyPalette.sans(13, relativeTo: .footnote))
                .foregroundStyle(DailyPalette.openCircle)
                .padding(.leading, 10)
                .frame(maxWidth: .infinity, minHeight: look.openHeight, alignment: .leading)
        }
    }

    /// A task: its circle (44 to the touch, the board's 2 in plus a 40 button) and its words (a tap chooses it, a second lets go), on a
    /// white card (Week's look) with a gold halo while chosen. VoiceOver reads it as one row: activating ticks it,
    /// as on Today, and its actions move it to each day the chips offer or pull it up.
    private func taskCard(_ row: DailyDay.Row, day: Date?) -> some View {
        let isChosen = chosen?.id == row.id
        let chips = DailyWeek.chips(for: day, weekStart: weekStart, today: model.today)
        let touches = self.touches
        return HStack(spacing: 2) {
            Button { model.toggle(row) } label: {
                circle(row.done)
                    .frame(width: DailyMetrics.minTouch, height: DailyMetrics.minTouch)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button { touches.choose(row, day: day) } label: {
                VStack(alignment: .leading, spacing: 0) {
                    Text(row.title)
                        .font(DailyPalette.sansMedium(15.5))
                        .foregroundStyle(row.done ? DailyPalette.doneInk : DailyPalette.ink)
                        .strikethrough(row.done, color: DailyPalette.strike)
                        .lineLimit(DailyMetrics.titleLines(accessibilitySize: typeSize.isAccessibilitySize))
                        .truncationMode(.tail)
                        .frame(minHeight: 19)
                    if let goal = row.forGoal { lineage(goal) }
                }
                // A card of two-line words grows past the board's height and keeps this much above and below.
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, minHeight: DailyMetrics.minTouch, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.trailing, 4)
        .frame(maxWidth: .infinity, minHeight: rowHeight)
        .background { if look.cards { RoundedRectangle(cornerRadius: 14).fill(.white) } }
        .overlay { if look.cards { RoundedRectangle(cornerRadius: 14).strokeBorder(DailyPalette.line, lineWidth: 1) } }
        .overlay {
            if isChosen {
                RoundedRectangle(cornerRadius: 14).inset(by: -3).strokeBorder(DailyPalette.gold, lineWidth: 3)
            }
        }
        .padding(.bottom, look.cards ? rowGap : 0)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.rowLabel(row.title, forGoal: row.forGoal))
        .accessibilityValue(row.done ? WalkCopy.rowDone : WalkCopy.rowOpen)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction { model.toggle(row) }
        .accessibilityActions {
            ForEach(chips) { chip in
                Button(DailyCopy.moveTo(chip.label)) { touches.move(row.id, to: chip.day) }
            }
            Button(WalkCopy.pullUp) { touches.pullUp(row.id) }
        }
        .dailyRowFrame(row.id, in: frames)
    }

    private func circle(_ done: Bool) -> some View {
        ZStack {
            if done {
                Circle().fill(DailyPalette.green)
                Image(systemName: "checkmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(.white)
            } else {
                Circle().strokeBorder(DailyPalette.openCircle, lineWidth: 2)
            }
        }
        .frame(width: 22, height: 22)
    }

    /// "for" in the lineage ink, the goal's name in Crimson Pro green, after a small flag beside its
    /// first line; up to two lines (F28).
    private func lineage(_ goal: String) -> some View {
        var text = AttributedString(WalkCopy.forGoal(goal))
        text.font = DailyPalette.sans(12, relativeTo: .footnote)
        text.foregroundColor = DailyPalette.lineageInk
        if let range = text.range(of: goal, options: .backwards) {
            text[range].font = DailyPalette.crimson(14, relativeTo: .footnote)
            text[range].foregroundColor = DailyPalette.green
        }
        return HStack(alignment: .top, spacing: 5) {
            DailyFlag(colour: DailyPalette.lineageFlag, poleWidth: 1.4)
                .frame(width: 9, height: 11)
                .padding(.top, 3)
            Text(text)
                .lineLimit(DailyMetrics.forLines(accessibilitySize: typeSize.isAccessibilitySize))
                .truncationMode(.tail)
        }
        .frame(minHeight: 15)
    }
}

/// The Move to panel over a week's list: the chosen task's words first (S45, as the mountain pages'
/// panel names its goal), "MOVE TO", a chip for each other day this week from today
/// (`DailyWeek.chips`), then the walk's pull-up in rust, read as removing that task. VoiceOver reads
/// the panel by the task's words. It stands in `frame` (page points), its foot
/// on the frame's foot (the top of the bar's line slot, so an Undo there stays in sight), growing up;
/// its top is reported in `top` so the list keeps the chosen row clear of it.
struct DailyMovePanel: View {
    let model: DailyModel
    let weekStart: Date
    let chosen: DailyWeekChoice
    let frame: CGRect
    @Binding var picked: DailyWeekChoice?
    @Binding var top: CGFloat?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let chips = DailyWeek.chips(for: chosen.day, weekStart: weekStart, today: model.today)
        let touches = DailyWeekTouches(model: model, chosen: $picked, reduceMotion: reduceMotion)
        return ZStack(alignment: .bottomLeading) {
            VStack(alignment: .leading, spacing: 8) {
                DailyPanelTitle(title: chosen.title, lines: 2)
                    .accessibilityHidden(true)                   // the panel's own label
                Text(DailyCopy.moveTo.uppercased())
                    .font(DailyPalette.sansSemiBold(11))
                    .tracking(1.3)
                    .foregroundStyle(DailyPalette.muted)
                    .accessibilityAddTraits(.isHeader)
                // Each chip is 44 to the touch round a 36 drawing, so lines touch-to-touch stand 8 apart.
                DailyChipFlow(spacing: 6, lineSpacing: 0) {
                    ForEach(chips) { chip in
                        chipButton(chip.label, fill: DailyPalette.chipFill, line: DailyPalette.chipLine,
                                   ink: DailyPalette.deepGreen, spoken: DailyCopy.moveTo(chip.label)) {
                            touches.move(chosen.id, to: chip.day)
                        }
                    }
                    chipButton(WalkCopy.pullUp, fill: DailyPalette.nextFill, line: DailyPalette.nextLine,
                               ink: DailyPalette.rust, spoken: WalkCopy.removeLabel(chosen.title)) {
                        touches.pullUp(chosen.id)
                    }
                }
            }
            .padding(EdgeInsets(top: 10, leading: 12, bottom: 8, trailing: 12))
            .frame(width: frame.width, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 18).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(DailyPalette.line, lineWidth: 1))
            .shadow(color: DailyPalette.navy.opacity(0.16), radius: 11, x: 0, y: 8)
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .named(DailyRowFrames.space)).minY } action: {
                top = $0
            }
            .onDisappear { top = nil }
            .accessibilityElement(children: .contain)
            .accessibilityLabel(chosen.title)
            .accessibilityIdentifier("daily.moveTo")
            .offset(x: frame.minX)
        }
        .frame(width: frame.maxX, height: frame.maxY, alignment: .bottomLeading)
        .dynamicTypeSize(...DailyPalette.largestChrome)        // above the bar, at the bar's size: the list stays in sight
        .transition(.opacity)
    }

    /// A chip: 36 high on the board, 44 to the touch.
    private func chipButton(_ label: String, fill: Color, line: Color, ink: Color, spoken: String,
                            action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(DailyPalette.sansMedium(14))
                .foregroundStyle(ink)
                .lineLimit(1)
                .padding(.horizontal, 13)
                .frame(minWidth: DailyMetrics.minTouch, minHeight: 36)
                .background(Capsule().fill(fill))
                .overlay(Capsule().strokeBorder(line, lineWidth: 1))
                .frame(minHeight: DailyMetrics.minTouch)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spoken)
    }
}
#endif
