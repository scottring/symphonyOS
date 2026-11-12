import SwiftUI
import SwiftData

// The iPhone Duo's outside screen (Scott, 2026-11-12, the approved
// "Duo outside screen" mockup): a glance, not a planner. One heading line,
// what's on now, To do in one row style with finished items folded away, and
// the Tell bar. No cards, pills, domain dots or step counts here.

// MARK: - To do, split

enum GlanceToDo {
    /// What's left first, in Today's order; finished items fold into one line.
    static func split(_ items: [TimelineItem]) -> (open: [TimelineItem], done: [TimelineItem]) {
        (items.filter { !$0.completed }, items.filter { $0.completed })
    }

    /// The people shown on a row: whoever it's assigned to, minus you.
    static func others(_ assigned: [UUID], me: UUID?) -> [UUID] {
        assigned.filter { $0 != me }
    }
}

// MARK: - The heading

/// "Thursday, 12 November" on one line. Another day is a swipe away; away
/// from today a "Today" pill brings it back.
struct GlanceHeading: View {
    let date: Date
    @Environment(AppState.self) private var appState

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                .font(.custom("CrimsonPro-Regular", size: 24, relativeTo: .title2))
                .foregroundStyle(Color.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
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
        }
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
    }
}

// MARK: - Now

/// What's on now (or next), in one tinted block with what follows; a quiet
/// italic line when nothing is timed.
struct GlanceNow: View {
    let items: [TimelineItem]
    let isToday: Bool
    /// Bigger, for the half-open display seen from across a table.
    var prominent = false
    var onOpen: (TimelineItem) -> Void

    private static let clock: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "h:mm"
        return f
    }()

    var body: some View {
        TimelineView(.everyMinute) { context in
            let glance = DayGlance.make(items: items, now: context.date, isToday: isToday)
            if let item = glance.featured, let start = item.startTime, let lead = glance.lead {
                Button { onOpen(item) } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(eyebrow(lead, start: start, end: item.endTime, now: context.date))
                            .font(.eyebrow)
                            .textCase(.uppercase)
                            .kerning(1.2)
                            .foregroundStyle(Color.amberStrong)
                        Text(item.title)
                            .font(prominent ? .custom("CrimsonPro-Regular", size: 30, relativeTo: .title)
                                            : .custom("DMSans-Medium", size: 18, relativeTo: .body))
                            .foregroundStyle(Color.textPrimary)
                            .multilineTextAlignment(.leading)
                            .lineLimit(2)
                        if let then = glance.then.first, let at = then.startTime {
                            Text("Next \(Self.clock.string(from: at)) · \(then.title)")
                                .font(prominent ? .bodyMedium : .bodySmall)
                                .foregroundStyle(Color.textSecondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(.horizontal, prominent ? 18 : 14)
                    .padding(.vertical, prominent ? 16 : 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.accentBg, in: RoundedRectangle(cornerRadius: prominent ? 16 : 14))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } else {
                Text(glance.timedCount == 0 ? "Nothing timed today." : "Nothing else timed today.")
                    .font(.custom("CrimsonPro-Italic", size: prominent ? 22 : 17, relativeTo: .body))
                    .foregroundStyle(Color.textSecondary)
            }
        }
    }

    private func eyebrow(_ lead: DayGlance.Lead, start: Date, end: Date?, now: Date) -> String {
        switch lead {
        case .now: return end.map { "Now · until \(Self.clock.string(from: $0))" } ?? "Now"
        case .next: return "Next · \(Self.clock.string(from: start)) · \(DayGlance.countdown(from: now, to: start))"
        case .first: return "First · \(Self.clock.string(from: start))"
        }
    }
}

// MARK: - To do

/// To do: the open rows, then "4 done" folding the finished ones away.
struct GlanceToDoList: View {
    let items: [TimelineItem]
    let date: Date
    let userId: UUID
    var onOpen: (TimelineItem) -> Void

    @State private var showDone = false

    var body: some View {
        let (open, done) = GlanceToDo.split(items)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("To do").eyebrowStyle().accessibilityAddTraits(.isHeader)
                Spacer()
                if !items.isEmpty {
                    Text(open.isEmpty ? "All done" : "\(open.count) left")
                        .font(.bodySmall)
                        .foregroundStyle(Color.textTertiary)
                }
            }
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }

            if items.isEmpty {
                Text("Nothing on To do.")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textTertiary)
                    .padding(.vertical, 12)
            }
            ForEach(open) { item in
                GlanceRow(item: item, date: date, userId: userId, onOpen: onOpen)
            }
            if !done.isEmpty {
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) { showDone.toggle() }
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(Color.successGreen.opacity(0.85))
                        Text("\(done.count) done")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textSecondary)
                        Spacer()
                        Image(systemName: showDone ? "chevron.down" : "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.textTertiary)
                    }
                    .frame(minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityHint(showDone ? "Folds the finished items away" : "Shows the finished items")
                if showDone {
                    ForEach(done) { item in
                        GlanceRow(item: item, date: date, userId: userId, onOpen: onOpen)
                    }
                    .transition(.opacity)
                }
            }
        }
    }
}

/// The outside screen's one row: circle · title (up to two lines) · the
/// initials of whoever else it's for. Tap the circle to tick it off; tap
/// the title to open it.
struct GlanceRow: View {
    let item: TimelineItem
    let date: Date
    let userId: UUID
    var onOpen: (TimelineItem) -> Void

    @Environment(\.modelContext) private var modelContext
    @Query private var familyMembers: [FamilyMember]
    @State private var checked: Bool

    init(item: TimelineItem, date: Date, userId: UUID, onOpen: @escaping (TimelineItem) -> Void) {
        self.item = item
        self.date = date
        self.userId = userId
        self.onOpen = onOpen
        self._checked = State(initialValue: item.completed)
    }

    var body: some View {
        let me = FamilyMember.current(in: familyMembers, authUserId: userId)?.id
        let others = GlanceToDo.others(item.assignedTo, me: me)
        HStack(spacing: 14) {
            CheckCircle(checked: checked, size: 22, label: item.title) { toggle() }
            Button { onOpen(item) } label: {
                HStack(spacing: 10) {
                    Text(item.title)
                        .font(.bodyLarge)
                        .foregroundStyle(checked ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(checked, color: Color.textTertiary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if !others.isEmpty {
                        AssigneeAvatars(memberIds: others, members: familyMembers, size: 24)
                            .accessibilityHidden(true)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
        .onChange(of: item.completed) { _, now in checked = now }
    }

    private func toggle() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
        withAnimation(.easeInOut(duration: 0.2)) { checked.toggle() }
        ItemCompletion.set(item, completed: checked, modelContext: modelContext, userId: userId, date: date)
    }
}

// MARK: - Dinner

/// Tonight's dinner in one line; tap for the recipe.
struct GlanceDinner: View {
    let dinner: Dinner
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            HStack(spacing: 10) {
                Image(systemName: "fork.knife")
                    .font(.system(size: 14))
                    .foregroundStyle(Color.textTertiary)
                Text("Dinner · \(dinner.title)")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .sheet(isPresented: $open) {
            ScrollView { DinnerCard(dinner: dinner).padding(16) }
                .presentationDetents([.medium])
        }
    }
}

// MARK: - The Tell bar

/// Tell Symphony, with + for a quick add: the outside screen's one control
/// (tapping a circle is Done).
struct GlanceTellBar: View {
    let onTell: () -> Void
    let onAdd: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onTell) {
                HStack(spacing: 10) {
                    Image(systemName: "mic").font(.system(size: 17, weight: .medium))
                    Text("Tell Symphony").font(.bodyLarge).lineLimit(1)
                    Spacer(minLength: 0)
                }
                .frame(maxHeight: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button(action: onAdd) {
                Image(systemName: "plus")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 38, height: 38)
                    .background(Color.white.opacity(0.14), in: Circle())
                    .frame(minWidth: 44, minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Quick add")
        }
        .foregroundStyle(Color.bgBase)
        .padding(.leading, 18)
        .padding(.trailing, 4)
        .frame(height: 52)
        .background(Color.ink, in: Capsule())
        .dynamicTypeSize(...DynamicTypeSize.xLarge)
    }
}
