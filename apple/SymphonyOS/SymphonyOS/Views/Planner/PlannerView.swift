import SwiftUI
import SwiftData

/// The Planner tab: one horizon at a time — Today, Week, Month, Season,
/// Year — switched from the serif title rather than a row of tabs.
struct PlannerView: View {
    @Environment(AppState.self) private var appState
    @Query private var households: [Household]
    @State private var showHorizons = false

    private var seasons: [SeasonBoundary]? { households.first?.seasons }

    var body: some View {
        ZStack(alignment: .topLeading) {
            Group {
                switch appState.horizon {
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
                    .padding(.top, 60)
                    .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .topLeading)))
            }
        }
        .animation(.easeOut(duration: 0.18), value: showHorizons)
    }

    private func openSwitcher() { showHorizons = true }
    private func close() { showHorizons = false }

    private var switcher: some View {
        let date = appState.selectedDate
        let week = PlanCalendar.weekStart(date)
        let season = PlanCalendar.season(containing: date, boundaries: seasons)
        return VStack(spacing: 2) {
            option(.today, "Today", Date().formatted(.dateTime.weekday(.wide).month(.wide).day()))
            option(.week, WeekPlanView.title(for: week), WeekPlanView.range(week))
            option(.month, date.formatted(.dateTime.month(.wide)), date.formatted(.dateTime.month(.wide).year()))
            option(.season, season.name, "\(season.start.formatted(.dateTime.month(.abbreviated).day())) – \(season.lastDay.formatted(.dateTime.month(.abbreviated).day()))")
            option(.year, String(PlanCalendar.year(of: date)), "Goals for the year")
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
            if h == .today { appState.goToToday() }
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
