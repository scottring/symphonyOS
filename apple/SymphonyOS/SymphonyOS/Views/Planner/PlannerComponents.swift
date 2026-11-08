import SwiftUI
import SwiftData

// MARK: - Header

/// The editorial masthead: serif title (a button that opens the horizon
/// switcher when `onTitle` is set), a muted subtitle, and trailing controls.
struct PlannerHeader<Trailing: View>: View {
    let title: String
    let subtitle: String
    var onTitle: (() -> Void)? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .center, spacing: 8) {
                titleBlock
                Spacer(minLength: 4)
                trailing()
            }
            // Large text: stack instead of squeezing the title.
            VStack(alignment: .leading, spacing: 10) {
                titleBlock
                trailing()
            }
        }
    }

    /// Smaller than the old 34pt masthead (Scott, 2026-11-08: "be much more
    /// efficient with our use of space"), so the controls share its line.
    static var titleFont: Font { .custom("CrimsonPro-Regular", size: 28) }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let onTitle {
                Button(action: onTitle) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(title).font(Self.titleFont).foregroundStyle(Color.textPrimary)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.textTertiary)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(title). Switch horizon")
                .accessibilityHint("Today, this week, month, season or year")
            } else {
                Text(title).font(Self.titleFont).foregroundStyle(Color.textPrimary)
                    .accessibilityAddTraits(.isHeader)
            }
            Text(subtitle)
                .font(.bodySmall)
                .foregroundStyle(Color.textTertiary)
        }
    }
}

/// A 32pt circle button (search, ‹, ›) with a 44pt hit area.
struct CircleIconButton: View {
    let systemImage: String
    let label: String
    var active = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(active ? Color.amberStrong : Color.textTertiary)
                .frame(width: 32, height: 32)
                .background(Color.bgSurface, in: Circle())
                .overlay(Circle().strokeBorder(Color.cardBorder, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The life area as one small chip in the header ("All ▾"), not a row of
/// pills under it (Scott, 2026-11-08: space).
struct DomainMenu: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var state = appState
        Menu {
            Picker("Life area", selection: $state.domainFilter) {
                ForEach(DomainFilter.allCases) { Text($0.rawValue).tag($0) }
            }
        } label: {
            HStack(spacing: 3) {
                Text(appState.domainFilter.rawValue).font(.captionBold).lineLimit(1)
                Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
            }
            .fixedSize()
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 10)
            .frame(minHeight: 30)
            .background(Color.bgSurface, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Life area: \(appState.domainFilter.rawValue)")
    }
}

/// The header's ⋯: the page's less-used controls (paper sounds, the Week's
/// list or days), so the header stays one line.
struct PlannerOptionsMenu<Content: View>: View {
    @ViewBuilder var content: () -> Content
    @AppStorage(PaperSound.storageKey) private var soundOn = true

    var body: some View {
        Menu {
            content()
            Toggle(isOn: $soundOn) { Label("Paper sounds", systemImage: "speaker.wave.2") }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Color.textTertiary)
                .frame(width: 32, height: 32)
                .background(Color.bgSurface, in: Circle())
                .overlay(Circle().strokeBorder(Color.cardBorder, lineWidth: 1))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .accessibilityLabel("More options")
    }
}

extension PlannerOptionsMenu where Content == EmptyView {
    init() { self.init { EmptyView() } }
}

// MARK: - Section pieces

struct Eyebrow: View {
    let text: String
    var count: Int? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text).eyebrowStyle().accessibilityAddTraits(.isHeader)
            Spacer()
            if let count {
                Text("\(count)").font(.bodySmall).foregroundStyle(Color.textTertiary)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 14)
        .padding(.bottom, 2)
    }
}

/// One calm line that leads somewhere — "Review 2 unfinished items",
/// "Choose from this week", "September goals and tasks".
struct CalmRow: View {
    let text: String
    var detail: String? = nil
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(text)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let detail {
                    Text(detail)
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.ink)
                        .multilineTextAlignment(.trailing)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.ink)
            }
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
        .padding(.top, 2)
    }
}

// MARK: - Task row

/// A task as a soft card: circle · title (+meta) · dot · avatars · trailing.
/// Tapping the title opens the task.
struct PlanTaskRow<Trailing: View>: View {
    let task: SymphonyTask
    var meta: String? = nil
    /// A ruled line on the sheet instead of a card (the Week's list,
    /// 2026-11-08: the cards' padding wrapped titles to four lines).
    var lined = false
    @ViewBuilder var trailing: () -> Trailing

    @Environment(\.modelContext) private var modelContext
    @Query private var familyMembers: [FamilyMember]
    @State private var showDetail = false

    private var assigned: [UUID] { task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? []) }

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                // Large text: title on its own full-width line, controls below.
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top, spacing: 10) { circle; titleButton }
                    HStack(spacing: 10) {
                        Spacer(minLength: 0)
                        marks
                        trailing()
                    }
                }
            } else {
                HStack(spacing: 10) {
                    circle
                    titleButton
                    marks
                    trailing()
                }
            }
        }
        .padding(.leading, lined ? 0 : 14)
        .padding(.trailing, lined ? 0 : 10)
        .padding(.vertical, lined ? 4 : 8)
        .frame(minHeight: lined ? 44 : 52)
        .background {
            if !lined {
                RoundedRectangle(cornerRadius: 14).fill(Color.bgElevated)
                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
                    .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
            }
        }
        .overlay(alignment: .bottom) { if lined { Rectangle().fill(Paper.rule).frame(height: 1) } }
        .sheet(isPresented: $showDetail) {
            NavigationStack {
                TaskDetailView(task: task)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { showDetail = false } }
                    }
            }
            .presentationDetents([.large, .medium])
        }
    }

    private var circle: some View {
        CheckCircle(checked: task.completed, size: lined ? 22 : 24, label: task.title) {
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            #endif
            // Checking a line off is a pencil tick (paper-style horizons).
            if !task.completed { PaperSound.shared.pencil() }
            TaskViewModel(modelContext: modelContext).toggleComplete(task)
        }
    }

    @ViewBuilder
    private var marks: some View {
        if task.captureStatus == "pending" { ProgressView().controlSize(.small) }
        if task.context != nil { ContextDot(context: task.context) }
        AssigneeAvatars(memberIds: assigned, members: familyMembers, size: 20)
    }

    private var titleButton: some View {
            VStack(alignment: .leading, spacing: 2) {
                    Text(task.title)
                        .font(.bodyMedium)
                        .foregroundStyle(task.completed ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(task.completed)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                    if let meta {
                        Text(meta).font(.bodySmall).foregroundStyle(Color.textTertiary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                // Tap gesture (not a Button) so a swipe across the row never
                // opens the task; still a button to VoiceOver.
                .onTapGesture { showDetail = true }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isButton)
                .accessibilityHint("Opens the task")
                .accessibilityAction { showDetail = true }
    }
}

extension PlanTaskRow where Trailing == EmptyView {
    init(task: SymphonyTask, meta: String? = nil) {
        self.init(task: task, meta: meta) { EmptyView() }
    }
}

// MARK: - Move menu

/// The visible entry point for triage — the same destinations the swipe
/// reveals, plus the less frequent ones.
struct MoveMenuButton: View {
    let title: String
    let onMove: (PlanWriter.Destination) -> Void
    var onPickDate: () -> Void
    var onLifeArea: (() -> Void)? = nil
    var lifeAreaLabel: String? = nil

    var body: some View {
        Menu {
            Button { onMove(.today) } label: { Label("Today", systemImage: "sun.max") }
            Button { onMove(.thisWeek) } label: {
                Label("This week", systemImage: "calendar")
            }
            Button { onMove(.someday) } label: { Label("Someday", systemImage: "archivebox") }
            Divider()
            Button { onMove(.day(PlanCalendar.addDays(Date(), 1), allDay: true)) } label: {
                Label("Tomorrow", systemImage: "sunrise")
            }
            Button(action: onPickDate) { Label("Pick a date…", systemImage: "calendar.badge.plus") }
            if let onLifeArea {
                Button(action: onLifeArea) {
                    Label(lifeAreaLabel.map { "Life area: \($0)" } ?? "Life area…", systemImage: "circle.lefthalf.filled")
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text("Move")
                Image(systemName: "chevron.down").font(.system(size: 10, weight: .bold))
            }
            .font(.bodySmallBold)
            .foregroundStyle(Color.ink)
            .padding(.horizontal, 12)
            .frame(minHeight: 32)
            .background(Color.bgSurface, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .accessibilityLabel("Move \(title)")
    }
}

// MARK: - Loading + top edge

/// "Loading calendar…" — shown only for a day whose events never loaded.
struct CalendarLoadingRow: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text("Loading calendar…").font(.bodySmall).foregroundStyle(Color.textTertiary)
        }
        .accessibilityElement(children: .combine)
    }
}

extension View {
    /// Pages scroll under the status bar; this lays the page's own ivory over
    /// the clock / Dynamic Island strip (with a soft fade below it) so
    /// scrolled text never shows through behind them.
    func statusBarScrim() -> some View {
        // A zero-height top inset whose background reaches up into the
        // status-bar area: it draws above the scrolling content, exactly as
        // tall as the clock / Dynamic Island strip on any device.
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(alignment: .top) {
                    Color.bgBase
                        .ignoresSafeArea(edges: .top)
                        // A short fade so content slides under, not against, it.
                        .overlay(alignment: .bottom) {
                            LinearGradient(colors: [Color.bgBase, Color.bgBase.opacity(0)],
                                           startPoint: .top, endPoint: .bottom)
                                .frame(height: 10)
                                .offset(y: 10)
                        }
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

// MARK: - Toast

struct PlannerToast: View {
    let message: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(spacing: 12) {
            Text(message)
                .font(.bodySmall)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.bodySmallBold).foregroundStyle(Color.primaryLight)
                    .frame(minHeight: 44)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .background(Color.ink, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
    }
}
