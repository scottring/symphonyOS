import SwiftUI
import SwiftData

/// The Planner tab: one horizon at a time — Today, Week, Month, Season,
/// Year — switched from the serif title rather than a row of tabs.
struct PlannerView: View {
    @Environment(AppState.self) private var appState
    /// Oldest first, as sync and the walk pick the household whose settings the phone follows.
    @Query(sort: \Household.createdAt) private var households: [Household]
    @State private var showHorizons = false
    /// The horizon on screen, a step behind `appState.horizon` so the slide
    /// knows its direction (Scott, 2026-11-07): going down a level (Month to
    /// Week, Week to Today) the page slides in from the right, up from the left.
    @State private var shown: Horizon?
    @State private var goingDown = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let order: [Horizon] = [.today, .week, .month, .season, .year]

    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    var body: some View {
        #if os(iOS)
        // A light household's pages where they are built (`DailyGate`); every other page as before.
        if appState.edition == .light { LightPlannerView { full } } else { full }
        #else
        full
        #endif
    }

    /// The Planner every household has: one horizon at a time, and the switcher.
    private var full: some View {
        ZStack(alignment: .topLeading) {
            Group {
                switch shown ?? appState.horizon {
                case .today:
                    TodayView(onTitle: openSwitcher)
                case .week:
                    WeekPlanView(onTitle: openSwitcher)
                case .month:
                    PeriodPlanView(level: .month, onTitle: openSwitcher)
                case .season:
                    PeriodPlanView(level: .season, onTitle: openSwitcher)
                case .year:
                    PeriodPlanView(level: .year, onTitle: openSwitcher)
                }
            }
            .id(shown ?? appState.horizon)
            .transition(reduceMotion ? .opacity : .asymmetric(
                insertion: .move(edge: goingDown ? .trailing : .leading).combined(with: .opacity),
                removal: .move(edge: goingDown ? .leading : .trailing).combined(with: .opacity)))
            .accessibilityHidden(showHorizons)

            if showHorizons {
                Color.ink.opacity(0.22)
                    .ignoresSafeArea()
                    .onTapGesture { close() }
                    .accessibilityLabel("Close")
                    .accessibilityAddTraits(.isButton)
                switcher
                    .padding(.leading, 16)
                    .padding(.trailing, 56)
                    // Below the title, so it stays visible above the menu.
                    .padding(.top, 104)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .topLeading)))
            }
        }
        .animation(.easeOut(duration: 0.18), value: showHorizons)
        .onAppear { if shown == nil { shown = appState.horizon } }
        .onChange(of: appState.horizon) { old, new in
            goingDown = (Self.order.firstIndex(of: new) ?? 0) < (Self.order.firstIndex(of: old) ?? 0)
            withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.42, dampingFraction: 0.9)) { shown = new }
        }
    }

    private func openSwitcher() { showHorizons = true }
    private func close() { showHorizons = false }

    /// Where a row opens (`WalkPeriods.switcherDate`): in light, every row but the
    /// page on screen opens on the walk's period, so the pages show what it filed.
    private func opensOn(_ h: Horizon) -> Date? {
        WalkPeriods.switcherDate(for: h, viewing: appState.horizon, edition: appState.edition,
                                 now: .now, seasons: seasons)
    }

    private var switcher: some View {
        // Each row names the period it opens on.
        func date(_ h: Horizon) -> Date { opensOn(h) ?? appState.selectedDate }
        let week = PlanCalendar.weekStart(date(.week))
        let month = date(.month)
        let season = PlanCalendar.season(containing: date(.season), boundaries: seasons)
        let year = date(.year)
        return VStack(spacing: 2) {
            option(.today, "Today", Date().formatted(.dateTime.weekday(.wide).month(.wide).day()))
            option(.week, WeekPlanView.title(for: week), WeekPlanView.range(week))
            option(.month, month.formatted(.dateTime.month(.wide)), month.formatted(.dateTime.month(.wide).year()))
            option(.season, season.name, "\(season.start.formatted(.dateTime.month(.abbreviated).day())) – \(season.lastDay.formatted(.dateTime.month(.abbreviated).day()))")
            option(.year, String(PlanCalendar.year(of: year)), "Goals for the year")
        }
        .padding(8)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.ink.opacity(0.18), radius: 16, y: 8)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Planning horizon")
        .accessibilityAddTraits(.isModal)
    }

    private func option(_ h: Horizon, _ name: String, _ sub: String) -> some View {
        let selected = appState.horizon == h
        return Button {
            if let date = opensOn(h) { appState.selectedDate = date }
            appState.horizon = h
            close()
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 1) {
                    Text(name).font(.custom("CrimsonPro-Regular", size: 21, relativeTo: .title3)).foregroundStyle(Color.textPrimary)
                    Text(sub).font(.bodySmall).foregroundStyle(Color.textTertiary)
                }
                Spacer()
                if selected {
                    Image(systemName: "checkmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Color.ink)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(selected ? Color.bgWarm : .clear, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}
