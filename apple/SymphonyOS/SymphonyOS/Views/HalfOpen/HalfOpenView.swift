#if os(iOS)
import SwiftUI
import SwiftData

/// The iPhone Duo set down partly open (the approved 2026-11-12 "Duo
/// half-open" mockup): the time and what's on now where you look, To do,
/// tonight's dinner and the Tell bar where you touch. Like a laptop, the
/// upright half looks and the half on the table touches; standing like a
/// book, the left page looks and the right page touches. Cooking takes over
/// both halves until you finish.
struct HalfOpenView: View {
    let posture: DuoPosture

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @State private var viewModel = TimelineViewModel()
    @State private var calendar = GoogleCalendarService.shared
    @State private var dinners = DinnerService.shared
    @State private var today = Date.now
    @State private var opened: TimelineItem?
    @State private var showTell = false
    @State private var showAdd = false

    @Query private var allTasks: [SymphonyTask]
    @Query private var routines: [Routine]
    @Query private var instances: [ActionableInstance]
    @Query private var eventNotes: [EventNote]
    @Query private var focusRows: [TaskFocus]

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var across: Bool { posture == .laptop }

    /// Tonight's dinner, when the view includes family (as on Today).
    private var dinner: Dinner? {
        let context = appState.domainFilter.contextValue
        guard context == nil || context == "family" else { return nil }
        return dinners.dinner(on: today)
    }

    var body: some View {
        GeometryReader { proxy in
            let frame = proxy.frame(in: .global)
            let at = HalfOpen.split(fold: appState.dockLayout.fold, origin: frame.origin, size: frame.size, across: across)
            Group {
                if let cook = appState.cook {
                    CookView(session: cook, across: across, split: at)
                } else if across {
                    VStack(spacing: 0) {
                        look.frame(height: at)
                        touch.frame(maxHeight: .infinity)
                    }
                } else {
                    HStack(spacing: 0) {
                        look.frame(width: at)
                        touch.frame(maxWidth: .infinity)
                    }
                }
            }
        }
        #if DEBUG
        // `-TodaySize 626x890` pins this to a Duo screen's size on any simulator.
        .frame(width: TodayView.pinnedSize?.width, height: TodayView.pinnedSize?.height)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        #endif
        .background(Color.bgBase.ignoresSafeArea())
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        // A display on the table: it stays on while Symphony is open.
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            rebuild()
        }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        .task { await calendar.refresh(today, maxAge: 60) }
        .task(id: PlanCalendar.ymd(today)) { await dinners.refresh(today) }
        // A new day at midnight.
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                if !PlanCalendar.calendar.isDate(today, inSameDayAs: .now) {
                    today = .now
                    rebuild()
                }
            }
        }
        .onChange(of: TimelineRevision.tasks(allTasks)) { _, _ in rebuild() }
        .onChange(of: TimelineRevision.instances(instances)) { _, _ in rebuild() }
        .onChange(of: TimelineRevision.eventNotes(eventNotes)) { _, _ in rebuild() }
        .onChange(of: TimelineRevision.events(calendar.items(for: today))) { _, _ in rebuild() }
        .onChange(of: focusRows.count) { _, _ in rebuild() }
        .onChange(of: appState.domainFilter) { _, _ in rebuild() }
        .sheet(item: $opened) { item in OpenedItemSheet(item: item, date: today, userId: userId) }
        .sheet(isPresented: $showTell) {
            TellSheet(userId: userId).presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showAdd) {
            CaptureSheet(userId: userId).presentationDetents([.medium])
        }
    }

    // MARK: - Where you look

    private var look: some View {
        VStack(alignment: .leading, spacing: 0) {
            TimelineView(.everyMinute) { context in
                VStack(alignment: .leading, spacing: 6) {
                    Text(context.date.formatted(.dateTime.weekday(.wide).day().month(.wide)))
                        .font(.custom("DMSans-Medium", size: 13, relativeTo: .footnote))
                        .textCase(.uppercase)
                        .kerning(1.4)
                        .foregroundStyle(Color.textTertiary)
                    Text(context.date.formatted(.dateTime.hour(.defaultDigits(amPM: .omitted)).minute()))
                        .font(.custom("CrimsonPro-Regular", size: 128, relativeTo: .largeTitle))
                        .kerning(-2)
                        .monospacedDigit()
                        .foregroundStyle(Color.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
                .accessibilityElement(children: .combine)
            }
            Spacer(minLength: 16)
            GlanceNow(items: viewModel.schedule, isToday: true, prominent: true) { opened = $0 }
        }
        .padding(.horizontal, 40)
        .padding(.top, across ? 36 : 32)
        .padding(.bottom, 26)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    // MARK: - Where you touch

    private var touch: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    let carried = CarriedRoutines.select(routines: routines, instances: instances, today: .now,
                                                         domain: appState.domainFilter.contextValue)
                    if !carried.isEmpty {
                        StillToDo(carried: carried, today: .now,
                                  onDone: { settle($0, status: "completed") },
                                  onSkip: { settle($0, status: "skipped") },
                                  plain: true)
                        Color.clear.frame(height: 18)
                    }
                    GlanceToDoList(items: viewModel.forToday, date: today, userId: userId) { opened = $0 }
                    if let dinner {
                        HalfOpenDinner(dinner: dinner) { cook(dinner) }
                            .padding(.top, 18)
                    }
                }
                .padding(.top, across ? 22 : 32)
                .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)
            GlanceTellBar(onTell: { showTell = true }, onAdd: { showAdd = true })
                .padding(.vertical, 12)
        }
        .padding(.horizontal, across ? 28 : 30)
    }

    private func cook(_ dinner: Dinner) {
        withAnimation(.easeInOut(duration: 0.25)) { appState.cook = CookSession(dinner: dinner) }
    }

    private func settle(_ c: CarriedRoutines.Carried, status: String) {
        withAnimation(.easeInOut(duration: 0.2)) {
            PlanWriter(context: modelContext, userId: userId)
                .setOccurrence(entityType: "routine", entityId: c.routine.id.uuidString.lowercased(), on: c.date, status: status)
        }
    }

    private func rebuild() {
        viewModel.buildTimeline(
            tasks: allTasks,
            routines: routines,
            instances: instances,
            date: today,
            domainFilter: appState.domainFilter,
            eventItems: calendar.items(for: today) ?? [],
            eventNotes: eventNotes,
            focus: focusRows,
            userId: auth.currentUser?.id
        )
    }
}

// MARK: - Tonight's dinner

/// Tonight's dinner with Cook: the way into the recipe viewer. A dinner
/// without steps opens its recipe or its page instead.
struct HalfOpenDinner: View {
    let dinner: Dinner
    let onCook: () -> Void
    @State private var showRecipe = false
    @State private var safariURL: URL?

    private var canCook: Bool { !dinner.instructions.isEmpty }

    var body: some View {
        HStack(spacing: 14) {
            photo
            VStack(alignment: .leading, spacing: 2) {
                Text("Tonight").eyebrowStyle()
                Text(dinner.title)
                    .font(.custom("DMSans-Medium", size: 17, relativeTo: .body))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(2)
                if let detail {
                    Text(detail)
                        .font(.bodySmall)
                        .foregroundStyle(Color.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if canCook || dinner.hasRecipe || dinner.sourceURL != nil {
                Button(canCook ? "Cook" : "Recipe", action: open)
                    .font(.custom("DMSans-Medium", size: 15, relativeTo: .body))
                    .foregroundStyle(Color.bgBase)
                    .padding(.horizontal, 18)
                    .frame(minHeight: 44)
                    .background(Color.ink, in: Capsule())
                    .buttonStyle(.plain)
                    .accessibilityHint(canCook ? "Shows the recipe one step at a time" : "Opens the recipe")
            }
        }
        .padding(12)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        .sheet(isPresented: $showRecipe) {
            DinnerRecipeSheet(dinner: dinner).presentationDetents([.large])
        }
        .sheet(item: $safariURL) { url in SafariView(url: url) }
    }

    private var detail: String? {
        var parts: [String] = []
        if let m = dinner.prepMinutes { parts.append("\(m) min") }
        let n = dinner.instructions.count
        if n > 0 { parts.append("\(n) \(n == 1 ? "step" : "steps")") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    private func open() {
        if canCook { onCook() } else if dinner.hasRecipe { showRecipe = true } else { safariURL = dinner.sourceURL }
    }

    @ViewBuilder private var photo: some View {
        Group {
            if let url = dinner.imageURL {
                AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.bgSurface }
            } else {
                Color.bgSurface.overlay(
                    Image(systemName: "fork.knife").font(.system(size: 22)).foregroundStyle(Color.textTertiary)
                )
            }
        }
        .frame(width: 64, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityHidden(true)
    }
}
#endif
